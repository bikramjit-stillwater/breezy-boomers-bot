# Breezy Boomers Bot — "General Thoughts & Questions" answered

_Responses to the 14 items on the **General Thoughts & Questions** sheet of
`Synthetic Persona V1 Testing .xlsx`. Last updated: 2026-06-17._

Status key: ✅ resolved · ⚠️ partly addressed · 🔵 working as designed · ⏳ deferred (larger scope)

---

### 1. How / why do Robert and Susan differ? ⚠️/🔵
In the source data they **don't** differ — "Robert & Susan" is one household representing the
Breezy Boomers segment, sharing the same membership, lifestyle and metrics. The bot currently
differentiates them only by **gender tone** (the Male/Female "Tone" control changes how the reply
*reads* — a man vs a woman — not what they think). Genuinely different *content/opinions* per person
isn't supported because there's no per-person data to ground it. **Deferred** unless distinct
Robert vs Susan data is provided.

### 2. Change the voice to more natural, or remove altogether ✅
**Done — voice OUTPUT (text-to-speech) has been removed entirely.** Only voice **input** (the 🎤 mic)
remains. Separately, the persona's *written* voice was tuned to be more natural and conversational
(see #10, #11, #12).

### 3. What's the difference between auto, persona and analyst? ✅
They are answer **modes** (tabs at the top of the chat). The **source data is identical** for all three;
only the instruction/voice changes:
- **Persona** — answers in first person as the member; **no statistics are spoken**.
- **Analyst** — describes the segment with the numbers (LTV, churn, indices).
- **Auto** — reads your wording and silently picks persona or analyst (the chat shows "answered as …").

### 4. What's the logic for when auto decides the approach? ✅
Keyword-based (`detectMode` in `src/prompts.js`). If the question contains analyst-style words —
*segment, index, percentage, %, data, metric, churn rate, average, compare, lifetime value,
propensity, analyse/analyze* — it answers in **analyst** mode; otherwise **persona**. Each message
is judged independently, and you can override with the Persona/Analyst tabs.

### 5. How do the related questions surface? ✅
Two places, both now driven by the selected **team lens** (Consumer/Marketing/Commercial/Foundation/
Executive):
- **Before the first question:** a pinned "Try asking" bar shows that lens's starter questions
  (it disappears after the first question).
- **Under each answer:** follow-up chips drawn from the active lens's question set.

### 6. Gets very slow once you're deep in a conversation ⏳
**Real and not yet fixed.** Conversation history is kept per session and the **entire history is
re-sent to the model on every turn**, so the deeper the chat, the larger the prompt → slower and more
costly. (Confirmed: multi-turn memory works precisely because the whole thread is resent.)
**Suggested fix (deferred):** cap/trim history to the last N turns, or summarise older turns.

### 7. Gets hung up on Italian family, La Sosta, wine, Perth's Cultural Centre ✅
**Fixed.** These were demoted in the grounding snapshot to a "light background colour — use sparingly"
section, and the prompt instructs the model to mention them rarely. Verified across 38 answers:
Italian 0, La Sosta 0, Cultural Centre 0, wine 2, gallery 1.

### 8. Attitudes and bio are guardrails — stronger behavioural signals exist in the data ⚠️
**Partly addressed.** The listed attitudes/bio are now treated as **background guardrails** (never
recited verbatim), and the behavioural metrics (membership, tenure, churn, spend, attendance, media
skew) are surfaced in the right-hand evidence panel. Leaning even **harder** on behavioural signals to
*drive* answers is a further improvement — **deferred**.

### 9. Spend data is a strong signal — more so at category level than noisy individual brands ⚠️
**Partly addressed.** The over-indexed-brands line in the grounding snapshot is explicitly labelled
*"treat category-level signal as more reliable than individual brands, which are noisy."* Fully
re-weighting answers toward **category-level** spend is **deferred**.

### 10. Structure & style of responses drifted over time ✅
**Fixed.** A consistent conversational style is enforced and **markdown/headings/bold/bullets are
banned in persona mode** (the drift was usually a slide into report format, e.g. old Q18). Verified
consistent across the regression run.

### 11. Needs to respond as a human would (not perfect knowledge of self/segment) ✅
**Fixed.** The persona no longer recites segment statistics or "our segment" figures, speaks with
ordinary/imperfect memory, and doesn't fabricate specific checkable facts (exact games, dates).

### 12. Style should be conversational — not like Row 19 (Q18) ✅
**Fixed** — same change as #10. The Q18-style report format (bold section headers) no longer occurs.

### 13. Reduce M-dashes (—) in responses ✅ (soft)
**Reduced.** Average ~1.5 em-dashes per answer (down from pervasive); the prompt explicitly says to go
easy on them. It's a soft target — an LLM can't be guaranteed to hit zero.

### 14. Bio and About Me are the least data-grounded sections ✅
**Acknowledged and handled.** Bio/About Me are now used only as light "colour" and voice guidance, kept
separate from the data-grounded sections, and de-emphasised so they don't dominate answers (ties to #7, #8).

---

## Bonus: does the LLM "context window" / conversational memory work? ✅
**Yes.** The bot keeps per-session history (`BreezyBot.history`) and re-sends it each turn, so it can
answer based on previous answers. Verified:
- Q "What membership do you hold?" → "Season Reserved Seat".
- Q "Why did you choose **that one** over a cheaper option?" → correctly reasoned about the reserved seat.
- Q "Remind me what we were just talking about?" → correctly recapped the thread.

**Caveats:** memory is in-memory per `sessionId` and **resets on server restart**; and re-sending the
full history is the cause of the slow-down in #6.

---

## Summary

| # | Item | Status |
|---|---|---|
| 1 | Robert vs Susan differ | ⚠️/🔵 tone only; content deferred |
| 2 | Voice more natural / remove | ✅ output removed |
| 3 | auto vs persona vs analyst | ✅ |
| 4 | auto decision logic | ✅ |
| 5 | related questions surfacing | ✅ lens-based |
| 6 | slow deep in conversation | ⏳ deferred (trim history) |
| 7 | hung up on Italian/La Sosta/wine | ✅ |
| 8 | attitudes/bio vs behavioural | ⚠️ partly |
| 9 | category-level spend signal | ⚠️ partly |
| 10 | style drift | ✅ |
| 11 | respond as a human | ✅ |
| 12 | conversational style | ✅ |
| 13 | fewer em-dashes | ✅ soft |
| 14 | bio/about me least grounded | ✅ |
| — | conversational memory works | ✅ |

**Still open (worth a next pass):** #1 (Robert/Susan content), #6 (latency / history trimming),
#8–#9 (lean harder on behavioural + category-level spend).
