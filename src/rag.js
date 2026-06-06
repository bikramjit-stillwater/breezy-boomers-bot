/**
 * rag.js  — Pure-JSON RAG engine (no external vector DB)
 *
 * Embeddings are stored as flat JSON files under data/vectors/.
 * Similarity search uses cosine similarity in-process.
 * On first run, call buildIndex() to chunk & embed all persona docs.
 * After that, query() retrieves the top-k most relevant chunks.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const VECTORS_DIR = path.join(DATA_DIR, "vectors");
const INDEX_FILE = path.join(VECTORS_DIR, "index.json");
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
// OpenRouter exposes the OpenAI-compatible embeddings endpoint
const EMBED_MODEL = "openai/text-embedding-3-small";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function cosine(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embed(texts, apiKey) {
  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

// ---------------------------------------------------------------------------
// Document chunking
// ---------------------------------------------------------------------------

/**
 * Build a rich text corpus from personas_raw.json.
 * Returns an array of { id, personaName, category, text } objects.
 */
export function buildChunks() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "personas_raw.json"), "utf8")
  );
  const chunks = [];
  let id = 0;

  const SEG_NAMES = [
    "Breezy Boomers",
    "Comfortable Crowd",
    "Founding Faithfuls",
    "Generation Fun",
    "Happy Suburbanites",
    "Modern Families",
    "Urban Hipster",
  ];

  for (const segName of SEG_NAMES) {
    const p = raw.personas[segName];
    if (!p) continue;
    const brands = raw.brand_affinities[segName] || [];

    // 1. Identity / Profile chunk
    chunks.push({
      id: id++,
      personaName: segName,
      category: "profile",
      text: [
        `Persona: ${segName}`,
        `Profile: ${p["Profile"] || ""}`,
        `Consumer Attributes: ${p["Consumer Attributes"] || ""}`,
        `Average Age: ${parseFloat(p["Average Age"] || 0).toFixed(1)}`,
        `Occupation: ${p["Occupation"] || ""}`,
        `Location: ${p["Location"] || ""}`,
        `Relationship: ${p["Relationship"] || ""}`,
        `Lifestyle: ${p["Lifestyle"] || ""}`,
      ]
        .filter((l) => !l.endsWith(": "))
        .join("\n"),
    });

    // 2. Bio / narrative chunk
    if (p["Bio"]) {
      chunks.push({
        id: id++,
        personaName: segName,
        category: "bio",
        text: `Persona: ${segName}\nBio / Narrative:\n${p["Bio"]}`,
      });
    }

    // 3. Voice / About Me chunk
    if (p["About Me"]) {
      chunks.push({
        id: id++,
        personaName: segName,
        category: "voice",
        text: `Persona: ${segName}\nIn their own words (About Me):\n${p["About Me"]}`,
      });
    }

    // 4. Personal attitudes chunk
    if (p["Personal Attitudes"]) {
      chunks.push({
        id: id++,
        personaName: segName,
        category: "attitudes",
        text: `Persona: ${segName}\nPersonal Attitudes & Values:\n${p["Personal Attitudes"]}`,
      });
    }

    // 5. Membership & engagement metrics chunk
    const metrics = [
      `Segment share of members: ${p["% of Members"] ? (parseFloat(p["% of Members"]) * 100).toFixed(1) + "%" : "N/A"}`,
      `Churn propensity: ${p["Churn Propensity"] || "N/A"}`,
      `Engagement score: ${p["Engagement Score"] || "N/A"}`,
      `Membership index: ${p["2024 Membership Index Score"] || "N/A"}`,
      `Average tenure index: ${p["Average Years Tenure Index Score"] || "N/A"}`,
      `2025 Attendance index: ${p["2025 Attendance Index Score"] || "N/A"}`,
      `MCC index: ${p["2025 MCC Index Score"] || "N/A"}`,
      `Non-access index: ${p["2025 Non-Access Index Score"] || "N/A"}`,
      `Zero game attendance index: ${p["2025 Attendance 0 games Index Score"] || "N/A"}`,
      `1-4 games index: ${p["2025 Attendance 1-4 Games Index Score"] || "N/A"}`,
      `5-8 games index: ${p["2025 Attendance 5 - 8 games Index Score"] || "N/A"}`,
    ];
    chunks.push({
      id: id++,
      personaName: segName,
      category: "membership_metrics",
      text: `Persona: ${segName}\nMembership & Engagement Metrics:\n${metrics.join("\n")}`,
    });

    // 6. Spending & media chunk
    chunks.push({
      id: id++,
      personaName: segName,
      category: "spending_media",
      text: [
        `Persona: ${segName}`,
        `High Spend Categories: ${p["High Spend Categories"] || ""}`,
        `Media Index Scores: ${p["Media Index Scores"] || ""}`,
      ]
        .filter((l) => !l.endsWith(": "))
        .join("\n"),
    });

    // 7. Top brand affinities chunk
    if (brands.length > 0) {
      const brandList = brands
        .map((b) => `${b.brand} (${b.index})`)
        .join(", ");
      chunks.push({
        id: id++,
        personaName: segName,
        category: "brand_affinities",
        text: `Persona: ${segName}\nTop Over-Indexed Brands (spend propensity vs population):\n${brandList}`,
      });
    }
  }

  // 8. Cross-segment comparison chunk
  const overviewParts = SEG_NAMES.map((n) => {
    const p = raw.personas[n];
    if (!p) return "";
    const share = p["% of Members"]
      ? (parseFloat(p["% of Members"]) * 100).toFixed(1) + "%"
      : "N/A";
    return `${n}: ${share} of members, avg age ${parseFloat(p["Average Age"] || 0).toFixed(0)}, churn ${p["Churn Propensity"] || "N/A"}`;
  });
  chunks.push({
    id: id++,
    personaName: "All Segments",
    category: "overview",
    text: `Fremantle Dockers Membership Segment Overview:\n${overviewParts.join("\n")}`,
  });

  return chunks;
}

// ---------------------------------------------------------------------------
// Index build & persist
// ---------------------------------------------------------------------------

export async function buildIndex(apiKey) {
  console.log("Building RAG index…");
  if (!fs.existsSync(VECTORS_DIR)) fs.mkdirSync(VECTORS_DIR, { recursive: true });

  const chunks = buildChunks();
  console.log(`  ${chunks.length} chunks to embed`);

  // Embed in batches of 20
  const BATCH = 20;
  const allVectors = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const texts = batch.map((c) => c.text);
    process.stdout.write(`  Embedding batch ${Math.floor(i / BATCH) + 1}…`);
    const vecs = await embed(texts, apiKey);
    allVectors.push(...vecs);
    console.log(" done");
  }

  const index = chunks.map((c, i) => ({ ...c, vector: allVectors[i] }));
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index));
  console.log(`Index saved to ${INDEX_FILE} (${index.length} entries)`);
  return index;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

let _index = null;

function loadIndex() {
  if (_index) return _index;
  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error(
      "RAG index not found. Run: npm run build-index  first."
    );
  }
  _index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  return _index;
}

/**
 * Retrieve top-k relevant chunks for a query string.
 * Returns array of { personaName, category, text, score }.
 */
export async function retrieve(query, apiKey, topK = 5) {
  const index = loadIndex();
  const [qVec] = await embed([query], apiKey);
  const scored = index.map((entry) => ({
    personaName: entry.personaName,
    category: entry.category,
    text: entry.text,
    score: cosine(qVec, entry.vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export function indexExists() {
  return fs.existsSync(INDEX_FILE);
}
