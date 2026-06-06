#!/usr/bin/env node
/**
 * buildIndex.js — One-time script to build and persist the RAG vector index.
 *
 * Run:  npm run build-index
 *
 * This embeds all persona chunks using OpenRouter's embedding endpoint
 * and saves them to data/vectors/index.json.
 *
 * You only need to run this once (or after editing personas_raw.json).
 */

import { buildIndex } from "../src/rag.js";
import "dotenv/config";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey || apiKey === "your_openrouter_api_key_here") {
  console.error("\n❌  OPENROUTER_API_KEY not set in .env\n");
  process.exit(1);
}

console.log("\n🔨  Building RAG index…\n");
buildIndex(apiKey)
  .then(() => {
    console.log("\n✅  Done! You can now run: npm run chat  or  npm run dev\n");
  })
  .catch((err) => {
    console.error("❌  Error building index:", err.message);
    process.exit(1);
  });
