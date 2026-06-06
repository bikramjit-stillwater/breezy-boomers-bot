# Breezy Boomers Bot 🏉

A RAG-based chatbot that speaks **as a Fremantle Dockers "Breezy Boomers" member** (Robert & Susan).
Powered by **OpenRouter → Claude**. Vectors are stored in a plain **JSON file** — no database.

It answers the 10 research interview questions and any free-form question **in character**.
It only represents Breezy Boomers — if you ask about another segment it will politely say so.

---

## Quick start

```bash
npm install                       # 1. install deps
cp .env.example .env              # 2. add your OpenRouter key to .env
npm run build-index               # 3. embed the data (one-time, ~5s)
npm run chat                      # 4a. chat in the terminal
npm run dev                       # 4b. or run the web UI → http://localhost:3000
```

> `npm run build-index` and the server both need `OPENROUTER_API_KEY` set in `.env`.
> Get a key at https://openrouter.ai/keys

---

## What you can run

| Command | What it does |
|---|---|
| `npm run chat` | Interactive terminal chat as Robert & Susan |
| `npm run interview` | Auto-runs the 10 interview questions |
| `npm run dev` | Web UI with voice input/output at http://localhost:3000 |
| `npm run build-index` | (Re)build the JSON vector index |
| `node src/cli.js --mode analyst` | Data-analyst answers about the segment |

The web UI includes 🎤 voice input and 🔊 spoken replies (male/female), and is **Breezy Boomers only**.

---

## How the data is captured (100% from source)

Everything is extracted 1:1 from your two source files and merged into
[`data/breezy_boomers.json`](data/breezy_boomers.json):

| Source | What was pulled |
|---|---|
| `Fremantle 2025 Segmentation AI-Ready Format 2026_05 V2.xlsx` → **Persona Info** sheet | All **102** profile/metric fields |
| same Excel → **Breezy Boomers** sheet | Full **311-brand** spend-propensity matrix (6 categories) |
| `Fremantle_Personas_050426_V1.2.pptx` → slides 13-20 | Robert & Susan bio, lifetime value, annual spend, Fan Passion Score, engagement profile, membership movement, media & buying narratives |

`data/breezy_boomers.json` contains:
- `profile` — all 102 Excel fields
- `spend_propensity` — the 311-brand matrix
- `knowledge` — the embeddable, distilled sections (the RAG corpus)
- `raw_slides` — every captured slide verbatim (nothing lost)

To regenerate the dataset from source (needs Python + `openpyxl`, `python-pptx`):
the extraction scripts live in `_extract/` (kept for reference).

---

## How it works

```
Your question
   │
   ├─ retrieve()  → embeds the question, cosine-matches the top 6 chunks   (src/rag.js)
   ├─ getPersonaProfile() → fixed Robert & Susan grounding snapshot         (src/rag.js)
   ├─ buildSystemPrompt() → persona OR analyst prompt + scope guardrail     (src/prompts.js)
   └─ OpenRouter → Claude → streamed reply                                  (src/openrouter.js)
```

- **No database.** The vector index is `data/vectors/index.json` (built once).
- **Embeddings:** `openai/text-embedding-3-small` via OpenRouter.
- **Chat model:** `anthropic/claude-sonnet-4-5` (change `MODEL` in `.env`).
- **Guardrail:** the bot only answers as Breezy Boomers; other segments are politely declined (`src/prompts.js`).

---

## Project structure

```
breezy-boomers-bot/
├── data/
│   ├── breezy_boomers.json     # complete dataset (Excel + PPTX, 100%)
│   └── vectors/index.json      # generated embeddings (after build-index)
├── src/
│   ├── rag.js                  # JSON vector store: chunk, embed, retrieve, persona snapshot
│   ├── prompts.js              # persona/analyst prompts + Breezy-only guardrail
│   ├── openrouter.js           # OpenRouter chat client (complete + stream)
│   ├── chatbot.js              # BreezyBot orchestrator + history
│   ├── cli.js                  # terminal chat / --interview
│   └── server.js               # Express server + web UI
├── public/index.html           # browser chat UI (voice in/out)
├── scripts/buildIndex.js       # one-time index builder
├── _extract/                   # Python extractors (source → dataset), for reference
├── .env.example
└── package.json
```
