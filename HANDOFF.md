# Breezy Boomers Bot — Handoff

_Last updated: 2026-06-17_

A RAG chatbot that answers **as a Fremantle Dockers "Breezy Boomers" member** (Robert & Susan),
for member research. Powered by **OpenRouter → Claude**. Vectors stored in a plain **JSON file** — no database.
Scoped to Breezy Boomers only; it politely declines questions about other segments.

---

## 1. Links & access

| | |
|---|---|
| **Live app** | https://breezy-boomers-bot.onrender.com |
| **GitHub** | https://github.com/bikramjit-stillwater/breezy-boomers-bot |
| **Render service** | `srv-d8i0ejm47okc738ukco0` (workspace: Apoorv's workspace) · dashboard: https://dashboard.render.com/web/srv-d8i0ejm47okc738ukco0 |
| **Hosting plan** | Free / Oregon · auto-deploys on every push to `main` |

### Secrets / env vars (set in Render → Environment, and in local `.env`)
| Var | Purpose | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Chat + embeddings | **Required.** Get at https://openrouter.ai/keys |
| `MODEL` | Chat model | Default `anthropic/claude-sonnet-4-5` |
| `SITE_URL`, `SITE_NAME` | OpenRouter ranking headers | Optional |

> ⚠️ The Render API key shared earlier in chat should be **rotated** as a precaution.

---

## 2. What it does

- Answers the **10 research interview questions** + any free-form question, **in character**.
- **3 modes** (tabs, top-right of chat):
  - `persona` — speaks as Robert/Susan in first person (the research voice). **No segment stats are spoken in this voice** (see §10).
  - `analyst` — describes the segment with data/numbers (LTV, churn, indices).
  - `auto` — picks persona vs analyst from your wording (default). Each message judged independently.
  - Mode can be switched **mid-conversation**; it applies from the next message; chat history is retained.
- **Voice = Male / Female** control: sets both the answer **tone** (reads as a man vs a woman, via `speaker` in the prompt) **and** the read-aloud TTS voice. It does *not* rename the persona (it stays Robert & Susan).
- **Guardrail:** only represents Breezy Boomers. Asked about other segments → *"Sorry, I can only speak as a Breezy Boomers member…"* (`src/prompts.js` → `GUARDRAIL`).
- **Web UI** (`public/index.html`): **3-pane layout** — persona card (left), chat (middle), live evidence drawer (right). See §10. Plus a **team-lens bar** (Consumer/Marketing/Commercial/Foundation/Executive) that swaps the suggested questions only, follow-ups under each answer, and voice input (🎤) / output (🔊). Voice output plays **only** when the question was asked by voice; typed questions stay silent (Replay button available).

---

## 3. Models

| Role | Model | Via |
|---|---|---|
| Chat / answers | `anthropic/claude-sonnet-4-5` | OpenRouter |
| Embeddings / RAG | `openai/text-embedding-3-small` | OpenRouter |

**No AI was used to extract the data** — extraction is deterministic Python (see §5).

---

## 4. Architecture

```
Browser (public/index.html)  3-pane UI
   │  GET  /persona                         → left card + right segment snapshot
   │  POST /chat or /chat/stream { message, sessionId, mode, speaker }
   ▼
server.js (Express)
   ▼
chatbot.js  BreezyBot.chat():
   1. detectMode()           prompts.js  (if mode=auto)
   2. retrieve()             rag.js      → embeds question, cosine top-6 chunks
   3. getPersonaProfile()    rag.js      → fixed Robert & Susan grounding snapshot
   4. onMeta({mode,evidence}) → streamed first, feeds the right "EVIDENCE · LIVE" drawer
   5. buildSystemPrompt()    prompts.js  → persona|analyst prompt + guardrail + gender tone
   6. chatStream()           openrouter.js → Claude → streamed tokens
```

Endpoints: `GET /` UI · `GET /persona` card+snapshot · `POST /chat` · `POST /chat/stream` (SSE: `meta` then `token`…) · `POST /reset` · `GET /health`.

### File map
```
data/breezy_boomers.json   complete dataset (Excel + PPTX). profile / spend_propensity / knowledge / charts / raw_slides
data/vectors/index.json    generated embeddings (gitignored; built on first run / boot)
src/rag.js                 chunk, embed, retrieve, getPersonaProfile, buildIndex
src/prompts.js             persona/analyst prompts, GUARDRAIL, detectMode, gender-tone note
src/openrouter.js          OpenRouter chat client (complete + stream)
src/chatbot.js             BreezyBot orchestrator + per-session history; emits onMeta (evidence)
src/cli.js                 terminal chat / --interview
src/server.js              Express server + serves the web UI; /persona card+snapshot builder
public/index.html          browser 3-pane UI (persona card · chat · evidence drawer; lenses, voice)
public/persona.jpg         Robert & Susan photo (from the persona deck) — used as the card avatar
scripts/buildIndex.js      one-time index builder
_extract/                  Python extractors (source files → dataset) — reproducible
```

---

## 5. Data: sources, extraction & completeness

### Sources (both files map 1:1 to Breezy Boomers)
- `Fremantle 2025 Segmentation AI-Ready Format 2026_05 V2.xlsx`
  - **Persona Info** sheet → 102 profile/metric fields
  - **Breezy Boomers** sheet → 311-brand spend-propensity matrix (6 categories)
- `Fremantle_Personas_050426_V1.2.pptx` → slides 13–20 (Robert & Susan deck)

### Extraction pipeline (deterministic — `_extract/`)
```
extract.py        openpyxl (data_only) reads cells; python-pptx reads text + tables + CHARTS,
                  recursing into grouped shapes → _extract/breezy_boomers_source.json
build_dataset.py  cleans text (quotes, decimal→%), builds the embeddable `knowledge` sections
                  → data/breezy_boomers.json
```
Re-run anytime: `python _extract/extract.py && python _extract/build_dataset.py`
(requires `pip install openpyxl python-pptx`). Same input → identical output.

### Completeness — verified ✅
| Source | Captured |
|---|---|
| Excel Persona Info | 102 / 102 fields |
| Excel Breezy Boomers sheet | 311 / 311 brands, 6 / 6 categories |
| PPTX slides 13–20 — text | all paragraphs |
| PPTX slides 13–20 — tables | engagement + spend tables |
| PPTX slides 13–20 — **charts** | Media Exposure (20 channels), membership movement, gender, annual spend |
| PPTX slides 13–20 — grouped shapes | recursed |

**Only un-capturable content:** text baked into images as pixels (needs OCR) — not applicable here; all
persona data is in text/tables/charts. Spot-checked ~20 brand values + ~15 metrics against the source; all matched.

> Note: an earlier pass missed native PowerPoint **charts** (text-only extraction). Fixed — extractor now reads
> chart series. This is why the dataset went 21 → 24 knowledge chunks.

---

## 6. Run locally

```bash
npm install
cp .env.example .env          # add OPENROUTER_API_KEY
npm run build-index           # one-time embed (~5s; needs the key)
npm run dev                   # web UI → http://localhost:3000
# or:
npm run chat                  # terminal
npm run interview             # auto-run the 10 questions
node src/cli.js --mode analyst
```

The Render server builds the index automatically on boot if `data/vectors/index.json` is absent.

---

## 7. Verification status

- All **10 interview questions** tested live in `persona` mode — every quoted figure traces to source data
  ($124 merch, $455–$586 annual spend, 6–9 games, 16.9-yr tenure, 2.1x premium, FTA TV +64.9, etc.).
- `analyst` mode returns correct LTV ($13,450 avg / $10,450 median), churn 10% (lowest), media indices.
- **Guardrail** confirmed: other-segment questions are declined.

---

## 8. Known limitations / possible next steps

- **Attendance phrasing** occasionally says "six or seven" vs the data's "6–9" range (within range, not wrong).
  Can be locked to "6–9" by reinforcing it in `getPersonaProfile()`.
- **No persistence:** conversation history is in-memory per `sessionId`; resets on restart.
- **Single persona by design.** To support other segments, extract their Excel sheets + PPTX decks the same way
  and lift the guardrail.
- **Voice** input works best in Chrome/Edge; gender voice is best-effort (Web Speech API has no true gender field).
- Optional artifact: a **slide-by-slide + 311-brand capture report** for formal sign-off (not yet generated).

---

## 9. Persona tuning — V1 testing feedback (2026-06-17)

Reviewer feedback from **`Synthetic Persona V1 Testing .xlsx`** (sheet _Synethic Interview_,
"Notes for Improvement" column, + _General Thoughts & Questions_). The notes across ~14 questions
traced back to a handful of root causes, all fixed in the **persona prompt + grounding snapshot**
(`src/prompts.js` persona instructions and `src/rag.js` → `getPersonaProfile`). **No index rebuild
needed** — the embedded corpus (`buildChunks`) was untouched, so existing `data/vectors/index.json`
stays valid.

**Addressed in this pass:**
- **No analyst stats in member voice.** Persona must not say "our segment", "16.9 years", "10% churn",
  "$586", "1.4X", "Fan Passion Score", percentages or indices. The snapshot now separates "WHO YOU ARE
  (things you naturally know)" from a clearly-labelled "SEGMENT RESEARCH DATA — analyst figures only,
  do not quote in persona voice" block. (Q19 "our segment", Q23/Q2A stat-dumps)
- **Bio colour de-emphasised.** Italian family / La Sosta / wine / Cultural Centre demoted to a "LIGHT
  BACKGROUND COLOUR — use sparingly, most answers should NOT mention these" section; the full Bio prose
  is no longer injected wholesale. (Q3, General #7, #14)
- **No markdown / asterisks / bold headers / bullet-list report format** — plain conversational prose only. (Q6, Q18, Q20, General #12)
- **Fewer em-dashes.** (General #13)
- **No fabricated checkable specifics** (exact opponents, dates, scores, "5 or 6 years back", weeknight
  health appointments). Persona now speaks with imperfect human memory and stays general. (Q9, Q10, General #11)
- **Personal Attitudes treated as background guardrails, not lines to recite** ("I obey the rules…"). (Q8)
- **No third-person "For me (Robert)"** phrasing. (Q23)
- **In-character pushback preserved** when a question miscasts the persona (reviewer liked Q35/Q2A).

**How to verify (needs the OpenRouter key):** run `npm run interview` (or the live app) and re-check the
flagged rows. Look specifically for: zero segment percentages/indices in persona answers; no `**bold**`/`*asterisks*`;
sparse colour references; no invented specific games; consistent conversational tone start-to-finish.

**Deferred (larger scope, not in this pass — see General Thoughts):**
- Differentiate Robert vs Susan (#1); make/remove the synthesised voice (#2).
- Latency grows deep in a conversation (#6) — likely history length; consider trimming/summarising history.
- Lean harder on **behavioural + category-level spend** signal over attitudes/bio and noisy individual brands (#8, #9).
- Document/clarify auto-vs-persona-vs-analyst mode logic and how related follow-up questions surface (#3, #4, #5).

---

## 10. UI revamp + persona tone & photo (2026-06-17) — on branch `test`

> All of the below is committed on the **`test`** branch (pushed to origin), **not `main`**. The live
> Render app deploys from `main`, so it is unaffected until `test` is merged. Local `.env` holds the
> OpenRouter key (gitignored). After editing any `src/*.js` or prompt, **restart the server** — Node does
> not hot-reload.

**3-pane UI** (`public/index.html`, light theme, modelled on the client's "Classic chat + data drawer" mock):
- **Left — persona card:** name "Robert & Susan", photo avatar (`public/persona.jpg`), age/location, bio,
  trait chips, and headline stats (Share 22%, LTV median $10,450, Tenure 16.9 yrs, Fan Passion 7.0).
- **Middle — chat:** Auto/Persona/Analyst **mode tabs**; a **team-lens bar** (Consumer/Marketing/Commercial/
  Foundation/Executive) that only swaps the suggested questions (it does **not** change the answer — labelled
  as such in the UI); follow-up chips; voice in/out.
- **Right — "EVIDENCE · LIVE":** per answer shows the **retrieved source chunks** ("Grounded in", no % shown)
  + a persistent **segment snapshot** (membership, value, and colour-coded media-skew indices). All values
  come from `GET /persona` → built from the dataset, never invented. Core principle: **numbers live in the
  panels, not in the persona's spoken answer.**

**Persona answer quality** (from `Synthetic Persona V1 Testing .xlsx` feedback — see §9 for the per-question
mapping; all verified intact via a 14-question regression):
- Persona voice: no segment stats/percentages spoken, no markdown/asterisks, fewer em-dashes, no fabricated
  specifics, no verbatim attitudes; in-character pushback when miscast is preserved.

**Gender tone** (`speaker` param, the Voice Male/Female control): shapes how the reply *reads* (man vs woman)
via a tone note in `buildSystemPrompt` — generic/reusable, does **not** rename the persona. Also sets the TTS voice.

**Data provenance — two source files only** (`data/breezy_boomers.json` → `source_files`):
- `Fremantle 2025 Segmentation AI-Ready Format 2026_05 V2.xlsx` (sheets: Persona Info, Breezy Boomers)
- `Fremantle_Personas_050426_V1.2.pptx` (slides 13–20; the card photo is from slide 13)

**Deferred / not done** (larger scope): differentiate Robert vs Susan in *content* (currently tone-only);
latency on deep conversations; lean harder on behavioural/category-level spend signal; topic-lens answers.

---

## 11. Commit history (high level)
1. Browser chat UI served at `/`
2. Persona dropdown fixed for all segments (superseded)
3. Rebuilt as Breezy-Boomers-only with 100% source data
4. UI redesign: dark theme, pinned starters, follow-ups, smarter voice
5. Capture PPTX chart data (Media Exposure 20-channel, movement, annual spend)
6. _(branch `test`)_ Persona tuning + 3-pane UI (persona card · chat · live evidence drawer), team lenses, gender tone, Robert & Susan photo avatar
