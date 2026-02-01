# Misconception Mentor — Hackathon Demo Packet

> **Last updated:** January 2026  
> **Repo verified:** All features listed below have been confirmed in source code

---

## 1) One-liner

A math practice app that diagnoses the **specific misconception** behind a student's wrong answer (ranked top-3), shows evidence from their explanation, and generates targeted remediation + a follow-up question.

---

## 2) 10-Second Differentiator

**Not just another AI tutor.** Most tutors tell students "wrong, try again" or reveal the answer. Misconception Mentor:

1. **Diagnoses WHY** the student is wrong (not just that they're wrong)
2. **Ranks top-3 likely misconceptions** with confidence scores
3. **Quotes evidence** from the student's own explanation
4. **Generates a targeted follow-up question** that specifically addresses the misconception
5. **Separates "review errors" (typos/slips)** from true conceptual misunderstandings — never reveals the answer for typos

---

## 3) Feature Inventory

| Feature | Status | Where it lives | How to demo |
|---------|--------|----------------|-------------|
| **Misconception Engine (Top-3 Ranking)** | ✅ Implemented | `/api/diagnose/route.ts` | Answer "2/6" for "1/4 + 1/2" → see ranked misconceptions |
| **Review Error Detection** | ✅ Implemented | `/api/evaluate/route.ts` → `detectReviewError()` | Type "111" instead of "11" → amber "Review Error" card (no answer revealed) |
| **Format Typo Detection** | ✅ Implemented | `/api/evaluate/route.ts` → `detectFormatTypo()` | Type "5/" (malformed fraction) → review error before AI is called |
| **Fraction Swap Heuristic (FRAC-SWAP)** | ✅ Implemented | `/api/diagnose/route.ts` → `detectFractionSwap()` | Answer "4/3" when correct is "3/4" → FRAC-SWAP top with 95% confidence |
| **Voice Input (Speech-to-Text)** | ✅ Implemented | `/components/VoiceInput.tsx` | Click mic in "Explain your thinking" → speak → text appears |
| **Text-to-Speech (Read Aloud)** | ✅ Implemented | `/api/tts/route.ts`, `/components/ReadAloudButton.tsx` | Click speaker icon on any feedback text |
| **Teacher Avatar** | ✅ Implemented | `/components/TeacherAvatar.tsx` | See animated teacher on practice page; draggable, walks to anchors |
| **Avatar Narration Choreography** | ✅ Implemented | `/components/NarrationScript.tsx` | On incorrect answer, avatar walks to each section and explains |
| **Focus Mode (Keyboard-First)** | ✅ Implemented | `/components/FocusModeToggle.tsx`, DelightProvider | Toggle Focus Mode → Enter to submit, Enter to advance |
| **Difficulty Ladder (Levels 1-10)** | ✅ Implemented | `content/questions.json`, `/components/DifficultyMeter.tsx` | 60 questions/topic, ordered easy→hard within session |
| **Mastery Health Bars (Coverage + Accuracy)** | ✅ Implemented | `/learn/page.tsx` → `computeTopicMastery()` | See 0-100% bars per topic on Learn page |
| **Sound Effects + Confetti** | ✅ Implemented | `/lib/delight.ts`, `/components/DelightProvider.tsx` | Get 3 correct → confetti + sound |
| **Coach Notes (Personalized Feedback)** | ✅ Implemented | `/api/evaluate/route.ts` → `generateCoachNotes()` | Type detailed explanation → see "Coach Notes" with what went well/work on |
| **Interactive Follow-Up Question** | ✅ Implemented | Practice page (after incorrect) | After misconception shown, answer the follow-up question inline |
| **Teach-Back Prompt** | ✅ Implemented | Practice page (after incorrect) | Purple box prompting student to explain the concept in their own words |
| **Learn Content (Read→Practice)** | ✅ Implemented | `content/lessons.json`, `/learn/[topicId]/page.tsx` | Click "Read" on a topic → see explanation + worked example + resources |
| **Curated External Resources** | ✅ Implemented | `content/misconceptions.json`, `content/lessons.json` | "Learn More" links to Khan Academy, MathIsFun, IXL |
| **Multilingual UI (5 languages)** | ✅ Implemented | `/i18n/`, `/components/I18nProvider.tsx` | Language selector → UI changes to Spanish/French/Chinese/Hinglish |
| **AI Output in Selected Language** | ✅ Implemented | `/api/evaluate/route.ts`, `/api/diagnose/route.ts` | Switch to Spanish → AI feedback appears in Spanish |
| **Multilingual Speech-to-Text** | ✅ Implemented | `/components/VoiceInput.tsx` → `STT_LANGUAGE_MAP` | Switch to Spanish → speak Spanish → transcribed correctly |
| **Thinking Autosave (localStorage)** | ✅ Implemented | `/lib/thinking-drafts.ts` | Type in explanation → draft auto-saved; navigate away → recovers |
| **Thinking Log in Coach Notes** | ✅ Implemented | Practice page, `/api/evaluate` | All thinking (initial + follow-up + teach-back) included in coach notes |
| **Adaptive Nudges (Focus Mode)** | ✅ Implemented | `/components/AvatarProvider.tsx` → `useAdaptiveNudges()` | If idle too long, avatar nudges student |
| **Encouragement Phrases (Anti-Monotony)** | ✅ Implemented | `/lib/encouragement.ts` | Avatar says varied phrases; no repeats in last 5 messages |
| **Debug Page** | ✅ Implemented | `/debug/page.tsx` | `/debug` → test all APIs + see Supabase writes without DevTools |
| **Developer Debug Console (/debug)** | ✅ Implemented | `src/app/debug/page.tsx`, `/lib/supabase/db.ts`, `/lib/language-detect.ts` | Open `/debug` → click "Run Evaluate Test" → show strict JSON + Supabase attempts check (5 seconds) |
| **Supabase Auth** | ✅ Implemented | `/lib/supabase/`, `/components/AuthProvider.tsx` | Sign in with email/password; data persists |
| **Supabase Database** | ✅ Implemented | `/lib/supabase/db.ts` | Attempts, mastery, misconception stats all stored |
| **Demo Mode** | ✅ Implemented | Env var `DEMO_MODE=true` | Returns canned responses for reliable demo |
| **Roman Hindi Language Detection** | ✅ Implemented | `/lib/language-detect.ts` | Debug page shows "Roman Hindi (hi-Latn)" correctly |
| **Settings Popover** | ✅ Implemented | `/components/SettingsPopover.tsx` | Gear icon → toggle sound, confetti, avatar, voice, etc. |

---

## 4) Core User Flows

### Flow A: Learn → Practice → Feedback → Progress

```
1. LEARN TAB
   └─ See 4 lesson cards (Fractions, Negatives, Linear Equations, Mixed Review)
   └─ Each shows mastery % health bar + "Next up" hint (lowest skill)
   └─ Click "Read" → Lesson detail (explanation + worked example + resources)
   └─ Click "Practice This Topic" → starts practice session

2. PRACTICE TAB
   └─ Questions ordered easy→hard (difficulty 1-10)
   └─ Student enters answer + optional explanation (type or speak)
   └─ Click "Check" (or Enter in Focus Mode)

3. FEEDBACK
   ├─ IF CORRECT:
   │    └─ Green banner + reinforcement + confetti (if streak)
   │    └─ Press Enter or click "Next Question"
   │
   ├─ IF REVIEW ERROR (typo/slip):
   │    └─ Amber banner: "Review error detected (extra digit)"
   │    └─ NO correct answer revealed
   │    └─ "Try Again" or see collapsed solution
   │
   └─ IF MISCONCEPTION ERROR:
        └─ Pink banner: "Not quite right"
        └─ Solution steps shown
        └─ TOP-3 MISCONCEPTIONS ranked with:
            • Confidence score (0-1)
            • Evidence quoted from student explanation
            • Diagnosis (1 sentence)
            • Remediation (micro-lesson)
            • Key Takeaway (max 12 words)
        └─ Follow-up question (interactive, submit inline)
        └─ Teach-back prompt (explain concept in own words)
        └─ "Learn More" resources (Khan Academy links)
        └─ Coach Notes (what went well / what to work on)

4. PROGRESS (Learn Tab)
   └─ Mastery bars update (coverage × accuracy)
   └─ "Top misconceptions this week" list
   └─ "Top review errors this week" list
   └─ Coach Notes panel shows recent personalized feedback
```

---

## 5) The "WOW Moments" to Highlight (Top 5)

### 1. 🎯 Misconception Diagnosis with Evidence
**What:** AI identifies the specific misconception AND quotes evidence from the student's explanation.  
**Demo:** Answer "2/6" for "1/4 + 1/2" with explanation "I added tops and bottoms"  
**Wow:** See "Evidence: 'I added tops and bottoms'" in the diagnosis card.

### 2. 🔒 Review Error Detection (No Answer Leak)
**What:** Typos/slips are caught WITHOUT revealing the answer.  
**Demo:** Type "111" when answer is "11"  
**Wow:** Shows "Review error: extra digit" but NEVER shows "Did you mean 11?"

### 3. 👩‍🏫 Animated Teacher Avatar with Narration
**What:** Teacher walks to each section, points, and explains.  
**Demo:** Get a wrong answer → watch avatar walk to "Key Takeaway", then "What Went Wrong", then "Solution Steps"  
**Wow:** Right-angle walking with heel clicks, speech bubbles, draggable position.

### 4. 🎤 Voice Input in Multiple Languages
**What:** Speak your explanation in Spanish/French/Hindi instead of typing.  
**Demo:** Switch to Spanish → click mic → speak "Sumé los numeradores"  
**Wow:** Transcription appears in real-time, AI feedback also in Spanish.

### 5. 📊 Coverage-Based Mastery (Not Just Accuracy)
**What:** Can't reach 100% mastery by only doing one type of problem.  
**Demo:** Show mastery bar, then "Next up: frac_unlike_denom" hint  
**Wow:** Student must practice ALL subskills, not game the system.

### Bonus WOW: 🛠️ Developer Debug Console (/debug)
**What:** A built-in debug page that lets you test every API endpoint, inspect strict JSON outputs, and verify Supabase writes—all without opening DevTools.  
**Demo:** Open `/debug` → click "Run Evaluate Test" → see structured JSON response with `error_class`, `misconception` data, and DB write confirmation.  
**Wow:** Shows judges that the system is built for reliability and observability. Every AI response is validated with Zod schemas, and you can verify database writes in one click.

---

## 6) 90–120 Second Demo Script

### Setup (before recording)
- Clear browser storage OR use incognito
- Sign in (or stay as guest)
- Set language to English (can switch mid-demo)
- Enable sound + confetti in Settings

---

### Script (say this while clicking)

**[0:00-0:10]** *Start on Learn tab*  
"This is Misconception Mentor—a math practice app that diagnoses WHY students get answers wrong, not just THAT they're wrong. Let's see it in action."

**[0:10-0:25]** *Click Read on Fractions*  
"First, students can read a quick lesson. Here's the explanation, a worked example, and curated resources from Khan Academy. Now let's practice."  
*Click "Practice This Topic"*

**[0:25-0:50]** *Question page: 1/4 + 2/4*  
"Here's a fraction problem. Watch what happens when I make a conceptual mistake."  
*Type "2/8" in answer*  
*Type "I added the tops and bottoms" in explanation*  
*Click Check*

**[0:50-1:15]** *Feedback renders*  
"The AI didn't just say 'wrong'—it diagnosed the SPECIFIC misconception: 'Adding numerators and denominators separately.' It even quoted my explanation as evidence."  
*Point to Key Takeaway*  
"This is the one thing to remember. And here's a follow-up question that targets my exact mistake."

**[1:15-1:35]** *Show Review Error*  
*Click Next → new question → type correct answer with extra digit*  
"Now watch what happens with a simple typo."  
*Type "111" instead of "11"*  
"It detected a review error—an extra digit—but it NEVER revealed the correct answer. No cheating!"

**[1:35-1:50]** *Go to Learn tab*  
"Back on Learn, I can see my mastery health bar and my top misconceptions this week. The system tracks everything."

**[1:50-2:00]** *Wrap up*  
"Misconception Mentor: diagnose the WHY, not just the wrong. Built with Next.js, Supabase, and OpenAI."

---

### (Optional) Behind-the-Scenes Segment [+10-15 seconds]

**[2:00-2:15]** *Open /debug in a new tab*  
"Quick peek under the hood: our debug console lets us test any API endpoint and verify database writes without opening DevTools."  
*Click "Run Evaluate Test"*  
"See? Structured JSON output with Zod validation. Every misconception diagnosis is type-safe and stored in Supabase."

---

## 7) Sponsor/Tooling Callouts (Only If Implemented)

| Tool | Usage | Where in Code |
|------|-------|---------------|
| **Supabase** | Auth (email/password), Postgres DB (attempts, mastery, misconception_stats) | `/lib/supabase/`, tables in `001_initial_schema.sql` |
| **OpenAI** | GPT-4o-mini for evaluate + diagnose endpoints, JSON mode | `/api/evaluate/route.ts`, `/api/diagnose/route.ts` |
| **OpenAI TTS** | Text-to-speech for read-aloud (tts-1 model) | `/api/tts/route.ts` |
| **Web Speech API** | Browser-native speech-to-text (no 3rd party) | `/components/VoiceInput.tsx` |
| **Vercel** | Recommended deployment target | `vercel.json` (if present) |
| **Zod** | Strict JSON schema validation for AI responses | `/api/diagnose/route.ts` |

---

## 8) Reliability / Demo Safety Notes

### How to Run Locally

```bash
# 1. Clone and install
git clone <repo-url>
cd misconception-mentor
npm install

# 2. Create .env.local with these variables:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
OPENAI_API_KEY=sk-your-openai-key

# 3. (Optional) Enable demo mode for canned responses
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true

# 4. Run the database migration in Supabase SQL Editor
# File: supabase/migrations/001_initial_schema.sql

# 5. Start dev server
npm run dev

# 6. Open http://localhost:3001
```

### Required Environment Variables (names only)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (client-side) |
| `OPENAI_API_KEY` | ✅ | OpenAI API key (server-side only) |
| `DEMO_MODE` | Optional | If `true`, returns canned responses |
| `NEXT_PUBLIC_DEMO_MODE` | Optional | If `true`, shows demo badge in UI |

### Recommended "Demo Path" (works consistently)

1. **Start on Learn tab** → establishes context
2. **Click Read on Fractions** → shows lesson content
3. **Click Practice This Topic** → starts practice
4. **Answer question with "2/6"** (any fraction question) → triggers misconception
5. **Answer follow-up correctly** → shows learning loop
6. **Type extra digit for next question** → shows review error detection
7. **Return to Learn tab** → shows progress update

### Demo Mode

If `DEMO_MODE=true`, the AI endpoints return predictable canned responses:
- Always works even without OpenAI key
- Useful for video recording (no API latency)
- Shows "Demo Mode" badge in UI

### Privacy/Safety Note for /debug Demo

⚠️ **Before recording the /debug page:**
- User emails and IDs are **automatically masked** (e.g., `jo***@example.com`, `abc123...`)
- Use a **demo-safe account** anyway for extra safety
- The debug page is **dev-only by default** — shows 404 in production unless enabled
- To enable in production: add `NEXT_PUBLIC_ENABLE_DEBUG_PAGE=true` to `.env.local`
- If showing Supabase writes, ensure no real student data is visible

---

## 9) Known Limitations / Rough Edges

| Issue | Severity | Notes |
|-------|----------|-------|
| **Limited topics (3)** | Expected | MVP scope: Fractions, Negatives, Linear Equations only |
| **No mobile optimization** | Medium | Works on desktop; mobile usable but not polished |
| **Speech-to-text browser support** | Medium | Chrome/Edge best; Firefox/Safari limited |
| **Hinglish STT outputs Devanagari** | Low | Browser limitation; transcribes Hindi script, not Roman |
| **No spaced repetition** | Expected | Out of scope for MVP |
| **No teacher/parent dashboard** | Expected | Out of scope for MVP; data is in DB |
| **Avatar may overlap content** | Low | Draggable; user can move it |
| **AI latency (2-4s)** | Expected | OpenAI API; use Demo Mode for instant responses |
| **No offline mode** | Expected | Requires network for AI and Supabase |

---

## 10) Checklist for Recording the Video

### Pre-Recording
- [ ] Clear localStorage / use incognito
- [ ] Sign in (or sign up fresh)
- [ ] Enable sound + confetti in Settings (gear icon)
- [ ] Set language to English
- [ ] Make sure microphone works (for voice demo)
- [ ] Close unneeded browser tabs

### Recording Order

| # | Page/Action | What to capture |
|---|-------------|-----------------|
| 1 | **Learn tab** | 4 lesson cards with mastery bars |
| 2 | **Click "Read" on Fractions** | Lesson content, worked example, resources |
| 3 | **Click "Practice This Topic"** | Transition to practice |
| 4 | **Answer incorrectly (misconception)** | Type "2/6" for any fraction question |
| 5 | **Feedback screen** | Misconception diagnosis, evidence, remediation, follow-up |
| 6 | **Answer follow-up** | Interactive follow-up evaluation |
| 7 | **Next question → Review error** | Type extra digit (e.g., "111" for "11") |
| 8 | **Review error feedback** | Amber banner, no answer revealed |
| 9 | **Learn tab (return)** | Updated mastery + misconception list |
| 10 | **(Optional) Settings** | Show toggles for sound, avatar, etc. |
| 11 | **(Optional) Language switch** | Change to Spanish, show translated UI + AI |
| 12 | **(Optional) Voice input** | Click mic, speak explanation |
| 13 | **(Optional) /debug console** | Open `/debug` in advance (signed in with demo account), click "Run Evaluate Test", show for 5 seconds |

### Post-Recording
- [ ] Review audio levels
- [ ] Trim dead air
- [ ] Add intro/outro if required
- [ ] Export at required resolution

---

## Quick Links

| Resource | Path |
|----------|------|
| PRD | `/PRD.md` |
| Architecture | `/architecture.md` |
| Build Context | `/CONTEXT.md` |
| Debug Page | `http://localhost:3001/debug` |
| Questions Bank | `/content/questions.json` |
| Misconceptions Library | `/content/misconceptions.json` |
| Lessons Content | `/content/lessons.json` |

---

*Generated from repo source code. For the most accurate info, always verify against the actual codebase.*
