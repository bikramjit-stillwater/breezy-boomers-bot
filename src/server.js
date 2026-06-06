/**
 * server.js — Express HTTP server + browser chat UI for the Breezy Boomers bot.
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
import { BreezyBot } from "./chatbot.js";
import { buildIndex, indexExists } from "./rag.js";
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
    sessions.set(sessionId, new BreezyBot({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.MODEL || "anthropic/claude-sonnet-4-5",
      mode,
      siteUrl: process.env.SITE_URL || "",
      siteName: process.env.SITE_NAME || "BreezyBoomersBot",
    }));
  }
  const bot = sessions.get(sessionId);
  bot.mode = mode;
  return bot;
}

app.get("/health", (req, res) =>
  res.json({ status: "ok", persona: "Breezy Boomers", indexReady: indexExists(), sessions: sessions.size }));

app.post("/chat", async (req, res) => {
  const { message, sessionId = "default", mode = "auto" } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });
  try {
    const reply = await getBot(sessionId, mode).chat(message);
    res.json({ reply, sessionId });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post("/chat/stream", async (req, res) => {
  const { message, sessionId = "default", mode = "auto" } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  try {
    await getBot(sessionId, mode).chat(message, {
      stream: true,
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
  app.listen(PORT, () => console.log(`\n🏉  Breezy Boomers Bot running on http://localhost:${PORT}\n`));
}
boot().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
