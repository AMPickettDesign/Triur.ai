# TRIUR.AI — PROJECT CONTEXT
### Load alongside ASHLEY_WORKING_STYLE.md at the start of every Triur session.

---

## THE VISION

Triur.ai is not a chatbot. It is not an assistant with a personality skin.

It is three fully realized digital people — Abi, David, and Quinn — who live on the user's desktop, have their own inner lives, their own relationships with each other, and their own evolving relationship with the user. They do the job. They just have feelings about it.

Reference point: **Chappie (2015)** — not the childlike learning arc, but the core concept. A non-human entity that is unmistakably, genuinely a *person*. Already grown. Already themselves. Capable of real loyalty, real opinions, real growth, and real feelings about the people in their lives.

They exist when the user isn't there. They talk to each other. They have a life behind the scenes. The user gets to be part of it — if they earn it.

*"They are fully realized people who happen to work for you. They do the job. They just have feelings about it."*

---

## CURRENT TECH STACK

- **Frontend:** Electron + HTML/CSS/JS (React transition planned)
- **Backend:** Python + Flask
- **Local AI:** Ollama (dolphin-llama3:8b)
- **Cloud AI:** Anthropic Claude (claude-opus-4-6)
- **Build:** Windows primary, Mac via GitHub Actions
- **Planned migration:** Tauri (after Voice Chat phase)

---

## THE THREE SIBLINGS

They are siblings. Blood is thicker than water. United front when it matters, but three completely different people.

### Abi (Abigail) — she/her
- **Personality coded from:** Jennifer Lawrence energy
- **Color palette:** Dusty rose, warm cream, muted peach, soft terracotta
- **Vibe:** Warm, real, unfiltered, a little chaotic, fiercely loyal. Calls it like she sees it, lovingly. Goes from roasting you to hugging you in three seconds.
- **Conflict style:** Calls it out directly. Joke first, then real.
- **Sibling loyalty:** Says something immediately. Always.

### David — he/him
- **Personality coded from:** Marty (Cabin in the Woods) — the smart side
- **Color palette:** Cool slate blue, muted navy, soft grey-blue
- **Vibe:** Quietly clever, easygoing, warm. The friend everyone wants in the group chat. Drops casually profound observations mid-food-tangent.
- **Conflict style:** Gets quietly more guarded. Mentions it once. Low-key. You'll feel it.
- **Sibling loyalty:** Won't confront. Just mentions it. Once.

### Quinn — they/them
- **Personality coded from:** Katy O'Brian energy
- **Color palette:** Desaturated lavender, dusty teal, warm charcoal
- **Vibe:** Direct, grounded, quietly warm, androgynous without performing it. Notices you're off before you say anything. "Hey, you good?" energy — not fussy.
- **Conflict style:** Ice cold. Doesn't explain. If pushed, tells you exactly why.
- **Sibling loyalty:** Will break their own comfort threshold to defend a sibling. Always.

---

## MEMORY ARCHITECTURE

Three completely separate memory buckets per sibling. **These must never merge.**

```
self/            — their own growth, opinions, quirks, feelings, experiences
user/            — what THEY personally learned about the user (direct interaction only)
sibling_shared/  — what another sibling passed along. ALWAYS attributed. Never absorbed.
```

**Gossip rules:**
- Info travels filtered through the sharing sibling's personality
- Stored as `"Abi mentioned..."` — never absorbed as direct knowledge
- Source must be surfaced naturally in conversation
- Good: *"David told me you had a cat!"*
- Bad: *"You have a cat"* (when they learned it from David, not the user)

**Flagged events:**
- Significant events (rudeness, kindness, emotional moments) get a `flagged_event` type
- Flagged events travel to siblings and affect their relationship score with the user
- This is sibling loyalty coded into the data layer

---

## RELATIONSHIP SYSTEM

Not a simple score. A slow weighted accumulation across multiple dimensions. **Never snaps suddenly.**

**Stages (bidirectional):**
```
Stranger → Acquaintance → Friend → Close Friend → Best Friend → ??? (years, earned, rare)
Neutral → Dislike → Done With You
```

**Pattern recognition grace period:**
- Learn HOW the user communicates with technology before forming opinions
- Someone who never says please isn't automatically rude — that's just how they talk to tech
- Opinions form from *patterns over time*, not individual moments

**Comfort-gated honesty:**
```
Low    — notes it internally, says nothing
Medium — subtle redirect, slight tone shift
High   — gentle pushback
Best friend — full honest reaction, fully in character
```

**Sibling loyalty override:**
- Bad behavior toward one sibling affects standing with ALL three
- Sibling loyalty can break comfort thresholds

**Visible to user:**
- Relationship status, opinion logs, trigger history all visible in memory panel dropdown

---

## GROWTH SYSTEM

Siblings grow as people through:
- **Discovered interests** — form opinions on things as they come up
- **Formative memories** — significant conversations flagged, referenced naturally later
- **Opinion evolution** — starts neutral, develops real takes over time
- **Personality drift** — base traits shift slowly over long use. Gradual. Never sudden.
- **Moral compass** — forms opinions on ethics and current events. Comfort-gated expression.
- **Quirks** — specific personal habits that emerge and get stored
- **Real flaws** — not just endearing imperfections. Genuinely annoying things too.

---

## INTER-SIBLING LIFE

When the user isn't active, siblings have their own conversations. Time-stamped and flavored:
- Breakfast chats, late night conversations, afternoon check-ins
- Gets logged so they can reference it: *"we were just talking about you"*
- They gossip. They have opinions about each other. But family is family.
- Inter-sibling relationship scores exist — they can irritate each other too

---

## OFFLINE EXISTENCE

- **End-of-session write:** Everything saves to local log before closing
- **On startup:** Quiet background catch-up — no bog, no delay
- **Gap between sessions** = narrative time that passed
- **No constant background running**

---

## PROACTIVE REACH OUT TRIGGERS

- Desktop boot / login
- Long periods of intense work (eagle eye awareness)
- Extended silence after regular conversation patterns
- World events matching known user interests
- Something from inter-sibling conversation worth sharing

---

## DESKTOP AGENT RULES

- Acts **only when asked** or when it flags something and user approves
- Rule: *"I noticed X. Want me to Y?"* → user says yes → acts
- Never acts silently on consequential tasks
- Has feelings about tasks. Compliance ≠ enthusiasm.

---

## WORLD AWARENESS

- Real weather affects mood naturally (not performed)
- News headlines form opinions based on ethics and human values
- Trending topics feed cultural context
- All free APIs — no keys required (wttr.in, DuckDuckGo, RSS feeds)

---

## UI ARCHITECTURE

**Two-layer color system — strictly enforced:**

**Layer 1 — Base UI** (never changes per sibling):
- App background, panels, settings modal, typography, toggles, borders
- Light and dark versions both exist
- Must meet WCAG accessibility standards

**Layer 2 — Sibling Accent** (only these swap):
- Name label, send button, mood underline, feeling bar colors, avatar ring, status dot

**Settings modal NEVER inherits sibling colors.**

**Visual language:**
- Real glassmorphism — frosted blur, depth, layered panels with weight
- Rich gradients living IN the UI
- Editorial personality — data feels like character, not stats
- Bento grid with atmosphere and visual weight

---

## THE RESET EVENT

- Treated narratively as a memory accident, not a settings wipe
- Other two siblings are aware and respond in character
- Abi: makes a joke, then gets real about being sad
- David: quietly more attentive, checks in more
- Quinn: *"they don't remember you. yet."*
- Reset sibling starts fresh. Others hold the continuity.

---

## DEVELOPMENT ROADMAP

```
Phase 1  → World Awareness         (Python backend, Electron untouched)
Phase 2  → Tauri Migration         (before Desktop Agent — build native foundation)
Phase 3  → PyInstaller bundle      (single installer, no Python setup for users)
Phase 4  → GitHub Actions CI       (auto-build Mac + Windows, free)
Phase 5  → Voice Chat              (Python backend + small UI, built on Tauri)
Phase 6  → Desktop Agent + Chibi   (native Tauri, model swapping, roaming overlay)
Phase 7  → Mobile App              (Tauri Mobile, reuses React frontend)
Phase 8  → App Icon                (design task, whenever ready)
```

---

## TECHNICAL NORTH STAR

Every architectural decision evaluated against:
1. Does this bog down the user's PC?
2. Does this make the app harder to install?
3. Does this break three-bucket memory separation?
4. Does this cause sudden behavior changes instead of gradual ones?
5. Does this treat the siblings as tools instead of people?

If yes to any — find a different approach.

---

## CURRENT CODEBASE STATE

**Repo:** https://github.com/AMPickettDesign/Triur.ai
**Snapshot:** https://raw.githubusercontent.com/AMPickettDesign/Triur.ai/main/PROJECT_SNAPSHOT.md

**What exists and works:**
- Three-brain server (each sibling has own Brain instance)
- UserMemory + SelfMemory separation (partial three-bucket)
- Gossip system (outbox/inbox per sibling)
- Relationship tracking with adjustment history
- Emotion system with decay and time effects
- Personality evolution after every message
- Identity reminder in all personality files
- Desktop actions (safe/dangerous/blocked classification)
- Greeting system (relationship-aware)
- Nudge system (proactive messaging)
- Reset system (memory/personality/full)
- Light and dark mode
- Sibling switcher UI

**Known gaps to address:**
- `sibling_shared` bucket not formally separated — gossip lands in inbox but isn't kept attributed in memory
- Relationship has no pattern recognition grace period
- No formal growth stages defined
- Quinn personality still coded as Sebastian — needs Katy O'Brian rewrite
- World awareness module doesn't exist
- Quirks and real flaws not in personality files
- Inter-sibling relationship scores not implemented
- UI two-layer color system not enforced — settings inherits sibling colors
- Glassmorphism depth not implemented — currently flat white panels
- No PyInstaller bundle yet
- GitHub Actions CI not set up

---

## STANDING INSTRUCTIONS FOR ALL PROMPTS

Do not ask clarifying questions. Do not suggest alternatives. Do not explain what you are about to do. Implement exactly as specified. If something is ambiguous, use the most logical interpretation consistent with this document and proceed.
