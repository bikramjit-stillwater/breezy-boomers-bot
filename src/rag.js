/**
 * rag.js — Pure-JSON RAG engine for the Breezy Boomers persona.
 *
 * No vector database. Embeddings live in data/vectors/index.json and
 * similarity search runs in-process via cosine similarity.
 *
 * Corpus = the `knowledge` sections + the persona slide texts (13-20) from
 * data/breezy_boomers.json, which was extracted 1:1 from the source Excel
 * and PowerPoint.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const DATASET = path.join(DATA_DIR, "breezy_boomers.json");
const VECTORS_DIR = path.join(DATA_DIR, "vectors");
const INDEX_FILE = path.join(VECTORS_DIR, "index.json");

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const EMBED_MODEL = "openai/text-embedding-3-small";

// ---------------------------------------------------------------------------
let _dataset = null;
export function loadDataset() {
  if (_dataset) return _dataset;
  _dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));
  return _dataset;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed(texts, apiKey) {
  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`Embedding API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

// ---------------------------------------------------------------------------
// Build the corpus of text chunks to embed.
// ---------------------------------------------------------------------------
export function buildChunks() {
  const ds = loadDataset();
  const chunks = [];

  // 1. Distilled knowledge sections (identity, bio, attitudes, metrics, comms,
  //    merchandise, lifestyle, media, buying, commercial value, spend matrix…)
  for (const k of ds.knowledge) {
    chunks.push({
      id: `k${k.id}`,
      category: k.category,
      title: k.title,
      text: `${k.title}\n${k.text}`,
    });
  }

  // 2. Verbatim persona-deck slides (13-20) as a safety net so any detail
  //    phrased differently is still retrievable.
  for (const s of ds.raw_slides || []) {
    if (s.slide >= 13 && s.slide <= 20) {
      chunks.push({
        id: `slide${s.slide}`,
        category: "slide",
        title: `Persona deck slide ${s.slide}`,
        text: s.text,
      });
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
export async function buildIndex(apiKey) {
  if (!fs.existsSync(VECTORS_DIR)) fs.mkdirSync(VECTORS_DIR, { recursive: true });
  const chunks = buildChunks();
  console.log(`Embedding ${chunks.length} chunks…`);

  const BATCH = 20;
  const vectors = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vecs = await embed(batch.map((c) => c.text), apiKey);
    vectors.push(...vecs);
    console.log(`  embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }
  const index = chunks.map((c, i) => ({ ...c, vector: vectors[i] }));
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index));
  console.log(`Saved index → ${INDEX_FILE} (${index.length} entries)`);
  return index;
}

let _index = null;
function loadIndex() {
  if (_index) return _index;
  if (!fs.existsSync(INDEX_FILE)) throw new Error("RAG index not found. Run: npm run build-index");
  _index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  return _index;
}

export async function retrieve(query, apiKey, topK = 6) {
  const index = loadIndex();
  const [q] = await embed([query], apiKey);
  return index
    .map((e) => ({ title: e.title, category: e.category, text: e.text, score: cosine(q, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function indexExists() {
  return fs.existsSync(INDEX_FILE);
}

// ---------------------------------------------------------------------------
// Authoritative persona snapshot injected into every prompt so the bot is
// always grounded in Robert & Susan, regardless of what RAG retrieves.
// ---------------------------------------------------------------------------
export function getPersonaProfile() {
  const ds = loadDataset();
  const p = ds.profile || {};
  const g = (k) => p[k] || "";
  const num = (k) => { const n = parseFloat(p[k]); return isNaN(n) ? null : n; };
  const age = num("Average Age") ? Math.round(num("Average Age")) : g("Average Age");
  const ses = num("Average SES") ? Math.round(num("Average SES") * 100) : g("Average SES");
  const share = num("% of Members") ? Math.round(num("% of Members") * 100) + "%" : g("% of Members");
  const topBrands = [];
  for (const [cat, brands] of Object.entries(ds.spend_propensity || {})) {
    for (const [b, idx] of Object.entries(brands)) {
      const n = parseFloat(String(idx).replace("x", ""));
      if (!isNaN(n) && n >= 1.5) topBrands.push(`${b} (${idx})`);
    }
  }

  return [
    "PERSONA: Breezy Boomers — you are a representative member (Robert, or his wife Susan).",
    "",
    "WHO YOU ARE (things you naturally know about yourself)",
    `- Retired or semi-retired, 65+, comfortable and financially secure (super and investments; mortgage-free).`,
    `- Live in a low-maintenance townhouse in an inner-urban area; your kids are grown adults who've left home.`,
    `- A proud 20+ year Fremantle member with a reserved seat; you get to a fair number of home games each season (roughly six to nine).`,
    `- You auto-renew without really thinking about it and can't imagine supporting another club.`,
    `- You look for good quality at a fair price, are cautious with new technology, and lean on traditional media (TV, the print paper, radio) more than social apps.`,
    `- You enjoy the finer things — good food and wine, galleries and theatre.`,
    "",
    "LIGHT BACKGROUND COLOUR (use sparingly — most answers should NOT mention these)",
    `- Robert comes from a big Italian family and enjoys family lunches (a favourite spot is La Sosta).`,
    `- You and Susan are regular visitors to Perth's Cultural Centre, galleries and the theatre.`,
    `- Other interests: ${g("Lifestyle Interests")}.`,
    "",
    "YOUR VOICE (speak naturally like this — do NOT quote these lines verbatim)",
    g("About Me"),
    "",
    "VALUES (background guardrails only — never recite word-for-word)",
    g("Personal Attitudes"),
    "",
    "SEGMENT RESEARCH DATA — analyst figures only. In the member/persona voice these are NOT things you'd know about yourself; do not quote these numbers. (The analyst mode may cite them.)",
    `- Largest segment: ${share} of Fremantle members; ~97% in WA; mostly male; average age ${age}; SES ${ses}/100.`,
    `- Average tenure 16.9 years; churn 10% (lowest of all segments vs 22% club baseline); Season Reserved Seat 56%.`,
    `- Lifetime value avg $13,450 (median $10,450); annual membership spend avg $586; Fan Passion Score 7.0; engagement ${g("Engagement Score")}; merchandise spend slightly below average.`,
    `- Media profile: ${g("Media Exposure")}; social platforms: ${g("Social Platforms")}.`,
    `- Buying: ${g("Buying Intentions")}; buys for ${g("Buying Behaviour")}; high spend on ${g("High Spend Categories")}.`,
    topBrands.length ? `- Over-indexed brands (treat category-level signal as more reliable than individual brands, which are noisy): ${topBrands.slice(0, 20).join(", ")}.` : "",
  ].filter((l) => l !== "").join("\n");
}
