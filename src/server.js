/**
 * server.js — Express HTTP server
 *
 * Endpoints:
 *   POST /chat          — single-turn or multi-turn chat (JSON)
 *   POST /chat/stream   — streaming SSE response
 *   POST /reset         — clear session history
 *   GET  /health        — health check
 *   GET  /personas      — list available personas
 *
 * Multi-turn sessions are keyed by sessionId (passed in request body).
 * Sessions are in-memory only — they reset on server restart.
 */

import express from "express";
import { BreezyBot } from "./chatbot.js";
import { buildIndex, indexExists } from "./rag.js";
import "dotenv/config";

const app = express();
app.use(express.json());

// CORS — allow all origins in dev (tighten in production)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------
const sessions = new Map(); // sessionId → BreezyBot instance

function getBot(sessionId = "default", persona = "Breezy Boomers", mode = "auto") {
  if (!sessions.has(sessionId)) {
    sessions.set(
      sessionId,
      new BreezyBot({
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.MODEL || "anthropic/claude-sonnet-4-5",
        mode,
        personaName: persona,
        siteUrl: process.env.SITE_URL || "",
        siteName: process.env.SITE_NAME || "BreezyBoomersBot",
      })
    );
  }
  return sessions.get(sessionId);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    indexReady: indexExists(),
    model: process.env.MODEL || "anthropic/claude-sonnet-4-5",
    sessions: sessions.size,
  });
});

app.get("/personas", (req, res) => {
  res.json({
    personas: [
      "Breezy Boomers",
      "Comfortable Crowd",
      "Founding Faithfuls",
      "Generation Fun",
      "Happy Suburbanites",
      "Modern Families",
      "Urban Hipster",
    ],
    modes: ["auto", "persona", "analyst"],
  });
});

/**
 * POST /chat
 * Body: { message, sessionId?, persona?, mode? }
 * Returns: { reply, sessionId }
 */
app.post("/chat", async (req, res) => {
  const { message, sessionId = "default", persona = "Breezy Boomers", mode = "auto" } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  try {
    const bot = getBot(sessionId, persona, mode);
    const reply = await bot.chat(message);
    res.json({ reply, sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /chat/stream
 * Body: { message, sessionId?, persona?, mode? }
 * Returns: SSE stream of { token } events, ending with { done: true }
 */
app.post("/chat/stream", async (req, res) => {
  const { message, sessionId = "default", persona = "Breezy Boomers", mode = "auto" } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const bot = getBot(sessionId, persona, mode);
    await bot.chat(message, {
      stream: true,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      },
    });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

/**
 * POST /reset
 * Body: { sessionId? }
 * Clears conversation history for the session.
 */
app.post("/reset", (req, res) => {
  const { sessionId = "default" } = req.body;
  if (sessions.has(sessionId)) {
    sessions.get(sessionId).resetHistory();
    res.json({ ok: true, sessionId });
  } else {
    res.json({ ok: true, sessionId, note: "session did not exist" });
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
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
    console.log("✅  Index ready.");
  }

  app.listen(PORT, () => {
    console.log(`\n🏉  Breezy Boomers Bot server running on http://localhost:${PORT}`);
    console.log(`   POST /chat          — non-streaming chat`);
    console.log(`   POST /chat/stream   — SSE streaming chat`);
    console.log(`   GET  /health        — health check`);
    console.log(`   GET  /personas      — list personas\n`);
  });
}

boot().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
