# Breezy Boomers Synthetic Persona Chatbot

RAG-based chatbot for Fremantle Dockers FC member research.  
Powered by **OpenRouter** → **Claude claude-sonnet-4-5**.  
No database required — vectors stored in `data/vectors/index.json`.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up your API key

```bash
cp .env.example .env
# Open .env and add your OpenRouter API key
# Get one at: https://openrouter.ai/keys
```

### 3. Build the RAG index (one-time)

```bash
npm run build-index
```

This embeds all persona chunks and saves them to `data/vectors/index.json`.  
You only need to do this once (or after editing `data/personas_raw.json`).

### 4. Start chatting

**Terminal (interactive CLI):**
```bash
npm run chat
```

**HTTP server:**
```bash
npm run dev
# → http://localhost:3000
```

---

## Modes

### Persona mode (default for interview questions)
The bot speaks **as** the Breezy Boomers persona (Robert/Susan) in first person.

```bash
npm run chat
# Then ask: "What type of membership do you hold?"
```

### Analyst mode
The bot answers **about** segments using the data.

```bash
node src/cli.js --mode analyst
# Then ask: "Compare churn rates across segments"
```

### Auto mode (default)
Automatically detects which mode fits the question.

---

## CLI Options

```bash
node src/cli.js [options]

Options:
  --mode <mode>       auto | persona | analyst  (default: auto)
  --persona <name>    Which persona to embody   (default: "Breezy Boomers")
  --interview         Run all 10 interview questions automatically
```

### Examples

```bash
# Run all 10 interview questions on Breezy Boomers
node src/cli.js --interview

# Chat as Founding Faithfuls
node src/cli.js --persona "Founding Faithfuls"

# Analyst mode — ask about any segment
node src/cli.js --mode analyst

# Interactive with Comfortable Crowd persona
node src/cli.js --persona "Comfortable Crowd" --mode persona
```

---

## HTTP API

### `POST /chat`
```json
{
  "message": "What type of membership do you hold?",
  "sessionId": "session_001",
  "persona": "Breezy Boomers",
  "mode": "auto"
}
```
Response:
```json
{
  "reply": "I hold a season membership — have done for over 20 years now…",
  "sessionId": "session_001"
}
```

### `POST /chat/stream`
Same body as `/chat`. Returns Server-Sent Events:
```
data: {"token": "I "}
data: {"token": "hold "}
...
data: {"done": true}
```

### `POST /reset`
```json
{ "sessionId": "session_001" }
```
Clears conversation history for the session.

### `GET /health`
Returns server status and index readiness.

### `GET /personas`
Lists all available personas and modes.

---

## The 10 Interview Questions

These are pre-wired into the persona's knowledge. Ask them directly:

1. What type of membership do you hold, and why did you choose it?
2. How often do you attend games in person versus following from home?
3. How much do you typically spend on club merchandise each season?
4. What would make you upgrade to a higher membership tier or hospitality package?
5. How do you feel about the price of your membership and whether it is worth it?
6. What stops you from attending more games in person?
7. What club merchandise do you own, and what would you love to see us offer?
8. When it is time to renew, what makes that decision easy or hard for you?
9. What are you planning to buy from the club in the coming season?
10. Who do you usually come to the footy with, and would you bring more people if we made it easier?

---

## Project Structure

```
breezy-boomers-bot/
├── data/
│   ├── personas_raw.json        # Source: extracted from Excel + PPTX
│   └── vectors/
│       └── index.json           # Generated: RAG embeddings (after build-index)
├── src/
│   ├── rag.js                   # RAG engine (chunk, embed, retrieve)
│   ├── prompts.js               # System prompt builder + mode detection
│   ├── openrouter.js            # OpenRouter API client (chat + stream)
│   ├── chatbot.js               # BreezyBot class — main orchestrator
│   ├── cli.js                   # Interactive terminal interface
│   └── server.js                # Express HTTP server
├── scripts/
│   └── buildIndex.js            # One-time index builder
├── .env.example                 # Copy to .env and add your key
├── package.json
└── README.md
```

---

## Extending to Other Personas

All 7 segments are embedded in the RAG index. To switch persona:

```bash
node src/cli.js --persona "Urban Hipster"
node src/cli.js --persona "Modern Families"
node src/cli.js --persona "Generation Fun"
```

To extend `prompts.js` with full hardcoded snapshots for other personas,
add snapshot constants following the `BREEZY_BOOMERS_SNAPSHOT` pattern
and wire them to the `personaName` argument in `buildSystemPrompt()`.

---

## Notes

- **No database required.** The vector index is a single JSON file.
- **Conversation history** is held in-memory (resets on restart).
  For persistence, serialize `bot.history` to disk between sessions.
- **Embedding model**: `openai/text-embedding-3-small` via OpenRouter.
- **Chat model**: `anthropic/claude-sonnet-4-5` via OpenRouter.
