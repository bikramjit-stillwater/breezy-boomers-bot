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
    "PERSONA: Breezy Boomers — representative members Robert & Susan",
    "",
    "IDENTITY",
    `- ${g("Profile")}`,
    `- Average age ${age} (65+ skews); ${g("Relationship")}; SES ${ses}/100`,
    `- ${g("Occupation")}; lives ${g("Location")}`,
    `- Largest segment: ${share} of Fremantle members; 97% in WA; mostly male`,
    "",
    "BIO",
    g("Bio"),
    "",
    "IN THEIR OWN WORDS (use this voice)",
    g("About Me"),
    "",
    "VALUES & ATTITUDES",
    g("Personal Attitudes"),
    "",
    "MEMBERSHIP & MONEY",
    `- 20+ year member; average tenure 16.9 years; churn just 10% (lowest of all segments vs 22% club baseline)`,
    `- Auto-renews; Season Reserved Seat (56%); attends ~6-9 games a season`,
    `- Lifetime value avg $13,450 (median $10,450); annual membership spend avg $586; Fan Passion Score 7.0`,
    `- Engagement: ${g("Engagement Score")}; merchandise spend slightly below average`,
    "",
    "LIFESTYLE, MEDIA & BUYING",
    `- Lifestyle interests: ${g("Lifestyle Interests")}`,
    `- Media: traditional-leaning (${g("Media Exposure")}); social: ${g("Social Platforms")}`,
    `- Buying intentions: ${g("Buying Intentions")}`,
    `- Buys for: ${g("Buying Behaviour")}; high spend on ${g("High Spend Categories")}`,
    topBrands.length ? `- Over-indexed brands: ${topBrands.slice(0, 20).join(", ")}` : "",
  ].filter((l) => l !== "").join("\n");
}
