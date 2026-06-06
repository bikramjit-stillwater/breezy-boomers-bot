"""
build_dataset.py — Turn the raw source capture into one clean, complete
Breezy Boomers dataset that the RAG codebase will consume.

Produces:  dist/breezy-boomers-bot/data/breezy_boomers.json
with three parts:
  - profile          : all 102 Excel 'Persona Info' fields (cleaned)
  - spend_propensity : the full 311-brand, 6-category matrix
  - knowledge        : ready-to-embed text sections (the RAG corpus)
  - raw_slides       : every captured PPTX slide text (nothing lost)
"""
import json, os, re

HERE = os.path.dirname(__file__)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "breezy_boomers_source.json")
OUT_DIR = os.path.join(ROOT, "dist", "breezy-boomers-bot", "data")

src = json.load(open(SRC, encoding="utf-8"))

# --- text cleaning: normalise mojibake / smart quotes ----------------------
def clean(s):
    if s is None:
        return ""
    s = str(s)
    repl = {
        "�": "'",   # replacement char (came from smart apostrophes)
        "’": "'", "‘": "'",
        "“": '"', "”": '"',
        "–": "-", "—": "-",
        "…": "...", "\xa0": " ", "\t": " ",
    }
    for a, b in repl.items():
        s = s.replace(a, b)
    s = re.sub(r"[ ]{2,}", " ", s)
    return s.strip()

profile = {clean(k): clean(v) for k, v in src["excel_persona_info"].items()}
spend = {clean(cat): {clean(b): clean(i) for b, i in brands.items()}
         for cat, brands in src["spend_propensity"].items()}
slides = {s["slide"]: clean(s["text"]) for s in src["pptx_text"]}

# ---------------------------------------------------------------------------
# Build the embeddable knowledge corpus
# ---------------------------------------------------------------------------
knowledge = []
def add(category, title, text):
    text = clean(text)
    if text:
        knowledge.append({"id": len(knowledge), "category": category,
                          "title": title, "text": text})

def f(key):  # safe profile lookup
    return profile.get(key, "")

def fnum(key, mult=1, suffix="", dp=0):  # formatted numeric profile lookup
    try:
        v = float(profile.get(key, "")) * mult
        return f"{v:.{dp}f}{suffix}"
    except (ValueError, TypeError):
        return profile.get(key, "")

# 1. Identity & demographics
add("identity", "Identity & demographics", "\n".join([
    f"Persona: Breezy Boomers (representative members: Robert & Susan)",
    f"Profile: {f('Profile')}",
    f"Consumer attributes: {f('Consumer Attributes')}",
    f"Average age: {fnum('Average Age')} (segment skews 65+)",
    f"Relationship: {f('Relationship')}",
    f"Average SES: {fnum('Average SES', 100)} / 100",
    f"Occupation: {f('Occupation')}",
    f"Location: {f('Location')}",
    f"Lifestyle: {f('Lifestyle')}",
    f"Share of Fremantle members: {fnum('% of Members', 100, '%')}",
    f"Gender skew: {fnum('% Females', 100, '%')} female",
    f"State distribution - WA {f('WA')}, VIC {f('VIC')}, NSW {f('NSW')}, QLD {f('QLD')}, SA {f('SA')}, TAS {f('TAS')}, ACT {f('ACT')}, NT {f('NT')}",
]))

# 2. Bio narrative (Excel Bio field; slide 15 carries the same story verbatim)
add("bio", "Bio - Robert & Susan", f('Bio'))

# 3. About me / who I am
add("voice", "About me (first-person voice)", f('About Me'))

# 4. Personal attitudes
add("attitudes", "Personal attitudes & values", f('Personal Attitudes'))

# 5. Membership & engagement metrics
add("membership", "Membership & engagement metrics", "\n".join([
    f"Churn propensity: {f('Churn Propensity')} (segment churn 10% vs club baseline 22% - the lowest of all segments)",
    f"Engagement score: {f('Engagement Score')}",
    f"2024 membership index: {f('2024 Membership Index Score')}",
    f"Average years tenure: {f('Average Years Tenure')} (index {f('Average Years Tenure Index Score')})",
    f"2025 attendance index: {f('2025 Attendance Index Score')}",
    f"MCC index: {f('2025 MCC Index Score')}",
    f"Non-access index: {f('2025 Non-Access Index Score')}",
    f"Event index score: {f('Event Index Score')}",
]))

# 6. Tenure & attendance breakdown
add("tenure_attendance", "Tenure & attendance breakdown", "\n".join([
    "Tenure distribution: " + ", ".join([
        f"0-1yr {f('% Tenure 0-1 Years')}", f"2-4yr {f('% Tenure 2-4 Years')}",
        f"5-8yr {f('% Tenure 5-8 Years')}", f"9-12yr {f('% Tenure 9-12 Years')}",
        f"13-20yr {f('% Tenure 13-20 Years')}", f"21+yr {f('% Tenure 21+ Years')}"]),
    "2025 attendance distribution: " + ", ".join([
        f"non-access {f('% 2025 Non-Access')}", f"0 games {f('% 2025 No Attendance')}",
        f"1-4 games {f('% 2025 Attendance 1 - 4 games')}", f"5-8 games {f('% 2025 Attendance 5 - 8 games')}",
        f"9-10 games {f('% 2025 Attendance 9 - 10 games')}", f"11+ games {f('% 2025 Attendance 11+ games')}"]),
    f"Membership retention: {f('% 2022 Members')} were 2022 members, {f('% 2023 Members')} 2023, {f('% 2024 Members')} 2024",
]))

# 7. Communications & digital behaviour
def pc(key):
    v = f(key)
    try: return f"{round(float(v)*100)}%"
    except: return v
add("comms", "Communications & digital behaviour", "\n".join([
    f"Email opted-in: {pc('Email Opted-In %')}",
    f"SMS opted-in: {pc('SMS Opted-In %')}",
    f"Email open rate (if in email data): {pc('Email Opens (if in email data)')}",
    f"Email click rate (if in email data): {pc('Email Click (if in email data)')}",
    f"Engaged in competition: {pc('Engaged in Competition')}",
    f"Completed survey: {pc('Completed Survey')}",
    f"Opt-in email index: {f('Opt-in-to Email Index Score')}, opt-in SMS index: {f('Opt-in-to SMS')}",
    "Media exposure is primarily traditional with low digital participation; reasonably engaged on club channels but open/click rates are low.",
]))

# 8. Merchandise
add("merchandise", "Merchandise behaviour", "\n".join([
    f"Purchase propensity index: {f('Merchandise Purchase Propensity Index')}",
    f"Orders per annum index: {f('Merchandise Orders Per Annum Index')}",
    f"Cart size index: {f('Merchandise Cart Size Index')}",
    f"% purchased merch: {f('% Purchased Merch')}",
    f"Average merch orders per year: {f('Average Merch Order per Year')}",
    f"$ spent on merch where purchased: {f('$ Spent on Merch where Purchased')}",
    f"Merch per member (propensity x value): {f('Merch per Member (Propensity x Value)')}",
]))

# 9. Lifestyle interests
add("lifestyle", "Lifestyle interests", f('Lifestyle Interests'))

# 10. Media exposure
add("media", "Media exposure", "Top media channels: " + f('Media Exposure') +
    "\nMedia index scores: " + f('Media Index Scores'))

# 11. Social platforms
add("social", "Social platforms", "Platforms: " + f('Social Platforms') +
    f"\nCheck frequency index: {f('Social Media Check Frequency')}, post frequency index: {f('Social Media Post Frequency')}")

# 12. Buying intentions / behaviour / drivers
add("buying", "Buying intentions, behaviour & drivers", "\n".join([
    "Buying intentions: " + f('Buying Intentions'),
    "Buying behaviour: " + f('Buying Behaviour'),
    "Buying drivers: " + f('Buying Drivers'),
    "High spend categories: " + f('High Spend Categories'),
]))

# 13. Values / outlook
add("values", "Cultural, sustainability & outlook", "\n".join([
    "Cultural diversity: " + f('Cultural Diversity'),
    "Sustainability: " + f('Sustainability'),
    "Political values: " + f('Political Values'),
    "Outlook on life: " + f('Outlook on Life'),
]))

# 14. Commercial value (PPTX slide 16) - keep the slide text verbatim for fidelity
add("commercial_value", "Lifetime value, annual spend & fan passion score",
    "From the member analytics (Breezy Boomers):\n" +
    "Lifetime Value Estimate - Minimum $1,100, Maximum $82,300, Average $13,450, Median $10,450.\n" +
    "Annual Membership Spend - Minimum $45, Maximum $3,600, Average $586, Median $455.\n" +
    "Fan Passion Score (FPS): 7.0 (indicative score most highly indexed for this group).\n" +
    "Average membership tenure 16.9 years (1.4x). Average attendance 2025: 6 to 9 games.\n" +
    "Top memberships: Season Reserved Seat 56%, 3 Game Pass 10%, Purple Army 4%.\n" +
    "Top price codes: Category 2 Adult 13%, Category 4 Adult 12%, GA 3 Adult 9%.")

# 15. Membership movement (slide 14)
add("movement", "Membership movement 2024-2025", slides.get(14, ""))

# 16. Spend propensity - one section per category
for cat, brands in spend.items():
    lines = [f"{b}: {i}" for b, i in brands.items() if i]
    add("spend_propensity", f"Spend propensity - {cat}",
        f"Breezy Boomers spend propensity index vs population for {cat} "
        f"(1.0x = average; higher = over-indexed):\n" + "\n".join(lines))

# ---------------------------------------------------------------------------
out = {
    "segment": "Breezy Boomers",
    "characters": "Robert & Susan",
    "source_files": [
        "Fremantle 2025 Segmentation AI-Ready Format 2026_05 V2.xlsx (sheets: Persona Info, Breezy Boomers)",
        "Fremantle_Personas_050426_V1.2.pptx (slides 13-20)",
    ],
    "profile": profile,
    "spend_propensity": spend,
    "knowledge": knowledge,
    "raw_slides": [{"slide": k, "text": v} for k, v in sorted(slides.items())],
}

os.makedirs(OUT_DIR, exist_ok=True)
path = os.path.join(OUT_DIR, "breezy_boomers.json")
with open(path, "w", encoding="utf-8") as fp:
    json.dump(out, fp, indent=2, ensure_ascii=False)

print(f"profile fields : {len(profile)}")
print(f"spend brands   : {sum(len(b) for b in spend.values())} across {len(spend)} categories")
print(f"knowledge chunks: {len(knowledge)}")
print(f"raw slides     : {len(slides)}")
print(f"WROTE {path}")
