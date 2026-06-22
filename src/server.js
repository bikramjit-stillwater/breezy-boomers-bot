/**
 * server.js — Express HTTP server + browser chat UI for the Urban Hipster bot.
 *
 *   GET  /            web chat UI
 *   POST /chat        { message, sessionId?, mode? } -> { reply }
 *   POST /chat/stream SSE stream of { token } then { done }
 *   POST /reset       { sessionId }
 *   GET  /health      status + index readiness
 */
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { UrbanHipsterBot } from "./chatbot.js";
import { buildIndex, indexExists, loadDataset } from "./rag.js";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const sessions = new Map();
function getBot(sessionId = "default", mode = "auto") {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new UrbanHipsterBot({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.MODEL || "anthropic/claude-sonnet-4-5",
      mode,
      siteUrl: process.env.SITE_URL || "",
      siteName: process.env.SITE_NAME || "UrbanHipsterBot",
    }));
  }
  const bot = sessions.get(sessionId);
  bot.mode = mode;
  return bot;
}

app.get("/health", (req, res) =>
  res.json({ status: "ok", persona: "Urban Hipster", indexReady: indexExists(), sessions: sessions.size }));

// Persona card + segment snapshot for the side panels — derived from the real
// dataset so the numbers always match source (and never need to be recited in chat).
function buildPersonaCard() {
  const ds = loadDataset();
  const p = ds.profile || {};
  const pct = (k, d = 0) => { const n = parseFloat(p[k]); return isNaN(n) ? null : Math.round(n * 100 * 10 ** d) / 10 ** d; };
  const age = Math.round(parseFloat(p["Average Age"]) || 32);

  // Media skew (over / under-indexed channels) parsed from the 20-channel chart.
  const mediaChart = (ds.charts || []).find((c) => c.slide === 69);
  let mediaUp = [], mediaDown = [];
  if (mediaChart) {
    const pts = [...mediaChart.points].sort((a, b) => b.value - a.value);
    mediaUp = pts.slice(0, 4).map((x) => ({ label: x.label, value: `+${Math.round(x.value)}` }));
    mediaDown = pts.slice(-4).reverse().map((x) => ({ label: x.label, value: `${Math.round(x.value)}` }));
  }

  return {
    name: "Rebecca",
    segment: "Urban Hipster",
    voiceLine: "I'm Rebecca — part of the Purple Army.",
    meta: `Northbridge, WA · ${age} · P&C manager`,
    bio: "Fremantle born and bred, introduced to the Dockers by her dad Steve. A career-driven People & Culture manager renting in Northbridge near work, the gym, the bars and the beach. Trend-conscious, experience-led and tech-savvy — loves the social side of the Purple Army when work and life allow.",
    traits: ["Trend-conscious", "Experience-seeker", "Socially active", "Career-driven",
      "Sustainability-oriented", "Tech-savvy", "Urban lifestyle", "Authenticity-focused"],
    stats: [
      { label: "Share of members", value: "13%" },
      { label: "LTV median", value: "$31,250" },
      { label: "Tenure", value: "8.3 yrs" },
      { label: "Fan passion", value: "5.0" },
    ],
    snapshot: {
      "Membership": [
        { label: "Share of members", value: "13%", note: "most dynamic segment" },
        { label: "Churn", value: "High (47%)", note: "highest of all; vs 22% baseline" },
        { label: "Avg tenure", value: "8.3 yrs", note: "0.7x club avg" },
        { label: "Reserved seat", value: "28%", note: "top membership type" },
        { label: "Attendance", value: "4–7 games", note: "2025 season" },
      ],
      "Value & passion": [
        { label: "LTV avg / median", value: "$29,350 / $31,250" },
        { label: "Annual spend", value: "$297 avg", note: "below $442 club" },
        { label: "Fan Passion Score", value: "5.0" },
        { label: "Engagement", value: "Low–Moderate" },
      ],
      "Media skew (index)": [...mediaUp, ...mediaDown],
    },
  };
}

app.get("/persona", (req, res) => {
  try { res.json(buildPersonaCard()); }
  catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post("/chat", async (req, res) => {
  const { message, sessionId = "default", mode = "auto", speaker = "female" } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });
  try {
    let meta = null;
    const reply = await getBot(sessionId, mode).chat(message, { speaker, onMeta: (m) => { meta = m; } });
    res.json({ reply, sessionId, mode: meta?.mode, evidence: meta?.evidence || [] });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post("/chat/stream", async (req, res) => {
  const { message, sessionId = "default", mode = "auto", speaker = "female" } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  try {
    await getBot(sessionId, mode).chat(message, {
      stream: true, speaker,
      onMeta: (m) => res.write(`data: ${JSON.stringify({ meta: m })}\n\n`),
      onToken: (token) => res.write(`data: ${JSON.stringify({ token })}\n\n`),
    });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

app.post("/reset", (req, res) => {
  const { sessionId = "default" } = req.body;
  if (sessions.has(sessionId)) sessions.get(sessionId).resetHistory();
  res.json({ ok: true, sessionId });
});

const PORT = process.env.PORT || 3000;
async function boot() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    console.error("❌  OPENROUTER_API_KEY not set in .env");
    process.exit(1);
  }
  if (!indexExists()) {
    console.log("📦  Building RAG index (one-time setup)…");
    await buildIndex(apiKey);
  }
  app.listen(PORT, () => console.log(`\n🏉  Urban Hipster Bot running on http://localhost:${PORT}\n`));
}
boot().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
