#!/usr/bin/env node
/**
 * cli.js — Interactive terminal chatbot
 *
 * Usage:
 *   npm run chat
 *   node src/cli.js
 *   node src/cli.js --mode analyst
 *   node src/cli.js --persona "Founding Faithfuls"
 *   node src/cli.js --interview    (runs all 10 questions automatically)
 */

import readline from "readline";
import { BreezyBot } from "./chatbot.js";
import { buildIndex, indexExists } from "./rag.js";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const modeArg =
  args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "auto";
const personaArg =
  args.includes("--persona") ? args[args.indexOf("--persona") + 1] : "Breezy Boomers";
const doInterview = args.includes("--interview");

// ---------------------------------------------------------------------------
// Validate env
// ---------------------------------------------------------------------------
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey || apiKey === "your_openrouter_api_key_here") {
  console.error(
    "\n❌  OPENROUTER_API_KEY not set.\n" +
      "   1. Copy .env.example to .env\n" +
      "   2. Add your OpenRouter key\n" +
      "   3. Run again.\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Auto-build index on first run
// ---------------------------------------------------------------------------
async function ensureIndex() {
  if (!indexExists()) {
    console.log("\n📦  RAG index not found — building now (one-time setup)…");
    await buildIndex(apiKey);
    console.log("✅  Index built.\n");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  await ensureIndex();

  const bot = new BreezyBot({
    apiKey,
    model: process.env.MODEL || "anthropic/claude-sonnet-4-5",
    mode: modeArg,
    personaName: personaArg,
    siteUrl: process.env.SITE_URL || "",
    siteName: process.env.SITE_NAME || "BreezyBoomersBot",
  });

  // Batch interview mode
  if (doInterview) {
    console.log(`\n🎙️  Running interview for: ${personaArg}\n${"─".repeat(60)}`);
    await bot.runInterviewQuestions();
    process.exit(0);
  }

  // Interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const modeLabel = modeArg === "auto" ? "auto-detect" : modeArg;
  console.log(`
╔══════════════════════════════════════════════════════════╗
║         Breezy Boomers Synthetic Persona Bot             ║
║  Persona : ${personaArg.padEnd(44)}║
║  Mode    : ${modeLabel.padEnd(44)}║
║  Type 'reset' to clear history, 'exit' to quit           ║
╚══════════════════════════════════════════════════════════╝
`);

  function prompt() {
    rl.question("You: ", async (input) => {
      const msg = input.trim();
      if (!msg) return prompt();
      if (msg.toLowerCase() === "exit" || msg.toLowerCase() === "quit") {
        console.log("\nGoodbye! 🏉\n");
        rl.close();
        return;
      }
      if (msg.toLowerCase() === "reset") {
        bot.resetHistory();
        console.log("✓ Conversation history cleared.\n");
        return prompt();
      }

      console.log("\nPersona: ");
      try {
        await bot.chat(msg, { stream: true });
        console.log("\n");
      } catch (err) {
        console.error(`\n❌ Error: ${err.message}\n`);
      }
      prompt();
    });
  }

  prompt();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
