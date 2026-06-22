/**
 * cli.js — Interactive terminal chat with the Urban Hipster persona.
 *
 *   npm run chat                 interactive
 *   node src/cli.js --interview  run the 10 interview questions
 *   node src/cli.js --mode analyst
 */
import readline from "readline";
import { UrbanHipsterBot } from "./chatbot.js";
import { buildIndex, indexExists } from "./rag.js";
import "dotenv/config";

const INTERVIEW = [
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

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : def;
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    console.error("❌  Set OPENROUTER_API_KEY in .env (copy from .env.example).");
    process.exit(1);
  }
  if (!indexExists()) {
    console.log("📦  Building RAG index (one-time)…");
    await buildIndex(apiKey);
  }

  const mode = arg("--mode", "auto");
  const bot = new UrbanHipsterBot({ apiKey, model: process.env.MODEL, mode });

  if (process.argv.includes("--interview")) {
    for (const q of INTERVIEW) {
      console.log(`\n\x1b[35mQ: ${q}\x1b[0m`);
      process.stdout.write("A: ");
      await bot.chat(q, { stream: true });
      console.log("\n");
    }
    return;
  }

  console.log("\n🏉  Urban Hipster Bot — chatting as Rebecca. Type 'exit' to quit, 'reset' to clear.\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => rl.question("\x1b[36mYou:\x1b[0m ", async (line) => {
    const t = line.trim();
    if (t.toLowerCase() === "exit") return rl.close();
    if (t.toLowerCase() === "reset") { bot.resetHistory(); console.log("(history cleared)\n"); return ask(); }
    if (!t) return ask();
    process.stdout.write("\x1b[35mRebecca:\x1b[0m ");
    try { await bot.chat(t, { stream: true }); } catch (e) { console.error("\n⚠️ ", e.message); }
    console.log("\n");
    ask();
  });
  ask();
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
