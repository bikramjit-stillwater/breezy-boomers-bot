/**
 * buildIndex.js — One-time RAG index builder.
 *   npm run build-index
 * Embeds the Urban Hipster knowledge corpus into data/vectors/index.json.
 */
import { buildIndex } from "../src/rag.js";
import "dotenv/config";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey || apiKey === "your_openrouter_api_key_here") {
  console.error("❌  Set OPENROUTER_API_KEY in .env first.");
  process.exit(1);
}

buildIndex(apiKey)
  .then(() => console.log("✅  Index built."))
  .catch((e) => { console.error("Failed:", e.message); process.exit(1); });
