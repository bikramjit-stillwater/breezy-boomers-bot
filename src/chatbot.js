/**
 * chatbot.js — BreezyBot orchestrator.
 * retrieve() → getPersonaProfile() → buildSystemPrompt() → OpenRouter.
 * Keeps per-instance conversation history for multi-turn chats.
 */
import { retrieve, indexExists, getPersonaProfile } from "./rag.js";
import { buildSystemPrompt, detectMode, mentionsOtherSegment } from "./prompts.js";
import { chatComplete, chatStream } from "./openrouter.js";

export class BreezyBot {
  constructor({ apiKey, model = "anthropic/claude-sonnet-4-5", topK = 6, mode = "auto", siteUrl = "", siteName = "" }) {
    this.apiKey = apiKey;
    this.model = model;
    this.topK = topK;
    this.mode = mode;
    this.siteUrl = siteUrl;
    this.siteName = siteName;
    this.history = [];
  }

  resetHistory() { this.history = []; }

  async chat(userMessage, { stream = false, onToken, onMeta, speaker = "male" } = {}) {
    if (!indexExists()) throw new Error("RAG index not built. Run: npm run build-index");

    const resolvedMode = this.mode === "auto" ? detectMode(userMessage) : this.mode;

    // Retrieve grounding context + the fixed persona snapshot.
    const chunks = await retrieve(userMessage, this.apiKey, this.topK);
    const snapshot = getPersonaProfile();
    const systemPrompt = buildSystemPrompt(resolvedMode, chunks.map((c) => c.text), snapshot, speaker);

    // Surface the evidence that grounds this answer (for the UI's live drawer).
    const evidence = chunks.map((c) => ({
      title: c.title,
      category: c.category,
      score: Math.round((c.score || 0) * 100),
      snippet: String(c.text || "").replace(/\s+/g, " ").trim().slice(0, 300),
    }));
    if (onMeta) onMeta({ mode: resolvedMode, evidence });
    this.lastEvidence = evidence;
    this.lastMode = resolvedMode;

    this.history.push({ role: "user", content: userMessage });

    const args = {
      apiKey: this.apiKey, model: this.model, messages: this.history,
      systemPrompt, siteUrl: this.siteUrl, siteName: this.siteName,
    };
    const reply = stream
      ? await chatStream({ ...args, onToken: onToken || ((t) => process.stdout.write(t)) })
      : await chatComplete(args);

    this.history.push({ role: "assistant", content: reply });
    return reply;
  }
}

export { mentionsOtherSegment };
