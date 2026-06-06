/**
 * chatbot.js — Main chatbot class
 *
 * Wires together: retrieve() → buildSystemPrompt() → chatComplete()
 * Maintains conversation history for multi-turn sessions.
 */

import { retrieve, indexExists, getPersonaProfile } from "./rag.js";
import { buildSystemPrompt, detectMode } from "./prompts.js";
import { chatComplete, chatStream } from "./openrouter.js";

export class BreezyBot {
  /**
   * @param {object} config
   * @param {string} config.apiKey       OpenRouter API key
   * @param {string} [config.model]      Default: anthropic/claude-sonnet-4-5
   * @param {number} [config.topK]       RAG top-k chunks to retrieve (default 5)
   * @param {string} [config.mode]       "auto" | "persona" | "analyst"
   * @param {string} [config.personaName] Which persona to embody (default: Breezy Boomers)
   * @param {string} [config.siteUrl]
   * @param {string} [config.siteName]
   */
  constructor({
    apiKey,
    model = "anthropic/claude-sonnet-4-5",
    topK = 5,
    mode = "auto",
    personaName = "Breezy Boomers",
    siteUrl = "",
    siteName = "",
  }) {
    this.apiKey = apiKey;
    this.model = model;
    this.topK = topK;
    this.mode = mode;
    this.personaName = personaName;
    this.siteUrl = siteUrl;
    this.siteName = siteName;
    /** @type {Array<{role:string, content:string}>} */
    this.history = [];
  }

  /** Reset conversation history (start fresh) */
  resetHistory() {
    this.history = [];
  }

  /**
   * Send a user message and get a reply.
   * @param {string} userMessage
   * @param {object} [opts]
   * @param {boolean} [opts.stream]       Stream tokens to stdout
   * @param {Function} [opts.onToken]     Called with each streamed token
   * @returns {Promise<string>}           Full reply text
   */
  async chat(userMessage, { stream = false, onToken } = {}) {
    if (!indexExists()) {
      throw new Error(
        "RAG index not built yet. Run: npm run build-index\n" +
          "This only needs to be done once."
      );
    }

    // 1. Determine mode (auto-detect or explicit)
    const resolvedMode =
      this.mode === "auto" ? detectMode(userMessage) : this.mode;

    // 2. Retrieve relevant context chunks.
    //    In persona mode, restrict retrieval to the selected persona so the
    //    bot only sees its own segment's data.
    const personaFilter = resolvedMode === "persona" ? this.personaName : null;
    const chunks = await retrieve(userMessage, this.apiKey, this.topK, personaFilter);
    const contextTexts = chunks.map((c) => c.text);

    // 3. Build system prompt. In persona mode, ground it in the selected
    //    persona's real data snapshot (not a hardcoded one).
    const personaSnapshot =
      resolvedMode === "persona" ? getPersonaProfile(this.personaName) : null;
    const systemPrompt = buildSystemPrompt(
      resolvedMode,
      contextTexts,
      this.personaName,
      personaSnapshot
    );

    // 4. Append user message to history
    this.history.push({ role: "user", content: userMessage });

    // 5. Call LLM
    let reply;
    if (stream) {
      reply = await chatStream({
        apiKey: this.apiKey,
        model: this.model,
        messages: this.history,
        systemPrompt,
        siteUrl: this.siteUrl,
        siteName: this.siteName,
        onToken: onToken || ((t) => process.stdout.write(t)),
      });
    } else {
      reply = await chatComplete({
        apiKey: this.apiKey,
        model: this.model,
        messages: this.history,
        systemPrompt,
        siteUrl: this.siteUrl,
        siteName: this.siteName,
      });
    }

    // 6. Append assistant reply to history
    this.history.push({ role: "assistant", content: reply });

    return reply;
  }

  /**
   * Run the 10 interview questions in sequence and return all answers.
   * Useful for batch testing / generating synthetic research output.
   */
  async runInterviewQuestions() {
    const questions = [
      "What type of membership do you hold, and why did you choose it?",
      "How often do you attend games in person versus following from home?",
      "How much do you typically spend on club merchandise each season?",
      "What would make you upgrade to a higher membership tier or hospitality package?",
      "How do you feel about the price of your membership and whether it is worth it?",
      "What stops you from attending more games in person?",
      "What club merchandise do you own, and what would you love to see us offer?",
      "When it is time to renew, what makes that decision easy or hard for you?",
      "What are you planning to buy from the club in the coming season?",
      "Who do you usually come to the footy with, and would you bring more people if we made it easier?",
    ];

    const results = [];
    for (const q of questions) {
      console.log(`\nQ: ${q}`);
      const answer = await this.chat(q, { stream: true });
      console.log("\n");
      results.push({ question: q, answer });
    }
    return results;
  }
}
