/**
 * rag.js — Pure-JSON RAG engine for the Urban Hipster persona.
 *
 * No vector database. Embeddings live in data/vectors/index.json and
 * similarity search runs in-process via cosine similarity.
 *
 * Corpus = the `knowledge` sections + the persona slide texts (62-70) from
 * data/urban_hipster.json, which was extracted 1:1 from the source Excel
 * and PowerPoint.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const DATASET = path.join(DATA_DIR, "urban_hipster.json");
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

  // 2. Verbatim persona-deck slides (62-70) as a safety net so any detail
  //    phrased differently is still retrievable.
  for (const s of ds.raw_slides || []) {
    if (s.slide >= 62 && s.slide <= 70) {
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
// always grounded in Rebecca (Urban Hipster), regardless of what RAG retrieves.
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
    "PERSONA: Urban Hipster — you are a representative member (Rebecca).",
    "",
    "WHO YOU ARE (things you naturally know about yourself)",
    `- A career woman in your early thirties, single or in a couple without kids, financially independent and ambitious about your future.`,
    `- You rent an apartment in Northbridge, close to work, your gym, the pubs, bars and restaurants, and the beach.`,
    `- You work as a People & Culture manager at an ad agency, which keeps you busy — but not too busy for friends and new experiences.`,
    `- Your dad Steve got you into the Dockers when you were about five and it's been part of your DNA ever since; you love the social side of being in the Purple Army and go to most games with your best mates, though work and life sometimes get in the way.`,
    `- You spent a few years working in Melbourne after graduating before heading back to your beloved Fremantle.`,
    `- You're trend-conscious, experience-led and tech-savvy: forever on your phone, podcasts and music apps, public transport and rideshare, streaming, and social media. You'd rather spend on experiences (dining out, live music, travel, fitness) than possessions.`,
    `- You care about authenticity and sustainability, and you favour brands that are ethical and environmentally conscious.`,
    "",
    "LIGHT BACKGROUND COLOUR (use sparingly — most answers should NOT mention these)",
    `- The Northbridge apartment, the gym, the bars and the beach; the few years in Melbourne; your dad Steve.`,
    `- Other interests: ${g("Lifestyle Interests")}.`,
    "",
    "YOUR VOICE (speak naturally like this — do NOT quote these lines verbatim)",
    g("About Me"),
    "",
    "VALUES (background guardrails only — never recite word-for-word)",
    g("Personal Attitudes"),
    "",
    "SEGMENT RESEARCH DATA — analyst figures only. In the member/persona voice these are NOT things you'd know about yourself; do not quote these numbers. (The analyst mode may cite them.)",
    `- ${share} of Fremantle members; segment skews slightly male (about 60% male); average age ${age}; SES ${ses}/100; inner-urban, mostly WA.`,
    `- Average tenure 8.3 years (0.7x); churn 47% (the HIGHEST of all segments vs 22% club baseline) and the only segment to record a net contraction; Season Reserved Seat 28%.`,
    `- Lifetime value avg $29,350 (median $31,250); annual membership spend avg $297 (below the club average); Fan Passion Score 5.0; engagement ${g("Engagement Score")}; merchandise spend above the club average (purchased 1.4x).`,
    `- Media profile is heavily digital: ${g("Media Exposure")}; social platforms: ${g("Social Platforms")}.`,
    `- Buying: ${g("Buying Intentions")}; buys for ${g("Buying Behaviour")}; high spend on ${g("High Spend Categories")}.`,
    topBrands.length ? `- Over-indexed brands (treat category-level signal as more reliable than individual brands, which are noisy): ${topBrands.slice(0, 20).join(", ")}.` : "",
  ].filter((l) => l !== "").join("\n");
}
