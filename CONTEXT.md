# Misconception Mentor — Build Context

## 📦 Hackathon Demo Packet
**For demo prep, video recording, and judging:** See [`HACKATHON_DEMO_PACKET.md`](./HACKATHON_DEMO_PACKET.md)
- One-liner + differentiator
- Feature inventory (what's implemented vs planned)
- Demo script (90-120 seconds)
- WOW moments to highlight
- Recording checklist

**Optional demo segment:** The `/debug` page can be shown as a "behind-the-scenes" moment to demonstrate structured JSON outputs, Zod validation, and Supabase write verification. Use a demo-safe account when recording.

**Debug Page Access Control:**
- `/debug` is available by default in development (`npm run dev`)
- In production/demo builds, add `NEXT_PUBLIC_ENABLE_DEBUG_PAGE=true` to `.env.local` to enable
- User email and ID are masked for privacy (shows `jo***@example.com` and first 6 chars of ID)
- Without the env flag, `/debug` returns 404 in production

---

## Current Status
**Focus Mode Keyboard-First + Adaptive Nudges: COMPLETE ✅**

## What's Done
### Focus Mode Keyboard-First + Timer Freeze + Adaptive Nudges ✅
- Keyboard-first flow: Enter to submit, Enter to advance
- Answer input auto-focuses on every new question
- Timer freezes at submit (shows time-to-first-submit only)
- Separate Accuracy and Speed scores in Learn panel
- Adaptive nudges based on inactivity and user's baseline speed

### Dynamic Avatar Encouragement ✅
- Context-aware encouragement phrases (correct, incorrect, streaks, comebacks, fast answers)
- Anti-monotony: no repeat phrases in last 5 messages
- Settings toggle to enable/disable encouragement
- Debug section to test all encouragement scenarios

### Draggable Teacher Avatar ✅
- Avatar can be click-dragged to any position on screen
- Drag threshold (8px) prevents accidental drags
- Position persisted in localStorage as viewport percentages
- After anchor walking, avatar returns to saved home position
- Reset button in Settings and /debug to restore default position

### Narration Script + Avatar Choreography ✅
- Canonical narration script with ordered segments (key takeaway → what went wrong → solution steps)
- Avatar choreography: walks to section, points, speaks, then moves to next
- Right-angle walking (horizontal first, then vertical) with heel click footsteps
- Avatar resets to home dock on route/question change
- Avatar default size increased to Large (~3x bigger)
- New XL size option for maximum presence

### Mastery Bars ✅
- Replaced "Not started / Learning / Solid" pills with mastery health bars (0–100%)
- Each question has a `skill_tag` for subskill tracking
- Mastery is computed from coverage + accuracy across all subskills
- "Next up" hint shows the subskill that needs most work

### Chunk 1-10 ✅
- Next.js 14 + TypeScript + Tailwind scaffold
- UI shell with Learn/Practice tabs
- Content JSON (18 questions, 22 entries including review error types)
- Practice flow with feedback pages
- Supabase auth + database tables
- POST /api/evaluate with OpenAI
- POST /api/diagnose (Misconception Engine)
- Learn dashboard with real Supabase data
- Demo mode + error handling + polish
- Session shuffle + progress visibility
- **Review Errors** as a first-class category

### Review Errors Chunk ✅
- [x] Renamed terminology: "careless" → "review error" everywhere
- [x] Updated `misconceptions.json`:
  - Review error entries use `REVIEW:*` IDs (e.g., `REVIEW:extra_digit`)
  - Category field: `"review_error"` or `"misconception"`
- [x] Updated types:
  - `ErrorClass`: `"correct" | "review_error" | "misconception_error"`
  - `ReviewErrorType`: `"extra_digit" | "sign_slip" | ...`
- [x] Updated `/api/evaluate`:
  - `detectReviewError()` function (deterministic heuristics, no LLM)
  - Returns `error_class`, `review_error_type`, `review_error_message`
  - `review_error_message` does NOT reveal the correct answer
- [x] Updated Practice UI:
  - "Review Error Detected" banner (amber)
  - Messaging: "Review error detected: likely a quick slip (extra digit)."
  - NO "Did you mean {answer}?" confirmation
  - "If you truly meant this answer, here are likely misconceptions…"
- [x] Updated Learn dashboard:
  - Separate bars for "Misconception errors" and "Review errors"
  - "Top review errors this week" list (from REVIEW:* stats)
  - "Top misconceptions this week" list (excludes REVIEW:*)
- [x] Updated PRD.md and architecture.md with Review Errors documentation

## How to Run Locally

### 1. Set environment variables
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
OPENAI_API_KEY=sk-your-openai-key-here

# Optional: Enable demo mode
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
```

### 2. Run the database migration
In Supabase SQL Editor, run `supabase/migrations/001_initial_schema.sql`

**Note:** You may need to add columns if upgrading:
```sql
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS error_type text;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS careless_kind text;
```

### 3. Install & run
```bash
npm install
npm run dev
```

### 4. Open http://localhost:3001

## Acceptance Tests

### Test 1: Review Error - Extra Digit (No Answer Reveal)
1. Sign in
2. Go to Practice → Negatives → Start Practice
3. For a question with answer "11", enter **"111"** (extra digit)
4. Click Check
5. **Expected:**
   - Amber banner: "Review Error Detected"
   - Shows: "Review error detected: likely a quick slip (extra digit). Double-check your number and try again."
   - **Does NOT show** "Did you mean 11?" or any correct answer
   - **Does NOT show** confirmation buttons
   - Shows "Try Again" button as natural next step
   - Console logs: `REVIEW:extra_digit`
   - Solution hidden behind "Show Solution" button
   - Misconception section: "If you truly meant this answer, here are likely misconceptions…"

### Test 2: Misconception Error - Full Diagnosis (No Review Error Card)
1. For a question with answer "3/4", enter "5/8" (conceptually wrong)
2. Click Check
3. **Expected:**
   - Pink banner: "Not quite right"
   - Shows solution steps immediately
   - Shows full misconception analysis
   - NO "review error" card
   - Console logs the top misconception ID (not REVIEW:*)

### Test 3: Learn Dashboard Shows Separate Bars
1. Complete practice with a mix of review errors and misconception errors
2. Go to Learn tab
3. **Expected:**
   - "Mistakes (last 10)" section shows:
     - Misconception errors bar (pink) with count
     - Review errors bar (amber) with count
   - "Top review errors this week" list (if any REVIEW:* stats)
   - "Top misconceptions this week" list (excludes REVIEW:*)

### Test 4: Review Error Logged to Stats
1. Open Console
2. Complete a practice question with a review error (e.g., "111" for "11")
3. **Verify logs:**
   - `[PracticeQuestion] Updating review error stat for: REVIEW:extra_digit`
4. Go to Learn → Refresh → Check "Top review errors this week" list

### Test 5: Interactive Follow-Up Question
1. Sign in
2. Go to Practice → Fractions → Start Practice
3. For a question like "1/4 + 1/2", enter "2/6" (conceptual error)
4. Click Check
5. **Expected:**
   - Pink banner: "Not quite right"
   - Misconception analysis appears
   - **Follow-up question card** shows:
     - Question prompt in blue box
     - "Your Answer" input field
     - "Show your thinking" textarea (optional)
     - "Check Follow-up" button
6. Enter an answer in the follow-up input and click "Check Follow-up"
7. **Expected:**
   - Result card appears (green for correct, pink for incorrect)
   - If incorrect, shows solution steps and top misconception
   - "✓ Saved" indicator appears (if signed in)
   - A new attempt is saved in Supabase with `question_id` starting with `followup:`

### Test 6: Teach-Back Response
1. After an incorrect answer with misconception analysis
2. Find the purple "Teach-back" section at the bottom
3. **Expected:**
   - Shows a prompt like "Can you explain in your own words...?"
   - Text area for response
   - "Save Response" button
4. Type a response and click "Save Response"
5. **Expected:**
   - "Saving..." loading state
   - "Response saved!" confirmation with your response quoted
   - A new attempt is saved with `question_id` starting with `teachback:`

### Test 7: Voice Input - Original Explanation
1. Go to Practice → any topic → Start Practice
2. Find the "Explain your thinking" field
3. **Verify:** "Type | Speak" toggle appears on the right of the label
4. Click **"Speak"** toggle
5. Click the **mic button** (yellow, appears in textarea)
6. **Expected:**
   - Mic button turns red and pulses
   - "Recording... speak now" indicator appears
   - Say "I multiplied three times four"
   - Text appears in the textarea
7. Click the stop button (red square)
8. **Expected:** Recording stops, final text is in the box
9. Click **"Type"** to switch back → can edit the text manually

### Test 8: Voice Input - Follow-up Explanation
1. Complete a misconception error to see the follow-up question
2. Find the "Show your thinking" field in the blue follow-up box
3. **Verify:** Type/Speak toggle appears
4. Click Speak → mic button → speak → text appears
5. Text saves correctly with "Check Follow-up"

### Test 9: Voice Input - Teach-back Response
1. After a misconception error, scroll to purple teach-back section
2. **Verify:** Type/Speak toggle appears above the textarea
3. Click Speak → mic button → speak → text appears
4. Click "Save Response" → saves correctly

### Test 10: Voice Input - Graceful Fallback
1. Open in a browser without SpeechRecognition (e.g., some Firefox versions)
2. **Expected:**
   - Type/Speak toggle does NOT appear (or shows message)
   - Typing still works normally

### Test 11: Key Takeaway Highlight
1. Complete a misconception error (e.g., "2/6" for "1/4 + 1/2")
2. **Verify** misconception analysis shows:
   - 🎯 **Key Takeaway** in a green highlighted box (dashed border)
   - The takeaway is a short, memorable statement (max ~12 words)
   - Example: "Same denominators first, then add the tops!"
3. Key takeaway only appears for the TOP misconception

### Test 12: Learn More Links
1. After a misconception error, look for the "📚 Learn More" card
2. **Verify:**
   - Card shows 1-3 resource links
   - Each link has an icon: 🎬 (video), 📄 (article), ✏️ (practice)
   - Links open in **new tab** (external sites)
3. Test a misconception with specific resources (e.g., FRAC-01)
   - Should show misconception-specific resources
4. Test a misconception without resources (e.g., FRAC-02)
   - Should fall back to topic-level resources for fractions

### Test 14: Coach Notes - With Explanation
1. Sign in
2. Go to Practice → Fractions → Start Practice
3. Enter a wrong answer (e.g., "2/6")
4. In "Explain your thinking", type: "I added the tops and bottoms because that's how you add numbers"
5. Click Check
6. **Verify:**
   - "Coach Notes (from your thinking)" section appears
   - "What went well" shows something like "You explained your reasoning—that's great!"
   - "What to work on" shows a hint about reviewing the concept
   - **"Remember"** line is highlighted yellow: "Understanding why helps more than memorizing how."
   - "Next step" shows an actionable item

### Test 15: Coach Notes - Without Explanation
1. Answer a question WITHOUT typing an explanation (leave it blank)
2. **Verify:**
   - Coach Notes section appears but says:
   - "What to work on: I couldn't see your thinking this time."
   - **"Remember"** → "Explaining helps me coach you better!"
   - "Next step" → "Write 1–2 sentences next time so I can help with your specific approach."

### Test 16: My Coach Notes on Learn Page
1. After completing Test 14, go to Learn page
2. **Verify:**
   - "My Coach Notes" panel appears below Your Progress
   - Shows the recent coach note with:
     - Topic label (e.g., "fractions")
     - Date
     - 💡 Remember line (highlighted)
     - Next step
3. If no attempts have coach notes yet, shows empty state: "No coach notes yet!"

### Test 18: Learn Tab - Lesson Cards
1. Go to **Learn** tab
2. **Verify** each lesson card shows:
   - Status badge (Not started / Learning / Solid)
   - **Read** button (book icon)
   - **Practice** button (pencil icon)
3. Click "Read" on Fractions → goes to `/learn/fractions`
4. Click "Practice" on Fractions → goes to `/practice/fractions`

### Test 19: Lesson Detail Page
1. Go to **Learn → Read** on any topic (e.g., Fractions)
2. **Verify** the lesson detail page shows:
   - Title and overview
   - **Key Concepts** with 1-2 paragraphs
   - **Worked Example** with problem, steps, and answer
   - **Key Takeaways** (3 bullets)
   - **Learn More** section with 3 resource cards (video/article/practice)
   - **Practice This Topic** CTA button
3. Click a resource card → opens Khan Academy in new tab
4. Click "Practice This Topic" → goes to practice set

### Test 20: Demo Polish Check
1. Navigate through Learn → Read → Practice flow
2. **Verify** the flow feels polished:
   - Clear visual hierarchy
   - Smooth transitions
   - Resources load with type icons (🎬 video, ✏️ practice, 📄 article)
   - CTA is prominent and clear

### Test 22: Difficulty-Based Session Order
1. Go to **Practice → Fractions → Start Practice**
2. Note the first 3-5 question IDs (or prompts)
3. Go back, click **New Session (🔄)**
4. Start again → **first 5 questions should differ in order**
5. **Verify** questions generally get harder as you progress (check Difficulty Meter)

### Test 23: Difficulty Meter Display
1. On any practice question page, look for the **Difficulty Meter** at the top
2. **Verify:**
   - Shows "Ops Rank: Level X / 10"
   - Shows rank title (e.g., "Rookie", "Expert", "Big Boss")
   - Has emoji: 🌱 (easy) → ⚡ (medium) → 🔥 (hard) → 👑 (boss)
   - Bar fills up showing current level progress
3. Click Next → meter should update if difficulty changes

### Test 24: Session Persistence
1. Start Fractions practice → answer 2-3 questions
2. Go back to Learn tab
3. Return to Practice → Fractions
4. Click "Continue Practice" → should resume where you left off
5. Click "New Session (🔄)" → should start fresh from level 1

### Test 25: Difficulty Progression
1. Start a practice set
2. Answer several questions (correct or incorrect)
3. **Verify** difficulty generally increases over time
4. Early questions should be Level 1-3 (Rookie/Beginner)
5. Later questions should be Level 7-10 (Expert/Champion/Big Boss)

### Test 26: Follow-Up Updates Learn Accuracy
1. Sign in and complete a misconception error
2. Note the accuracy on Learn page
3. Answer the follow-up question correctly
4. Go to Learn page and refresh
5. **Expected:**
   - Accuracy should increase (follow-up counted as correct attempt)

### Test 8: Debug Page Full Pipeline (No DevTools Needed)
1. Go to **http://localhost:3001/debug**
2. Sign in if not already
3. Click **"🧪 Run Review Error Test (Full Pipeline)"**
4. **Expected results:**
   - All 3 pipeline steps show green ✓:
     - ✓ API Evaluate
     - ✓ Save Attempt
     - ✓ Increment Stat
   - Stat count shows: "Before: X → After: X+1"
   - Saved metadata shows: `error_class: "review_error"`, `review_error_type: "sign_slip"`
5. Click **"Check Supabase Writes"** → newest attempt shows `error_class: "review_error"`
6. Go to Learn tab → "Top review errors this week" should include "Sign slip"

## Files Changed

| File | Change |
|------|--------|
| `content/misconceptions.json` | Changed `CARELESS_*` → `REVIEW:*`, `category: "careless"` → `"review_error"` |
| `src/lib/types.ts` | `ErrorType` → `ErrorClass`, `CarelessKind` → `ReviewErrorType`, updated `EvaluationResult` |
| `src/lib/content.ts` | Updated `Misconception.category` type |
| `src/app/api/evaluate/route.ts` | `detectCarelessSlip` → `detectReviewError`, new response fields |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Updated terminology, uses `error_class` and `review_error_type` |
| `src/app/(main)/learn/page.tsx` | Filters by `REVIEW:*` prefix, passes new props to ProgressStats |
| `src/components/ProgressStats.tsx` | Separate bars for misconception/review errors, renamed props |
| `PRD.md` | Added Review Errors section, updated demo script |
| `architecture.md` | Added Review Error Detection section, updated data model |

## Review Error Types

| ID | Name | Example |
|----|------|---------|
| `REVIEW:extra_digit` | Extra digit | 111 → 11 |
| `REVIEW:missing_digit` | Missing digit | 1 → 11 |
| `REVIEW:sign_slip` | Sign slip | -5 → 5 |
| `REVIEW:transposed_digits` | Transposed digits | 43 → 34 |
| `REVIEW:extra_zero` | Extra zero | 100 → 10 |
| `REVIEW:decimal_slip` | Decimal placement | 1.5 → 15 |
| `REVIEW:arithmetic_slip` | Arithmetic slip | Close but wrong |

## UX Flow for Review Errors

```
Student enters "111" (correct is "11")
        ↓
detectReviewError() returns:
  - isReviewError: true
  - type: "extra_digit"
  - message: "Review error detected: likely a quick slip (extra digit)..."
        ↓
UI shows amber "Review Error Detected" card:
  - Message text (NO correct answer shown)
  - "Try Again" button
  - Collapsible "Show Solution" 
  - Misconception section titled "If you truly meant this answer..."
        ↓
Stat logged: REVIEW:extra_digit
```

## Debug Page (/debug)

A built-in debug page for testing APIs and Supabase writes without DevTools.

### How to use:
1. Navigate to **http://localhost:3001/debug**
2. Sign in (required for full tests)
3. Click the test buttons:

| Button | What it does |
|--------|--------------|
| **Run Evaluate Test** | Calls `POST /api/evaluate` with a misconception error (fractions: "2/6" for "3/4"). Shows `error_class: "misconception_error"`. |
| **Run Diagnose Test** | Calls `POST /api/diagnose` with the same wrong answer. Shows top-3 misconceptions. |
| **🧪 Run Review Error Test** | **FULL PIPELINE**: Calls evaluate → saves attempt → increments stats → verifies count. Uses a sign slip test (-5 vs 5). |
| **Check Supabase Writes** | Fetches recent attempts and shows error_class + review_error_type from saved metadata. |
| **📊 View Stats Preview** | Shows top 5 `REVIEW:*` stats and top 5 misconception stats from `misconception_stats` table. |

### What success looks like:

**Evaluate Test (Misconception):**
- Returns `200` with `{ error_class: "misconception_error", is_correct: false, ... }`

**🧪 Review Error Test (Full Pipeline):**
- ✓ API Evaluate: Returns `200` with `{ error_class: "review_error", review_error_type: "sign_slip", ... }`
- ✓ Save Attempt: Attempt saved with metadata in `top_misconceptions` JSONB
- ✓ Increment Stat: Stat count increases for `REVIEW:sign_slip`
- Shows before/after stat count (e.g., 2 → 3)
- Shows saved metadata: `error_class: "review_error"`, `review_error_type: "sign_slip"`

**Supabase Check:**
- Shows attempt count, newest attempt details
- Shows `error_class` and `review_error_type` extracted from saved metadata

**📊 Stats Preview:**
- Shows top 5 `REVIEW:*` stats with counts and last seen dates
- Shows top 5 misconception stats (excluding REVIEW:*) with counts
- After running Review Error Test, `REVIEW:sign_slip` should appear/increase

### How to Verify Review Errors Work:
1. Sign in on the debug page
2. Click **"📊 View Stats Preview"** → Note the current count for `REVIEW:sign_slip`
3. Click **"🧪 Run Review Error Test (Full Pipeline)"**
4. Check the result card:
   - All 3 pipeline steps should show ✓ (green checkmark)
   - Stat count should increase by 1
   - Saved metadata should show `error_class: "review_error"`
5. Click **"📊 View Stats Preview"** again → `REVIEW:sign_slip` count should be +1
6. Go to **Learn** tab → "Top review errors this week" should show "Sign slip" with the new count
7. Learn page should also show the "Review errors" bar increased

### Copy button:
Click "Copy JSON" next to any result to copy the full response to clipboard.

## Project Structure
```
/content
  questions.json         # 18 practice questions
  misconceptions.json    # 22 items (7 review errors + 15 misconceptions)
/src
  /app
    /api
      /evaluate/route.ts    # Review error detection + OpenAI eval
      /diagnose/route.ts    # Misconception Engine
    /debug/page.tsx         # Debug console for API testing
    /(main)
      /learn/page.tsx       # Dashboard with separate bars
      /practice/[topicId]/[questionId]/page.tsx  # Review error UX
  /components
    ProgressStats.tsx       # Shows both review error and misconception lists
  /lib
    content.ts             # getMisconceptionById for names
    types.ts               # ErrorClass, ReviewErrorType
```

## All Chunks Complete! 🎉

| Chunk | Status | Description |
|-------|--------|-------------|
| 1 | ✅ | Scaffold Next.js + TypeScript + Tailwind |
| 2 | ✅ | UI shell with Learn/Practice tabs |
| 3 | ✅ | Content JSON + Practice flow (mock) |
| 4 | ✅ | Supabase auth + database tables |
| 5 | ✅ | /api/evaluate (OpenAI correctness) |
| 6 | ✅ | /api/diagnose (Misconception Engine) |
| 7 | ✅ | Learn dashboard with real data |
| 8 | ✅ | Demo mode + Polish + Typo Detection |
| 9 | ✅ | Carelessness vs Misconceptions |
| 10 | ✅ | Carelessness Logging + No-Confirm UX |
| 11 | ✅ | Review Errors (rename + separate tracking + dashboard bars) |
| 12 | ✅ | Debug Page (/debug) for API testing without DevTools |
| 13 | ✅ | Save Pipeline Fix (store error info in JSONB, detailed errors, auto-retry) |
| 14 | ✅ | Review Errors Full Pipeline (debug page test, verify stats, dashboard bars) |
| 15 | ✅ | Review Errors Persist + Stats Preview (fixed debug page, added stats viewer) |
| 16 | ✅ | Interactive Follow-Up + Teach-Back (answerable follow-up, teach-back response, persistence) |
| 17 | ✅ | Voice Input (Type/Speak toggle for explanation fields) |
| 18 | ✅ | Key Takeaway + Curated Resources (highlighted takeaway, Learn more links) |
| 19 | ✅ | Coach Notes (personalized reflection from student explanation) |
| 20 | ✅ | Learn Content Upgrade (Read → Practice loop, curated resources) |
| 21 | ✅ | Difficulty Ladder + Meter (60 questions/topic, level 1-10, rank titles) |
| 22 | ✅ | Delight Mode (Sound effects + Confetti + Settings toggles) |
| 23 | ✅ | Focus Mode Timing + Efficiency Score (competition readiness) |

## Interactive Follow-Up + Teach-Back (Latest)

### What's New
The feedback page now has **interactive follow-up questions** and **teach-back responses**:

1. **Follow-up Question Input**
   - After a misconception error, the follow-up question card shows input fields
   - Enter your answer and optional explanation
   - Click "Check Follow-up" to evaluate
   - Shows compact result card (correct/incorrect + solution + top misconception)
   - Saved as a real attempt with `question_id = "followup:<timestamp>"`

2. **Teach-Back Response**
   - Purple box with a prompt asking you to explain the concept
   - Text area for your response
   - "Save Response" saves it as an attempt with `question_id = "teachback:<timestamp>"`
   - Response is stored in the `top_misconceptions` JSONB metadata

3. **Persistence**
   - Follow-up attempts update mastery and misconception stats
   - All data stored in existing Supabase `attempts` table (no schema changes)
   - Follow-up question details stored in JSONB metadata

### UX Flow
```
Incorrect answer → Misconception analysis
                 → Follow-up question appears with input
                 → Student enters answer → clicks "Check Follow-up"
                 → Result shows (correct/incorrect)
                 → Attempt saved to Supabase
                 → Teach-back prompt appears
                 → Student types explanation → clicks "Save Response"
                 → Response saved
```

### Files Changed
| File | Change |
|------|--------|
| `src/lib/content.ts` | Added `getMisconceptionIdsByTopic()` helper |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Added follow-up UI, teach-back UI, handlers, state, save logic |

## Voice Input (Type/Speak) - Latest

### What's New
All "thinking/explanation" text fields now have a **Type | Speak** toggle:

1. **Reusable VoiceInput Component** (`src/components/VoiceInput.tsx`)
   - Type/Speak toggle in the label row
   - Mic button appears when in "Speak" mode
   - Uses browser's `SpeechRecognition` API (Web Speech API)
   - Shows real-time interim transcription
   - Recording indicator (red pulsing dot)
   - Graceful fallback if not supported

2. **Integrated into 3 fields:**
   - Original answer explanation ("Explain your thinking")
   - Follow-up explanation ("Show your thinking")
   - Teach-back response

3. **Graceful Degradation:**
   - If browser doesn't support SpeechRecognition, toggle is hidden
   - Typing always works
   - Error messages for microphone permission issues

### How to Use
1. Click the **"Speak"** pill in the toggle
2. Click the **mic button** (appears in textarea corner)
3. Speak clearly
4. Watch text appear in real-time
5. Click **stop** (red square) when done
6. Switch back to **"Type"** to edit

### Browser Support
- ✅ Chrome, Edge, Safari
- ⚠️ Firefox (limited support)
- ❌ Some mobile browsers

### Files Changed
| File | Change |
|------|--------|
| `src/components/VoiceInput.tsx` | **NEW** - Reusable voice input component |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Integrated VoiceInput for 3 explanation fields |

## Difficulty Ladder + Meter - Latest

### What's New

**Question Bank Upgrade**
- 60 questions per topic (fractions, negatives, linear-equations) + 30 mixed
- Each question has a `difficulty` field (1-10)
- Level 1 = easiest, Level 10 = "Big Boss"

**Difficulty-Based Session Order**
- Questions grouped by difficulty (1→10)
- Shuffled within each difficulty group
- Flattened into one ordered list: easy → hard
- Stored in sessionStorage (keyed by topic + user id)
- No repeats within a session

**Difficulty Meter UI**
- Shows on every practice question page
- "Ops Rank: Level X / 10"
- Color progression: green → yellow → orange → red
- Emoji progression: 🌱 → ⚡ → 🔥 → 👑
- Rank titles: Rookie → Big Boss

**Rank Titles (Level 1-10)**
1. Rookie, 2. Beginner, 3. Apprentice, 4. Student, 5. Learner
6. Practitioner, 7. Expert, 8. Master, 9. Champion, 10. Big Boss

**Session Management**
- "Continue Practice" resumes existing session
- "New Session (🔄)" clears and reshuffles
- Session clears automatically at end of practice set

### Quick Test
1. **Practice → Fractions → Start** → See difficulty meter
2. **Answer questions** → Difficulty should increase over time
3. **New Session** → Different question order

### Files Changed
| File | Change |
|------|--------|
| `content/questions.json` | 60 questions/topic with difficulty 1-10 (already updated by user) |
| `src/lib/content.ts` | Added `difficulty` to Question type, `buildDifficultySessionOrder()`, `DIFFICULTY_RANKS` |
| `src/components/DifficultyMeter.tsx` | **NEW** - Visual difficulty meter component |
| `src/app/(main)/practice/[topicId]/page.tsx` | Updated session logic + difficulty preview |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Added DifficultyMeter, updated session key |

## Delight Mode (Sound + Confetti) - Latest

### What's New

**Settings (accessible via gear icon in header)**
- Sound effects toggle (on/off)
- Celebrations (confetti) toggle (on/off)
- Settings persisted in localStorage
- Respects `prefers-reduced-motion`: celebrations default OFF if user prefers reduced motion

**Sound Effects (Web Audio API)**
- `playSuccess()`: bright major arpeggio (C5, E5, G5)
- `playFail()`: descending "wah-wah" tone
- `playPerfect()`: celebratory ascending arpeggio with sparkle
- No external audio files—all synth sounds generated in browser
- Only play after user action (no autoplay violations)

**Confetti (canvas-confetti)**
- Fires on 100% accuracy completion
- Fires on 100% accuracy milestone on Learn page
- Milestone tracking prevents spam (once per day per milestone)
- Uses `shouldCelebrateMilestone()` / `markMilestoneCelebrated()`

**Encouragement Micro-copy**
- Correct: rotating phrases like "Nice! 🎯", "You got it! ✨", "Nailed it! 🎉"
- Incorrect: supportive phrases like "Good try! Keep going. 💪", "Learning moment! 🧠"
- Perfect (100%): special phrases like "100%! Amazing work! 🏆", "Flawless! You crushed it! 💪"

### How to Test Delight Mode

1. **Go to http://localhost:3001/debug**
2. **Find "Delight Mode (Sound & Celebrations)" section**
3. **Verify settings display:**
   - Shows current Sound Effects state (ON/OFF)
   - Shows current Celebrations state (ON/OFF)
4. **Test sounds:**
   - Click "✅ Test Success SFX" → hear bright arpeggio
   - Click "❌ Test Fail SFX" → hear descending tone
   - Click "🏆 Test Perfect SFX" → hear celebratory arpeggio with sparkle
5. **Test confetti:**
   - Click "🎊 Test Confetti" → see confetti burst
   - If Celebrations is OFF, shows alert instead
6. **Test in practice:**
   - Go to Practice → answer correctly → hear success sound + see encouragement phrase
   - Answer incorrectly → hear fail sound + see supportive phrase
7. **Test 100% celebration:**
   - Complete a practice set with 100% accuracy
   - Should see confetti + hear perfect sound + special message
8. **Test settings persistence:**
   - Toggle Sound OFF via Settings gear in header
   - Refresh page → Sound should still be OFF
   - Answer a question → no sound plays

### Accessibility

- If `prefers-reduced-motion: reduce` is enabled, celebrations default to OFF
- User can still manually enable celebrations if they want
- Sounds are optional and can be disabled

### Files Changed

| File | Change |
|------|--------|
| `src/lib/delight.ts` | **NEW** - Sound effects (Web Audio API), confetti utility, settings persistence, milestone tracking, encouragement phrases |
| `src/components/DelightProvider.tsx` | **NEW** - Context provider for settings and sound functions |
| `src/components/SettingsPopover.tsx` | **NEW** - Settings UI with toggles |
| `src/app/layout.tsx` | Wrapped app with `DelightProvider` |
| `src/app/(main)/layout.tsx` | Added `SettingsPopover` to header |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Added sounds + encouragement phrases on feedback |
| `src/app/(main)/practice/[topicId]/complete/page.tsx` | Added confetti + perfect celebration for 100% |
| `src/app/(main)/learn/page.tsx` | Added confetti celebration for 100% accuracy milestone |
| `src/app/debug/page.tsx` | Added SFX settings display + test buttons |
| `package.json` | Added `canvas-confetti` dependency |

### Acceptance Tests

| Test | Expected |
|------|----------|
| Sound effects OFF | No sounds play on correct/incorrect |
| Sound effects ON | Sounds play on correct/incorrect |
| Celebrations OFF | No confetti on 100% completion |
| Celebrations ON | Confetti on 100% completion |
| Correct answer | Success sound + encouragement phrase |
| Incorrect answer | Fail sound + supportive phrase |
| 100% practice completion | Confetti + perfect sound + special message |
| 100% on Learn page | Confetti + celebration banner (once per day) |
| prefers-reduced-motion | Celebrations default OFF |

## Focus Mode Timing + Efficiency Score (Latest)

### What's New

**Focus Mode Global Toggle (Header)**
- Prominent toggle in the main header (visible on Learn + Practice + lesson pages)
- Shows ⏱️ icon with ON/OFF state
- Toggle is always visible—not hidden inside settings
- Same toggle also available inside Settings popover for reference

**Focus Mode Toggle on Practice Page**
- Compact chip-style toggle near the Difficulty Meter
- Shows "⏱️ Focus ON" or "⏱️ Focus OFF" with pulsing dot when active
- Can be toggled mid-question:
  - If turned ON mid-question → timer starts from that moment
  - If turned OFF mid-question → timer stops and focus meta is not recorded

**Focus Mode Settings Persistence**
- Stored in localStorage under `mm_delight_settings`
- State persists across page refreshes
- Shared between header toggle, practice page toggle, and settings popover

**Timer Features**
- Starts when practice question page renders
- Stops when "Check" is clicked
- Pauses when tab/window is not visible (visibilitychange API)
- Resumes when tab becomes visible again
- Shows live timer in Focus Mode chip during answering
- Shows "Time taken: Xs" on feedback screen

**Focus Metadata (Persisted)**
- Stored in `attempts.top_misconceptions` JSONB under `focus` key:
  - `enabled: true`
  - `time_ms: number`
  - `pauses: number` (count of tab switches)
  - `nudges: number` (future feature)
- No DB schema changes required

**Efficiency Score (0-100)**
- Only computed when there's at least 1 Focus Mode attempt
- Uses target times per topic:
  - fractions: 35s
  - negatives: 25s
  - linear-equations: 40s
  - mixed-review: 35s
- Speed factor: `clamp(0.25, 1.5, target / actual)`
- Rating formula (starting at 50):
  - Correct: `+round(2 + 4 * speed_factor)` (+3 to +8)
  - Incorrect: `-5`
  - Nudge penalty: `-1` per nudge
- Efficiency labels:
  - 0-39: "Getting Started" 🌱
  - 40-69: "Focused Learner" 📚
  - 70-89: "Fast & Accurate" ⚡
  - 90-100: "Competition Ready" 🏆

**Speed Bonus Sound**
- Plays when correct AND fast (under 70% of target time)
- Different from regular success sound (ascending bling)
- Shows "⚡ Speed bonus!" prefix in encouragement phrase

**Learn Page Efficiency Panel**
- New panel: "Efficiency (Focus Mode)"
- Shows: rating (0-100), label + emoji, progress bar
- Shows: avg time (last 10), focus attempt count
- Tips based on current rating tier
- Empty state if no Focus Mode attempts

**Debug Page Test**
- New button: "⏱️ Run Focus Efficiency Test"
- Simulates a focus mode attempt (correct, fast)
- Shows: saved focus meta, computed rating, label
- Instructions to verify on Learn page

### How to Test Focus Mode (Click-by-Click)

1. **Test Global Header Toggle:**
   - Look for ⏱️ Focus toggle in the header (left of gear icon)
   - Click to toggle ON → button turns blue, shows "ON"
   - Refresh page → Focus Mode should still be ON (persisted)
   - Toggle OFF → button turns gray

2. **Test Practice Page Toggle:**
   - Go to Practice → any topic → Start Practice
   - **Verify:** Compact Focus Mode chip appears above question (shows "⏱️ Focus OFF" or "⏱️ Focus ON")
   - Click the chip to toggle ON mid-question
   - **Verify:** Timer starts immediately (shows seconds counting up)
   - Click the chip to toggle OFF → timer stops

3. **Verify Focus Meta Only Saved When ON:**
   - Start with Focus Mode OFF
   - Answer a question → Submit
   - Check attempt in Supabase → should NOT have `focus` metadata
   - Toggle Focus Mode ON
   - Answer another question → Submit
   - Check attempt → should have `focus: { enabled: true, time_ms: ..., pauses: 0, nudges: 0 }`

4. **Practice with Timer:**
   - Enable Focus Mode via header toggle
   - Go to Practice → any topic → Start Practice
   - **Verify:** Focus Mode chip shows + live timer appears
   - Answer the question
   - Click "Check"
   - **Verify:** Feedback shows "Time: X.Xs" badge in top-right

3. **Test Tab Pause:**
   - Start a new question (timer running)
   - Switch to another tab/window
   - Come back
   - **Verify:** Timer continued correctly (pauses shown in feedback if any)

4. **Check Learn Efficiency Panel:**
   - Go to Learn tab
   - **Verify:** "Efficiency (Focus Mode)" panel shows rating + label
   - If first focus attempt, rating should be around 50-58

5. **Test Speed Bonus:**
   - Answer a question very quickly (under 70% of target time)
   - **Verify:** Different "speed bonus" sound plays + "⚡ Speed bonus!" phrase

6. **Verify via /debug:**
   - Go to http://localhost:3001/debug
   - **Verify:** "Focus Mode (Timer + Efficiency)" section shows current state
   - **Verify:** Shows ON/OFF status + toggle button
   - **Verify:** Shows localStorage value as JSON
   - Click "Turn ON" / "Turn OFF" to toggle → state updates immediately
   - Sign in
   - Click "⏱️ Run Focus Efficiency Test"
   - **Verify:** Focus meta persisted, rating computed
   - Go to Learn → check efficiency panel updated

### Files Changed

| File | Change |
|------|--------|
| `src/lib/delight.ts` | Added Focus Mode types, target times, efficiency computation, speed bonus sound |
| `src/lib/types.ts` | Added `FocusMeta` interface |
| `src/lib/supabase/database.types.ts` | Added `focus?: FocusMeta` to `AttemptMetadata` |
| `src/components/DelightProvider.tsx` | Added `focusModeEnabled` setting, `playSpeedBonus()` function |
| `src/components/SettingsPopover.tsx` | Added Focus Mode toggle |
| `src/components/FocusModeToggle.tsx` | **NEW** - Global Focus Mode toggle component (header + compact chip variants) |
| `src/app/(main)/layout.tsx` | Added `FocusModeToggle` to header |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Added timer logic, compact FocusModeToggle, time display, speed bonus, mid-question toggle handling |
| `src/app/(main)/learn/page.tsx` | Added efficiency extraction + "Efficiency (Focus Mode)" panel |
| `src/app/debug/page.tsx` | Added "⏱️ Run Focus Efficiency Test" button + Focus Mode state display + toggle |

### Acceptance Tests

| Test | Expected |
|------|----------|
| Focus Mode OFF | No timer, no efficiency panel on Learn |
| Focus Mode ON | Timer appears, time shows on feedback |
| Tab switch during question | Timer pauses, resumes on return, pause count tracked |
| After 5-10 focus attempts | Learn shows rating + label + avg time |
| Fast correct answer | Speed bonus sound + "⚡ Speed bonus!" phrase |
| Slow correct answer | Regular success sound |
| Incorrect answer | -5 rating penalty |

## Notes-Driven Lesson Pages (Latest)

### What's New

**Rich Content from notes.json**
- Lesson detail pages now render content from `content/notes.json`
- Each topic has: title, subtitle, mascot (emoji + catchphrase), and multiple level-based sections
- Sections are ordered by level (1-10, with 99 for "Extra practice")

**Block Types Supported**
| Type | Description | Style |
|------|-------------|-------|
| `callout` | Important information boxes | Colored by tone: rule (purple), tip (blue), warn (amber), fun (green) |
| `bullets` | Vocabulary / list items | Slate background with green bullets |
| `example` | Worked example cards | Yellow/orange gradient with numbered steps |
| `mini_quiz` | Check yourself questions | Indigo gradient with reveal button |
| `image` | Visual diagrams | White card with caption |
| `links` | External resources | Teal gradient with icons |

**SVG Assets in public/notes/**
- `public/notes/fractions/fraction-pizza.svg` - Pizza showing 3/8
- `public/notes/fractions/fraction-bars-equivalent.svg` - 1/2 = 2/4 = 3/6
- `public/notes/negatives/number-line.svg` - Number line -6 to 6
- `public/notes/equations/balance-scale.svg` - x + 3 = 10 balance

**Kid-Friendly Design**
- Colorful section headers with level badges
- Mascot character in hero header
- Interactive mini-quizzes (click to reveal answer)
- Progress bar showing levels to master
- Large emoji icons throughout

### Quick Test
1. **Learn tab** → Click "Read" on any topic
2. **Verify**: Hero header shows mascot emoji + catchphrase
3. **Scroll through levels**: See colorful sections with different block types
4. **Mini-quiz**: Click "Reveal Answer" → shows answer + explanation
5. **Images**: Should load SVGs from public/notes/
6. **Links**: Open in new tab (external sites)
7. **Practice CTA**: Click to start practice set

### Files Changed
| File | Change |
|------|--------|
| `content/notes.json` | Full notes content with sections and blocks |
| `src/lib/content.ts` | Added Notes types (`NoteTopic`, `NoteSection`, `NoteBlock`, etc.), `getNotesByTopicId()` |
| `src/app/(main)/learn/[topicId]/page.tsx` | Rewritten to render notes-driven content with all block types |
| `public/notes/fractions/fraction-pizza.svg` | **NEW** - Pizza diagram |
| `public/notes/fractions/fraction-bars-equivalent.svg` | **NEW** - Equivalent fractions bars |
| `public/notes/negatives/number-line.svg` | **NEW** - Number line diagram |
| `public/notes/equations/balance-scale.svg` | **NEW** - Balance scale diagram |

## Learn Content Upgrade

### What's New

**Polished Read → Practice Loop**
- Enhanced Learn tab with improved lesson cards
- Each card shows status + Read + Practice buttons
- Lesson detail pages with full micro-lesson content
- Curated external resources (no web scraping)

**Lesson Content (content/lessons.json)**
- 3 main topics: fractions, negatives, linear-equations
- Each lesson includes:
  - Title and overview
  - 1-2 paragraphs of kid-friendly explanation
  - Worked example (problem + steps + answer)
  - 3 key takeaways
  - 3 curated Khan Academy resources

**Curated Resources (no scraping)**
- All links are manually curated
- Types: video 🎬, practice ✏️, article 📄
- Opens in new tab (external sites)

### Quick Test
1. **Learn tab** → See improved cards with Read + Practice buttons
2. **Click Read** → See polished lesson detail page
3. **Resource cards** → Click to open Khan Academy in new tab
4. **Practice CTA** → Click to start practice set

### Files Changed
| File | Change |
|------|--------|
| `content/lessons.json` | **NEW** - Full lesson content for 3 topics |
| `src/lib/content.ts` | Added `Lesson` type, `getLessonById()`, `getAllLessons()` |
| `src/components/LessonCard.tsx` | Added Read + Practice buttons |
| `src/app/(main)/learn/[topicId]/page.tsx` | Full redesign with micro-lessons + resources |
| `PRD.md` | Documented Learn content model |
| `architecture.md` | Documented content/lessons.json schema |

## Coach Notes (Personalized + Persisted)

### What's New

**Truly Personalized Coach Notes**
- `/api/evaluate` now returns a `coach_notes` object on every call with:
  - `what_went_well`: 0-2 bullets (must quote/reference the student's explanation)
  - `what_to_fix`: 0-2 bullets (specific to the error type)
  - `remember`: 1 highlighted line (≤12 words, varies based on error type)
  - `next_step`: 1 actionable next step
- If explanation is provided:
  - Coach notes QUOTE or paraphrase the student's explanation (e.g., `"You explained: 'I added the top...'—great thinking!"`)
  - `remember` line is specific to the error type (not generic)
- If explanation is empty/too short (<15 chars):
  - Prompts: "Write 1–2 sentences next time so I can help with your specific approach."
- For misconception errors:
  - Analyzes explanation keywords to generate targeted `what_to_fix` and `remember` tips
- For review errors:
  - Uses `review_error_type` to give specific slip advice (sign slip, extra digit, etc.)

**Persistence (in JSONB)**
- Coach notes stored at `attempts.top_misconceptions[0].coach_notes`
- The metadata object has `_metadata: true` marker
- Structure: `{ _metadata: true, error_class: "...", review_error_type: "...", coach_notes: {...} }`
- No DB schema changes required

**Learn Page "My Coach Notes"**
- Panel extracts `coach_notes` from recent attempts via `extractAttemptMetadata()`
- Shows up to 3 recent coach notes with:
  - Topic + date
  - "Remember" line (highlighted in yellow)
  - "Next step"
- Empty state: "No coach notes yet!" with prompt to write explanations

**Debug Page "Run Coach Notes Test"**
- New button: **📝 Run Coach Notes Test**
- Uses a detailed explanation to test personalization
- Shows:
  - PASS/FAIL status for persistence
  - Coach notes returned from API
  - Coach notes persisted in Supabase
  - Instructions to verify on Learn page

### How to Test Coach Notes (via /debug)

1. **Go to http://localhost:3001/debug**
2. **Sign in** (required)
3. **Click "📝 Run Coach Notes Test"**
4. **Verify the results:**
   - ✓ API Evaluate: 200 OK
   - ✓ Save Attempt: Saved
   - ✓ Coach Notes Persisted: YES
   - "What went well" should quote the explanation (e.g., `"You wrote: 'I first looked at...'..."`)
   - "Remember" should be specific (not "I'm pleased" or generic)
5. **Go to Learn tab** → "My Coach Notes" panel should show the new note
6. **Verify** the "Remember" line is highlighted and the "Next step" is shown

### Acceptance Tests

| Test | Expected |
|------|----------|
| Run Coach Notes Test (debug page) | PASS: coach_notes persisted, quotes explanation |
| Learn page after test | "My Coach Notes" shows at least 1 note |
| Practice with blank explanation | "Remember" = "Explaining helps me coach you better!" |
| Practice with detailed explanation | "Remember" quotes or references the explanation |

### Files Changed
| File | Change |
|------|--------|
| `src/app/api/evaluate/route.ts` | `generateCoachNotes()` now quotes student explanation, varies `remember` by error type |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | `EvaluationResult` construction includes `coach_notes` from `evalData` |
| `src/app/(main)/learn/page.tsx` | Already extracts coach_notes via `extractAttemptMetadata()` |
| `src/app/debug/page.tsx` | Added "Run Coach Notes Test" button + results display |
| `CONTEXT.md` | Updated with test steps |

## Key Takeaway + Curated Resources

### What's New

**1. Key Takeaway Highlight**
- `/api/diagnose` now returns a `key_takeaway` field (max 12 words)
- Displayed in a green highlighted callout box with 🎯 icon
- Student-friendly, memorable statement of the core concept
- Only shown for the TOP misconception

**2. Curated Learning Resources**
- No web scraping - all links are manually curated
- Misconception-specific resources in `misconceptions.json` (optional `resources` array)
- Topic-level fallback resources in `topic_resources` object
- "Learn More" card shows 1-3 links with type icons (🎬 video, 📄 article, ✏️ practice)
- All links open in new tab (external sites)

### Resource Sources (curated, no scraping)
- Khan Academy (video tutorials)
- MathIsFun (articles)
- IXL (practice problems)

## Known Issues
- Legacy attempts without metadata are counted as misconceptions (backwards compatible)
- Legacy stats with `CARELESS_*` IDs are still recognized (backwards compatible)
- Follow-up question correct answers are stored in JSONB (not graded server-side, relies on /api/evaluate)

## Save Pipeline Fix (Latest)

### What Changed
- **Removed non-existent columns**: The database `attempts` table only has these columns: `id`, `user_id`, `question_id`, `topic`, `answer_text`, `explanation_text`, `is_correct`, `top_misconceptions` (JSONB), `created_at`
- **Metadata in JSONB**: `error_class` and `review_error_type` are now stored INSIDE `top_misconceptions` as a metadata object:
  ```json
  [
    { "_metadata": true, "error_class": "review_error", "review_error_type": "EXTRA_DIGIT" },
    { "id": "FRAC-01", "name": "...", ... }
  ]
  ```
- **Detailed error messages**: Save failures now show the actual Supabase error code and message
- **Partial failure handling**: If attempt saves but stats update fails, shows "Attempt saved, stats update failed" with retry
- **Auto-retry for transient errors**: Automatically retries once for 429/503/network errors
- **Retry stats only**: If attempt already saved, the retry button only retries the stats update

### How to Test "Save failed"
1. Sign in to the app
2. Go to Practice → any topic → answer a question
3. After submitting, check the save status indicator:
   - "Saving..." → "✓ Saved" = success
   - "⚠ Save failed – Retry" = full failure (click to retry)
   - "⚠ Stats update failed – Retry stats" = partial failure
4. Hover over the error message to see the full error reason
5. Check browser console for detailed logs with `[PracticeQuestion]` prefix

### How to Verify Review Error Counts
1. Sign in and go to Practice → Negatives
2. For a question with answer "11", enter "111" (extra digit)
3. Click Check → should show "Review Error Detected"
4. Check console for: `[PracticeQuestion] Updating review error stat for: REVIEW:EXTRA_DIGIT`
5. Go to Learn tab → Check "Top review errors this week"
6. If the stat was saved, you should see "Extra digit" in the list

### Files Changed
| File | Change |
|------|--------|
| `src/lib/supabase/database.types.ts` | Removed `error_type`/`careless_kind` columns, added `AttemptMetadata` type, added `extractAttemptMetadata()` helper |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Updated `performSave` to store error info in JSONB, added detailed error handling, auto-retry, partial failure handling |
| `src/app/(main)/learn/page.tsx` | Updated `countErrorTypes()` to read from JSONB metadata |

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=     # Required for auth/data
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Required for auth/data
OPENAI_API_KEY=               # Required if DEMO_MODE=false
DEMO_MODE=false               # "true" skips AI API calls
NEXT_PUBLIC_DEMO_MODE=false   # "true" shows Demo Mode badge
```

## Demo Script
1. Show a **review error**: enter "111" instead of "11"
   - Point out: "Review error detected", no answer revealed
   - Show collapsible solution + "If you truly meant this answer..."
2. Show a **misconception error**: enter "5/8" instead of "3/4"
   - Full misconception analysis appears
3. Go to Learn tab: show separate bars for review errors vs misconceptions
4. Explain: "This separates quick slips from true conceptual misunderstandings"

## ElevenLabs Voice (TTS) - Latest

### What's New

**Server-Side TTS API**
- `/api/tts` POST endpoint for text-to-speech
- Uses ElevenLabs streaming API (server-side, never exposes key to client)
- Returns mp3 audio bytes
- Authenticates using `ELEVENLABS_API_KEY` in server env only

**Settings (in Settings popover → Voice section)**
- **Voice narration** (ON/OFF) - master toggle for voice features
- **Auto-read feedback** (ON/OFF) - automatically reads feedback after clicking Check
- **Read-aloud buttons** (ON/OFF) - shows/hides Read Aloud buttons on pages

**Read Aloud Buttons**
- Incorrect feedback page: reads short feedback + key takeaway + first 2 solution steps
- Correct feedback page: reads short feedback + coach note remember line
- Lesson detail pages: reads lesson summary + mascot catchphrase

**Browser Autoplay Safety**
- Audio only plays after user action (click) or after Voice is toggled ON
- Never autoplays on page load
- Global audio manager stops previous audio when new audio starts

**Debug Page (/debug)**
- Shows ELEVENLABS_API_KEY configured status (true/false)
- "Test Voice" button with sample sentence
- Voice settings display + quick toggles
- Stop button to interrupt playback

### Environment Variable

Add to `.env.local`:
```
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

Get your API key from: https://elevenlabs.io

### How to Test Voice (3 clicks)

1. **Go to http://localhost:3001/debug**
2. **Click "Check API Key"** → should show "✓ Configured"
3. **Click "Test Voice"** → audio plays "Hello! I'm your Misconception Mentor..."

### Full Test Flow

1. **Enable voice in Settings:**
   - Click gear icon in header
   - Scroll to "Voice (ElevenLabs)" section
   - Toggle "Voice narration" ON

2. **Test Read Aloud on feedback:**
   - Go to Practice → any topic → answer a question
   - Click "Check" → feedback page shows
   - Click "Read aloud" button → audio plays

3. **Test Auto-read:**
   - In Settings, enable "Auto-read feedback"
   - Answer another question → feedback auto-reads after Check

4. **Test lesson page:**
   - Go to Learn → Read on any topic
   - Click "Listen" button in hero header → audio plays

### Acceptance Tests

| Test | Expected |
|------|----------|
| Read-aloud button (feedback) | Plays ElevenLabs audio |
| Voice narration OFF | Read-aloud buttons hidden |
| Read-aloud buttons OFF | Buttons not visible |
| Auto-read ON + Check | Audio plays automatically after feedback |
| Stop button (debug page) | Stops audio playback |
| No ELEVENLABS_API_KEY | API returns 500 error |

### Files Changed

| File | Change |
|------|--------|
| `src/app/api/tts/route.ts` | **NEW** - Server-side TTS endpoint using ElevenLabs |
| `src/lib/delight.ts` | Added `voiceEnabled`, `autoReadFeedback`, `showReadAloudButtons` to settings |
| `src/components/DelightProvider.tsx` | Added voice settings to initial state |
| `src/components/SettingsPopover.tsx` | Added Voice section with 3 toggles |
| `src/components/ReadAloudButton.tsx` | **NEW** - Read Aloud button component + useTTS hook |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Added ReadAloudButton to feedback + auto-read logic |
| `src/app/(main)/learn/[topicId]/page.tsx` | Added ReadAloudButton to lesson hero header |
| `src/app/debug/page.tsx` | Added ElevenLabs Voice section with config check + test button |

## Focus Mode: Keyboard-First + Adaptive Nudges

### What's New

**Keyboard-First Flow (Focus Mode)**
- In Focus Mode, pressing **Enter** in the answer input triggers "Check" (submit)
- On the feedback screen, pressing **Enter** triggers "Next Question"
- Answer input **auto-focuses** when each new question loads
- Next button shows "(Enter)" label when Focus Mode is ON
- No mouse required for full practice flow

**Timer Behavior (Time-to-First-Submit)**
- Timer starts when question becomes visible AND Focus Mode is ON
- Timer **freezes at submit** (when "Check" is clicked or Enter pressed)
- Timer does NOT continue while reading feedback
- Feedback screen shows the frozen "Time taken: Xs"
- Captured time stored in `focus.time_ms` in attempt metadata

**Separate Accuracy and Speed Scores**
- Learn page "Efficiency (Focus Mode)" panel now shows two bars:
  - **Accuracy Score** (0-100%): correct/total for all Focus Mode attempts
  - **Speed Score** (0-100%): based on correct attempts ONLY
- Speed score uses speed factor relative to topic target times
- Tips adjust based on accuracy vs speed balance

**Adaptive Nudges (Inactivity-Based)**
- Nudges trigger based on **inactivity** (time since last typing), not total time
- Baseline computed from user's recent submit times (median of last 5)
- Thresholds:
  - First nudge: 125% of baseline (clamped 6s - 90s)
  - Second nudge: 175% of baseline (clamped first+6s - 150s)
- Max 2 nudges per question
- Typing or submitting resets nudge timers

### How to Test Keyboard Flow (5 steps)

1. **Enable Focus Mode:**
   - Go to Settings (gear icon) → Turn on "Focus Mode"

2. **Start Practice:**
   - Go to Practice → Select any topic → Start Practice
   - Verify: Answer input is automatically focused

3. **Test Enter to Submit:**
   - Type an answer
   - Press Enter → verify it submits (shows feedback)
   - Timer should freeze at the submit time

4. **Test Enter to Advance:**
   - On feedback screen, press Enter
   - Verify: Advances to next question
   - Answer input should auto-focus again

5. **Full keyboard flow:**
   - Complete 3-5 questions using only keyboard (no mouse)
   - Verify: Smooth, uninterrupted flow

### How to Test Adaptive Nudges

1. **Go to /debug → "Focus Mode UX Test" section:**
   - See current Focus Mode state, nudge thresholds, recent times

2. **Practice with Focus Mode ON:**
   - Start a practice set
   - Wait without typing → nudge should appear based on threshold
   - Type something → nudge timer resets

3. **Verify adaptive thresholds:**
   - After 5+ Focus Mode submissions, baseline adjusts
   - /debug shows computed thresholds based on your speed

### Acceptance Tests

| Test | Expected |
|------|----------|
| Focus Mode + Enter in answer | Submits the answer |
| Focus Mode + Enter on feedback | Advances to next question |
| New question load | Answer input auto-focused |
| Timer at submit | Freezes and shows on feedback |
| Timer on feedback | Does NOT continue |
| Learn → Efficiency panel | Shows Accuracy + Speed separately |
| Speed score | Only includes correct attempts |
| Nudge trigger | Based on inactivity, not total time |
| Typing during question | Resets nudge timer |
| /debug Focus Mode UX | Shows thresholds and recent times |

### Files Changed

| File | Change |
|------|--------|
| `src/lib/delight.ts` | Added `computeFocusModeScores`, `computeAdaptiveNudgeThresholds` |
| `src/components/AvatarProvider.tsx` | Added `useAdaptiveNudges` hook |
| `src/app/(main)/practice/.../page.tsx` | Keyboard handlers, auto-focus, adaptive nudges |
| `src/app/(main)/learn/page.tsx` | Separate Accuracy/Speed display |
| `src/app/debug/page.tsx` | Added Focus Mode UX Test section |

---

## Dynamic Avatar Encouragement

### What's New

**Settings Toggle**
- New "Encouragement" toggle in Settings (under Teacher Avatar section)
- Default: ON (for an encouraging experience)
- When OFF: no encouragement bubbles or speech, but other narration still works

**Encouragement Engine (src/lib/encouragement.ts)**
- Generates context-aware phrases based on performance
- Phrase pools by category (8-20 phrases each):
  - `correct_basic` - standard correct answer praise
  - `correct_streak` - when on a streak (2+)
  - `correct_fast` - fast answer in Focus Mode
  - `correct_comeback` - correct after 2+ wrong
  - `incorrect_support` - gentle, motivating
  - `incorrect_review_error` - for typos/slips
  - `incorrect_misconception` - for conceptual errors
  - `milestone_streak_3` / `milestone_streak_5` - streak milestones
  - `milestone_perfect` - 100% on a set

**Anti-Monotony**
- Never repeats the exact same phrase back-to-back
- Avoids any phrase used in the last 5 messages
- Stores recent phrases in localStorage

**Context Signals**
- Tracks correct/incorrect streaks within session (sessionStorage)
- Detects fast answers in Focus Mode (< 60% of target time)
- Recognizes comebacks (correct after 2+ wrong)
- Distinguishes review errors vs misconception errors

**Integration**
- Replaces hardcoded "Great job!" messages
- Respects all toggles: Encouragement OFF, Avatar OFF, Voice OFF
- One encouragement per attempt (no spam)

### How to Test in /debug (3 steps)

1. **Go to /debug → Encouragement Engine Test section:**
   - See current streak values and Encouragement toggle status
   - Click "✅ Correct" multiple times → verify different phrases each time
   - Click "❌ Incorrect" → see supportive, non-judgmental messages

2. **Test special scenarios:**
   - Click "🔥 Streak 3" → see streak-specific message
   - Click "✏️ Review Error" → see slip-specific message
   - Click "⚡ Fast Correct" → see speed-related message
   - Click "💪 Comeback" → see comeback message

3. **Verify toggle:**
   - Turn Encouragement OFF in Settings
   - Practice a question → avatar should not show encouragement bubble
   - Turn it back ON → encouragement returns

### Acceptance Tests

| Test | Expected |
|------|----------|
| Correct answers | Varied messages (not always "Great job!") |
| Multiple correct clicks | Different phrases, no immediate repeats |
| Incorrect answers | Supportive, non-judgmental messages |
| Streak 3 | Streak-specific line (e.g., "3 in a row!") |
| Review error | Slip-specific line (e.g., "Quick slip!") |
| Fast correct | Speed-related line (e.g., "Lightning fast!") |
| Comeback | Comeback-specific line (e.g., "Bounced back!") |
| Encouragement OFF | No avatar encouragement bubbles |
| Message history | No duplicates in last 5 messages |

### Files Changed

| File | Change |
|------|--------|
| `src/lib/delight.ts` | Added `encouragementEnabled` to settings |
| `src/lib/encouragement.ts` | NEW: Encouragement engine with phrase pools |
| `src/components/DelightProvider.tsx` | Added `encouragementEnabled` default |
| `src/components/SettingsPopover.tsx` | Added Encouragement toggle |
| `src/app/(main)/practice/.../page.tsx` | Use dynamic encouragement |
| `src/app/debug/page.tsx` | Added Encouragement Test section |

---

## Draggable Teacher Avatar

### What's New

**Drag Behavior**
- Click and hold the avatar, then drag to reposition
- Small drag threshold (8px) prevents accidental drags from clicks
- Supports both mouse and touch (pointer events)
- Visual feedback: opacity 0.85 + cursor: grabbing while dragging
- Dragging is disabled while avatar is walking to an anchor

**Persisted Home Position**
- Position saved to localStorage as viewport percentages (xPct, yPct)
- Clamped to 5-95% to keep avatar visible on screen
- Position survives page refresh and works across all pages
- Responsive: adapts to window resize

**Integration with Anchor Walking**
- When narration walks avatar to an anchor, avatar returns to saved home position after finishing
- If user drags during a question, new home position is used immediately
- Walking to anchor overrides position temporarily, then returns home

**Settings + Debug UI**
- Settings: "Position (drag to move)" section with Reset button
- /debug: Shows current home position (xPct, yPct) with Reset button
- Reset returns avatar to default bottom-right corner

### How to Test (3 steps)

1. **Drag avatar to new position:**
   - Click and hold the avatar (bottom-right by default)
   - Drag to a new spot (e.g., left side)
   - Release → avatar stays there

2. **Verify persistence:**
   - Refresh the page
   - Avatar should still be in the dragged position
   - Navigate to Learn/Practice → avatar is still in same position

3. **Test with narration:**
   - Go to Practice → answer a question wrong
   - Click "Read aloud"
   - Avatar walks to sections, then returns to your dragged home position
   - Click Reset in Settings → avatar returns to bottom-right

### Acceptance Tests

| Test | Expected |
|------|----------|
| Drag avatar | Avatar follows cursor, stays at release position |
| Small click (no drag) | No repositioning (threshold protection) |
| Refresh page | Avatar at saved position |
| After narration | Avatar returns to saved home position |
| Reset button | Avatar returns to bottom-right, localStorage cleared |
| Drag during walking | Disabled (no drag while walking) |

### Files Changed

| File | Change |
|------|--------|
| `src/lib/delight.ts` | Added avatar position storage functions |
| `src/components/TeacherAvatar.tsx` | Added drag handlers and homePosition prop |
| `src/components/AvatarProvider.tsx` | Added home position state + persistence |
| `src/components/SettingsPopover.tsx` | Added reset position button |
| `src/app/debug/page.tsx` | Added position display + reset button |

---

## Narration Script + Avatar Choreography

### What's New

**Canonical Narration Script System**
- Each feedback page has a structured script with ordered segments
- Order for incorrect feedback: (1) Key takeaway → (2) What went wrong → (3) Solution steps (ALL)
- Each segment has: id, anchorId (for avatar movement), textToSpeak
- Single narration queue runner ensures only one audio plays at a time

**Avatar Choreography Tied to Narration**
- When "Read aloud" is clicked, avatar follows the script:
  1. Walks to the anchor (section)
  2. Points at the section
  3. Highlights ONLY that card (yellow glow)
  4. Speaks the text (if voice enabled) or shows bubble
  5. Moves to next segment
- Avatar returns to home dock after script completes

**Right-Angle Walking + Heel Footsteps**
- Avatar walks in a right-angle path (horizontal first, then vertical)
- NOT diagonal teleportation
- Plays "tuck-tuck-tuck" heel click sounds during walking
- Respects Sound effects toggle

**Avatar Reset on Route/Question Change**
- When navigating to a different page or question, avatar resets to home dock
- Clears any pointing or highlight states
- Cancels in-progress narration cleanly

**Avatar Size Increase**
- Default size changed from "medium" to "large" (~3x bigger)
- New "XL" size option for maximum presence
- Size options: Small (120px) | Medium (180px) | Large (240px) | XL (320px)
- Avatar docked in bottom-right corner with safe margins

### How to Test (5 clicks)

1. **Go to /debug → Teacher Avatar section:**
   - Click "👠 Walk + Footsteps" → avatar walks right-angle with heel clicks
   - Click "🛤️ Test Walk Path" → avatar walks between multiple positions

2. **Test narration on feedback page:**
   - Go to Practice → answer a question wrong
   - Click "Read aloud" → avatar walks to Key Takeaway, points, speaks
   - Avatar then walks to Misconception section, then Solution steps
   - Avatar returns home after script completes

3. **Test reset behavior:**
   - Click "Read aloud" to start narration
   - Click "Next Question" mid-narration → avatar resets to home
   - Navigate to Learn tab → avatar is at home dock

4. **Test size in Settings:**
   - Open Settings → Teacher Avatar → Size
   - Click "Large" (default) → avatar is ~240px tall
   - Click "XL" → avatar is ~320px tall

5. **Verify order (incorrect feedback):**
   - Key takeaway reads FIRST
   - What went wrong reads SECOND
   - Solution steps read THIRD (all steps)

### Acceptance Tests

| Test | Expected |
|------|----------|
| Read aloud (incorrect) | Order: key takeaway → what went wrong → solution |
| Avatar movement | Walks to each section before speaking |
| Walking path | Right-angle (horizontal then vertical), not diagonal |
| Heel footsteps | Plays during walking (if Sound ON) |
| Next Question | Avatar resets to home dock |
| Route change | Avatar resets to home dock |
| Avatar size (Large) | ~240px tall (default) |
| Avatar size (XL) | ~320px tall |

### Files Changed

| File | Change |
|------|--------|
| `src/lib/delight.ts` | Added "xl" size, changed default to "large" |
| `src/components/TeacherAvatar.tsx` | Updated size configs (~3x bigger) |
| `src/components/DelightProvider.tsx` | Changed default avatarSize to "large" |
| `src/components/AvatarProvider.tsx` | Added right-angle walking, route reset |
| `src/components/NarrationScript.tsx` | NEW: Narration script system + queue runner |
| `src/components/SettingsPopover.tsx` | Added XL size option |
| `src/app/(main)/practice/.../page.tsx` | Script-based narration + choreography |
| `src/app/debug/page.tsx` | Added walk path test buttons |
| `src/app/globals.css` | Updated narration-highlight style |

---

## Mastery Bars (Coverage-Based Mastery)

### What's New

**Replaced status pills with mastery health bars**
- Each topic card now shows a 0–100% mastery bar instead of "Solid/Learning/Not started"
- Mastery percentage reflects BOTH accuracy AND coverage across subskills
- You cannot reach high mastery by only practicing one type of problem

**Subskill Tags**
Every question in `questions.json` now has a `skill_tag` field:
- **Fractions**: `frac_same_denom`, `frac_unlike_denom`, `frac_equivalence`
- **Negatives**: `neg_add`, `neg_sub`, `neg_mul`
- **Linear Equations**: `lin_one_step`, `lin_two_step`

**Mastery Calculation Formula**
```
For each required skill in a topic:
  coverage_factor = min(1, attempts_count / 3)
  skill_score = coverage_factor * (accuracy / 100)

topic_mastery_percent = average(skill_scores) * 100
```

**UI Changes**
- **Mastery bar**: Health bar showing 0–100% with color coding:
  - Green (≥80%): Solid
  - Amber (≥50%): Learning
  - Orange (<50%): Getting started
  - Gray (0%): Not started
- **Emoji badge**: 🏆 (≥90%), ⭐ (≥80%), 📈 (≥60%), 🎯 (≥40%), 🌱 (>0%), 📚 (0%)
- **"Next up" hint**: Shows the subskill that needs most practice
- **Progress panel note**: Explains that mastery is based on coverage across subskills

**Storage**
- `skill_tag` is stored in attempt metadata (no DB migration needed)
- Location: `attempts.top_misconceptions[0].skill_tag`

### How to Test

1. **See mastery bars:**
   - Go to http://localhost:3001/learn
   - Each topic card shows a mastery bar instead of a pill

2. **Verify coverage-based mastery:**
   - Practice only same-denominator fraction questions
   - Fractions mastery should NOT reach 100% (only ~33% max)
   - Practice unlike-denominator and equivalence questions
   - Watch the mastery bar rise as you cover more subskills

3. **See "Next up" hint:**
   - If mastery is below 80% and a subskill is weak, a blue hint appears
   - Example: "Next up: Unlike denominators (not practiced yet)"

### Acceptance Tests

| Test | Expected |
|------|----------|
| 3 correct same-denom only | Fractions ≤ 33% |
| 3 correct each subskill | Fractions ~100% |
| No attempts | Mastery 0%, "📚 Not started" |
| Low coverage, high accuracy | Low mastery (not "Solid") |
| High coverage, low accuracy | Low mastery |
| High coverage, high accuracy | High mastery (🏆) |

### Files Changed

| File | Change |
|------|--------|
| `scripts/add_skill_tags.js` | Script to auto-tag all questions |
| `content/questions.json` | Added `skill_tag` to every question |
| `src/lib/content.ts` | Added skill tag constants, Question interface |
| `src/lib/supabase/database.types.ts` | Added `skill_tag` to AttemptMetadata |
| `src/app/(main)/practice/.../page.tsx` | Pass `skill_tag` when saving attempts |
| `src/app/(main)/learn/page.tsx` | Added mastery calculation + UI |
| `src/components/LessonCard.tsx` | Replaced status pill with mastery bar |
| `src/components/ProgressStats.tsx` | Added mastery explanation note |
| `PRD.md` | Updated Learn tab spec |

---

## Teacher Avatar v2 - Human Teacher + Owl Option

### What's New

**Avatar Style Selector**
- **Teacher** (default): Human teacher with bun, glasses, pointer stick, heels
- **Owl**: Legacy owl with graduation cap (for users who prefer it)

**Human Teacher Avatar Features**
- Cartoon human teacher with:
  - Hair bun (brown)
  - Glasses (blue-tinted lenses)
  - Pointer stick with amber tip (points with pulsing glow)
  - Purple dress with collar detail
  - Heeled shoes with visible heels
  - Rosy cheeks for friendly look
- SVG-based (no external licensing risk)
- States: idle, walking, pointing, sitting, speaking, celebrating

**Increased Size/Presence**
- **Small**: 100x125px (up from 80x100)
- **Medium**: 140x175px (up from 120x150) - default
- **Large**: 180x225px (up from 160x200)

**Walking with Heel Footsteps**
- When avatar walks, plays "tuck-tuck-tuck" heel clicks
- Uses WebAudio (no external audio files)
- Faster step interval (180ms) for realistic pace
- Respects Sound effects toggle
- Walking animation: exaggerated leg swing, arm swing, body bob

**Sitting/Perched Animation**
- When idle on pages, avatar "sits" with:
  - Legs extending below body baseline
  - Gentle leg dangle animation (left/right alternating)
- Optional apple nibble every ~10-15 seconds (subtle idle detail)

**Pointing Animation**
- When highlighting a section (anchor), avatar:
  - Pointer stick rotates to 35° angle
  - Amber tip pulses with ring effect
  - Only the target card highlights (no text selection)

**Settings (in Settings popover → Teacher Avatar section)**
- **Teacher Avatar** (ON/OFF) - master toggle
- **Style** (Teacher/Owl) - avatar style selector
- **Size** (Small/Medium/Large) - avatar size selector
- **Avatar speaks** (ON/OFF) - uses voice narration (requires Voice ON)
- **Focus nudges** (ON/OFF) - friendly reminders during long practice sessions

### How to Test Avatar States

1. **Style switching (via /debug or Settings):**
   - Go to http://localhost:3001/debug
   - Click "Switch to Owl" → owl avatar appears
   - Click "Switch to Teacher" → human teacher appears

2. **Size control:**
   - In Settings → Teacher Avatar → click Small/Medium/Large
   - Avatar size changes immediately

3. **Walking + Heel Clicks (via /debug):**
   - Ensure Sound effects is ON
   - Click "Walk + Footsteps" → avatar walks with heel clicks
   - Turn Sound effects OFF → click again → animation only, no sound

4. **Sitting leg dangle:**
   - Set avatar to "sitting" state via avatar.setState("sitting")
   - Observe legs gently swinging back and forth

5. **Apple nibble (idle only):**
   - Leave avatar in "idle" state
   - Wait ~15 seconds, watch for apple appearing in left hand briefly

6. **Pointing animation:**
   - Click "Test Nudge" → avatar shows bubble
   - On feedback pages, avatar points to key takeaway with stick

### Acceptance Tests

| Test | Expected |
|------|----------|
| Avatar style: Teacher | Human teacher visible (bun, glasses, pointer) |
| Avatar style: Owl | Owl visible (graduation cap) |
| Size: Small | Avatar ~100px wide |
| Size: Medium | Avatar ~140px wide |
| Size: Large | Avatar ~180px wide |
| Walk + Footsteps (Sound ON) | Heel clicks play ("tuck-tuck-tuck") |
| Walk + Footsteps (Sound OFF) | Animation plays, no sound |
| Sitting state | Legs dangle with gentle swing |
| Pointing state | Pointer stick angled, tip pulses |
| Idle + wait 15s | Apple may appear briefly in hand |

### Files Changed

| File | Change |
|------|--------|
| `src/lib/delight.ts` | Added `avatarStyle`, updated `AvatarSize` |
| `src/components/DelightProvider.tsx` | Added avatarStyle to initial state |
| `src/components/TeacherAvatar.tsx` | Human teacher + Owl SVGs, improved animations |
| `src/components/SettingsPopover.tsx` | Added avatar style selector (Teacher/Owl) |
| `src/app/debug/page.tsx` | Updated avatar test section with style toggle |
| `src/app/globals.css` | Avatar animations (bob, walk, wave) |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Anchors + nudge integration + feedback behavior |
| `src/app/debug/page.tsx` | Updated avatar tests + walk with footsteps button |

## ElevenLabs TTS Fix - Latest

### What Changed

**Problem Solved:**
ElevenLabs was returning 401 `model_deprecated_free_tier` because the code used `eleven_monolingual_v1` which is no longer supported on free tier.

**Model Updates:**
- Default model changed to `eleven_multilingual_v2`
- Added automatic fallback chain: `eleven_flash_v2_5` → `eleven_turbo_v2_5`
- Added `ELEVENLABS_MODEL_ID` env override
- Response headers include `X-TTS-Model` and `X-TTS-Fallback` for debugging

**CSS Selection Fix:**
- Added `user-select: none` for buttons, nav, headers, chips, badges
- Removed any visual "selected text" appearance on UI chrome
- Only content paragraphs and textareas remain selectable

### How to Test (3 clicks)

1. Go to http://localhost:3001/debug
2. Click "Check API Config" → shows model info
3. Click "Test Voice (Track Model)" → plays audio, shows model used

### Acceptance Tests

| Test | Expected |
|------|----------|
| "Check API Config" | Shows default model + fallback models |
| "Test Voice (Track Model)" | Audio plays, shows SUCCESS + model used |
| Model fallback | If first model fails, auto-tries fallbacks |
| Nav/buttons | Not selectable (no blue highlight on drag) |
| Lesson content | Selectable text (can highlight paragraphs) |

### Files Changed

| File | Change |
|------|--------|
| `src/app/api/tts/route.ts` | Model fallback logic, env override, response headers |
| `src/app/globals.css` | CSS user-select rules for UI chrome |
| `src/app/debug/page.tsx` | Model info display, test with tracking |

---

## Deliberate Narration (NarrationBlock) - Latest

### What's New

**Problem Solved:**
The previous implementation made pages look "selected" when Read-aloud was enabled. Now narration is explicit and controlled.

**NarrationBlock Component**
- Wrapper that takes explicit `narrationText` string (not scraped from DOM)
- Only shows "Listen" button when `showReadAloudButtons` setting is ON
- Highlights ONLY the active block while audio is playing (yellow ring glow)
- Blocks register themselves for debugging/preview

**NarrationSkip Component**
- Wrapper for navigation/buttons that should NEVER be narrated
- Adds `data-narration-skip="true"` attribute

**What Gets Narrated (whitelist approach):**
- Lesson hero header (title + subtitle + mascot catchphrase)
- Callout blocks (Big Idea, Rules, Tips, Warnings)
- Key Takeaways bullets
- Worked Examples (problem + first 2 steps + answer)

**What Does NOT Get Narrated:**
- "Back to Learn" links
- Navigation tabs
- Header/settings/auth buttons
- Practice CTA buttons
- Mini quiz buttons

### How to Test Narration

1. **Verify no "selected text" look:**
   - Go to http://localhost:3001/learn/fractions
   - Page should NOT look highlighted by default
   - Only individual blocks have small "Listen" buttons (top-right)

2. **Verify single-block highlight:**
   - Click "Listen" on any block
   - ONLY that block gets yellow ring highlight
   - Other blocks stay normal

3. **Debug page test:**
   - Go to http://localhost:3001/debug
   - Scroll to "Narration Blocks Preview" section
   - Click "Listen" on Test Block 1 → only block 1 highlights
   - Click "Listen" on Test Block 2 → highlight moves to block 2

4. **Verify navigation is never narrated:**
   - "Back to Learn" link has no Listen button
   - "Start Practice" button has no Listen button
   - Header/tabs/settings have no Listen buttons

### Acceptance Tests

| Test | Expected |
|------|----------|
| Page load | No "selected text" look by default |
| Click Listen on block | Only that block gets yellow highlight |
| Audio ends | Highlight disappears |
| Start playing block 2 while block 1 plays | Block 1 highlight disappears, block 2 highlights |
| "Back to Learn" link | No Listen button present |
| Read-aloud buttons OFF | No Listen buttons visible anywhere |

### Files Changed

| File | Change |
|------|--------|
| `src/components/NarrationBlock.tsx` | **NEW** - NarrationBlock + NarrationSkip + NarrationProvider |
| `src/app/layout.tsx` | Added NarrationProvider wrapper |
| `src/app/globals.css` | Added narration-pulse animation |
| `src/app/(main)/layout.tsx` | Added data-narration-skip to header |
| `src/app/(main)/learn/[topicId]/page.tsx` | Replaced ReadAloudButton with NarrationBlock, added NarrationSkip |
| `src/app/debug/page.tsx` | Added NarrationTestSection with test blocks |

## Learn Page Cleanup + Listen Highlight Readability Fix

### What Changed

**1. Listen Highlight Readability Fix**
- The narration highlight no longer changes background color
- Uses ONLY ring/shadow effect: `ring-4 ring-yellow-400 shadow-glow`
- This prevents white text on colored backgrounds from becoming unreadable
- Works correctly on both light and dark/colored content blocks

**2. Dashboard Analytics Removed from Learn**
- Learn page is now focused ONLY on lesson content
- Removed panels from Learn page:
  - "Your Progress" section
  - "My Coach Notes" panel
  - "Efficiency (Focus Mode)" panel
- Added a "Track Your Progress" card linking to the Dashboard tab
- Data fetching simplified: no longer loads coach notes, misconception stats, or efficiency data

### How to Verify (3 steps)

1. **Test Listen highlight readability:**
   - Go to http://localhost:3001/learn/fractions
   - Click "Listen" on the hero header (purple/colored background)
   - **Expected:** Text remains readable (no white text issue)
   - The block gets a yellow ring/glow effect, NOT a background color change

2. **Verify Learn page has no analytics:**
   - Go to http://localhost:3001/learn
   - **Expected:** See only lesson cards and a "Track Your Progress" card with Dashboard link
   - NO "Your Progress" section
   - NO "My Coach Notes" panel
   - NO "Efficiency (Focus Mode)" panel

3. **Verify /debug checklist:**
   - Go to http://localhost:3001/debug
   - Scroll to "Narration Blocks Preview" → "Learn Page Cleanup Check"
   - Both items should show green checkmarks:
     - "Learn analytics panels present? NO ✓"
     - "Narration changes text to white? NO ✓"

### Acceptance Tests

| Test | Expected |
|------|----------|
| Listen on colored hero block | Text stays readable (yellow ring, no bg change) |
| Learn page load | No analytics panels present |
| Learn page link | Shows "Track Your Progress" card with Dashboard link |
| Dashboard still shows analytics | Progress/Coach Notes/Efficiency all present |
| /debug Learn Cleanup Check | Both items show NO ✓ |

### Files Changed

| File | Change |
|------|--------|
| `src/components/NarrationBlock.tsx` | Updated highlight to use ring/shadow only, no background |
| `src/app/globals.css` | Updated `.narration-highlight` to remove background-color |
| `src/app/(main)/learn/page.tsx` | Removed ProgressStats, Coach Notes, Efficiency panels; added Dashboard link |
| `src/app/debug/page.tsx` | Added "Learn Page Cleanup Check" section |

---

## Language Selector + Multilingual Support

### What's New

**Language Selector (Header)**
- Dropdown in header showing current language with flag emoji
- 5 languages supported: English, Hinglish, Español, Français, 中文(简体)
- Selection persisted in localStorage (`mm_language`)
- Default: English

**UI Translations (Static Strings)**
- Translation dictionaries in `/src/i18n/messages/{lang}.json`
- `useTranslation()` hook returns `t(key)` for translations
- Fallback to English if key missing
- Key areas translated:
  - Header tabs (Learn, Practice, Dashboard)
  - Practice page labels (Answer, Check, Next Question, etc.)
  - Feedback section headers (Key Takeaway, What went wrong, etc.)
  - Settings labels (Focus Mode, Avatar, etc.)

**AI Output Language**
- `/api/evaluate` and `/api/diagnose` accept `language` parameter
- AI generates feedback in selected language
- JSON keys remain English; only values are translated
- Hinglish: Hindi in Roman script + English math terms

### How to Test (5 clicks)

1. **Go to http://localhost:3001/learn**
2. **Click language dropdown** (flag icon in header, right side)
3. **Select "Español"**
4. **Verify UI changes:**
   - Tab navigation shows "Aprender", "Practicar", "Panel"
   - Refresh page → language persists
5. **Test AI output:**
   - Go to /debug → "Language (i18n) Test" section
   - Click "Run Evaluate in Español"
   - Verify `short_feedback` and `solution_steps` are in Spanish

### Acceptance Tests

| Test | Expected |
|------|----------|
| Language dropdown | Shows flag + language name |
| Select Spanish | UI labels change to Spanish immediately |
| Page refresh | Language persists (from localStorage) |
| Run Evaluate in French | `short_feedback` is in French |
| Hinglish evaluate | Hindi in Roman script with English math terms |
| Missing translation key | Falls back to English (no crash) |

### Files Changed

| File | Change |
|------|--------|
| `src/i18n/index.ts` | NEW: i18n system, getTranslation, language utilities |
| `src/i18n/messages/en.json` | English translations |
| `src/i18n/messages/hi_latn.json` | Hinglish translations |
| `src/i18n/messages/es.json` | Spanish translations |
| `src/i18n/messages/fr.json` | French translations |
| `src/i18n/messages/zh_hans.json` | Simplified Chinese translations |
| `src/components/I18nProvider.tsx` | NEW: Context provider + useTranslation hook |
| `src/components/LanguageSelector.tsx` | NEW: Language dropdown component |
| `src/app/layout.tsx` | Added I18nProvider wrapper |
| `src/app/(main)/layout.tsx` | Added LanguageSelector to header |
| `src/components/TabNavigation.tsx` | Use t() for tab names |
| `src/app/api/evaluate/route.ts` | Accept language, add AI instruction |
| `src/app/api/diagnose/route.ts` | Accept language, add AI instruction |
| `src/app/debug/page.tsx` | Added "Language (i18n) Test" section |

---

## Translation Coverage Test (Debug Page)

### What's New

**Translation Coverage Test Section** in `/debug`:
- Shows current language (code + name)
- Language switcher buttons (en, es, fr, zh_hans, hi_latn)
- Displays 10 sample UI translation keys with their values
- Shows lesson block preview (title, overview, mascot catchphrase)
- "Test Evaluate Language" and "Test Diagnose Language" buttons
- PASS/FAIL indicators for: UI Translated, Lesson Translated, AI Translated

### How to Test Translation Coverage (5 clicks)

1. **Go to http://localhost:3001/debug**
2. **Scroll to "Translation Coverage Test" section**
3. **Click "es" (Spanish) button** to switch language
4. **Click "🔍 Run Translation Coverage Test"**
5. **Verify results:**
   - "UI Translated" shows ✓ PASS (10 keys have Spanish translations)
   - UI keys grid shows Spanish values (e.g., "Aprender", "Practicar", "Panel")

### How to Test AI Language Output (2 more clicks)

6. **Click "Test Evaluate Language"**
   - Wait for API response
   - Verify `short_feedback` is in Spanish (should say "✓ In Target Language")
7. **Click "Test Diagnose Language"**
   - Wait for API response
   - Verify `key_takeaway`, `remediation`, `teach_back_prompt` are in Spanish

### Full Acceptance Test

| Test | Expected |
|------|----------|
| Switch to Spanish | Language indicator shows "Español" |
| Run Translation Test | 10 UI keys show Spanish values |
| Test Evaluate Language | `short_feedback` is in Spanish |
| Test Diagnose Language | `key_takeaway` is in Spanish |
| Switch to French | UI keys change to French |
| Switch to Hinglish | UI keys show Hinglish (Roman Hindi) |
| UI Translated PASS/FAIL | ✓ PASS when translations exist |
| AI Translated PASS/FAIL | ✓ PASS when AI output is in target language |

### Files Changed

| File | Change |
|------|--------|
| `src/app/debug/page.tsx` | Added TranslationTestResult interface, translation test state, test functions, UI section |
| `src/app/api/lesson-preview/route.ts` | NEW: API endpoint for lesson content preview |

---

## /api/diagnose Language-Safe Fix

### What Changed

**Problem:** `/api/diagnose` returned 500 errors for non-English languages because the AI was translating JSON keys or misconception IDs.

**Solution:**
1. **Stronger system prompt** - Explicitly lists valid misconception IDs and forbids translating them
2. **ID validation** - Post-processes response to fix any invalid IDs before Zod validation
3. **English fallback** - If non-English fails, retries with English
4. **Safe fallback** - If all AI attempts fail, returns a minimal valid response
5. **Status metadata** - Response includes `_meta.status` (ok/retried/fallback)

### How to Verify in 3 Clicks

1. **Go to** `http://localhost:3001/debug`
2. **Select "HI_LATN"** (Hinglish) in Translation Coverage Test section
3. **Click "Test Diagnose Language"** → should return 200 with status "✓ OK" or "🔄 Retried"

### Acceptance Tests

| Test | Expected |
|------|----------|
| Diagnose in English | ✓ OK, valid JSON |
| Diagnose in Spanish | ✓ OK or 🔄 Retried, valid JSON |
| Diagnose in Hinglish | ✓ OK or 🔄 Retried, valid JSON |
| Diagnose in Chinese | ✓ OK or 🔄 Retried, valid JSON |
| AI Translated indicator | Shows ✓ PASS after diagnose succeeds |
| Status badge | Shows OK / Retried / Fallback |

### Files Changed

| File | Change |
|------|--------|
| `src/app/api/diagnose/route.ts` | Added stronger prompt, ID validation, English fallback, safe fallback, status metadata |
| `src/app/debug/page.tsx` | Added status field to diagnoseResult, shows OK/Retried/Fallback badges |

---

## ElevenLabs Multilingual TTS Fix

### What Changed

**Problem:** TTS only worked for English. Other languages failed silently because:
1. `language_code` was not passed to ElevenLabs API
2. No fallback when ElevenLabs failed

**Solution:**
1. **Pass language_code to ElevenLabs** - Maps UI language to ElevenLabs codes (en→en, es→es, fr→fr, zh_hans→zh, hi_latn→hi)
2. **Use multilingual models** - Default order: `eleven_flash_v2_5` → `eleven_multilingual_v2` → `eleven_turbo_v2_5` (NOT `eleven_flash_v2` which is English-only)
3. **Browser fallback** - If ElevenLabs fails, falls back to browser `speechSynthesis` with matching locale voice
4. **Debug visibility** - Shows model_id + language_code in /debug TTS test

### How to Test TTS in All Languages (3 clicks)

1. **Go to** `http://localhost:3001/debug`
2. **Select a language** (e.g., "ES" for Spanish) in Translation Coverage Test
3. **Click "🔊 Test TTS in ES"** in Voice section → should hear Spanish audio

### Acceptance Tests

| Test | Expected |
|------|----------|
| TTS in English | Audio plays, model ≠ eleven_flash_v2 |
| TTS in Spanish | Audio plays with Spanish text |
| TTS in French | Audio plays with French text |
| TTS in Chinese | Audio plays with Chinese text |
| TTS in Hinglish | Audio plays with Hindi text |
| Model shown | eleven_flash_v2_5 or eleven_multilingual_v2 |
| Language code shown | Matches UI language (es, fr, zh, hi) |
| ElevenLabs fails | Falls back to browser speechSynthesis |

### Files Changed

| File | Change |
|------|--------|
| `src/app/api/tts/route.ts` | Added language_code mapping, updated model order, added language header |
| `src/components/ReadAloudButton.tsx` | Pass current language to TTS API, add browser speechSynthesis fallback |
| `src/app/debug/page.tsx` | Show language code in TTS test result, test phrases per language |

---

## Speech-to-Text (STT) Multilingual Support

### What's New

**SpeechRecognition Language Mapping**
- VoiceInput component now uses the selected UI language for speech recognition
- Language mapping: en→en-US, es→es-ES, fr→fr-FR, zh_hans→zh-CN, hi_latn→hi-IN
- Recognition language updates when user changes UI language
- Shows current recognition language in the recording indicator

**Browser Support Detection**
- Gracefully handles browsers without SpeechRecognition API
- Shows "🎤 Not supported" badge when API unavailable
- Mic button disabled when not supported

**Debug Page STT Test Section**
- Shows current UI language code and SpeechRecognition.lang (BCP-47)
- Displays language code mapping table (5 languages)
- Highlights current language in the mapping
- Shows browser support status
- Note for Hinglish: hi-IN may output Devanagari script

### How to Test STT Language (3 clicks)

1. **Go to** `http://localhost:3001/debug`
2. **Select a language** (e.g., "ES" for Spanish) in Translation Coverage Test
3. **Check "STT Language" section** → shows `es` → `es-ES` mapping highlighted

### Full Test in Practice Flow

1. **Change UI language to Spanish** (via language dropdown)
2. **Go to Practice → any topic → answer a question**
3. **Click "Speak" toggle in explanation field**
4. **Click mic button → speak in Spanish**
5. **Verify:** Recording indicator shows "Recording in Spanish... speak now"
6. **Verify:** Transcription appears in Spanish

### Acceptance Tests

| Test | Expected |
|------|----------|
| UI in English | recognition.lang = "en-US" |
| UI in Spanish | recognition.lang = "es-ES" |
| UI in French | recognition.lang = "fr-FR" |
| UI in Chinese | recognition.lang = "zh-CN" |
| UI in Hinglish | recognition.lang = "hi-IN" |
| Speak Spanish with es selected | Transcription in Spanish |
| Browser without SpeechRecognition | Shows "Not supported" badge |
| /debug STT section | Shows current mapping highlighted |

### Files Changed

| File | Change |
|------|--------|
| `src/components/VoiceInput.tsx` | Added STT_LANGUAGE_MAP, use selected language for recognition.lang |
| `src/app/debug/page.tsx` | Added STT Language Test section with mapping display |

---

## Thinking Autosave + Full Thinking Trail

### What's New

**Autosave Drafts to localStorage**
- All thinking text areas (initial explanation, follow-up explanation, teach-back response) autosave to localStorage
- Debounced saves (600ms) to avoid excessive writes
- Key format: `mm_thinking_draft_{userId}_{questionId}_{fieldType}`
- Shows "✓ Draft saved" indicator next to each field
- Shows "Mic on" indicator when recording is active

**Stop Mic + Flush on Navigation**
- When user clicks "Next Question" or navigates away:
  - All active mic recordings are automatically stopped
  - Any interim transcript is flushed to the text value
  - All pending debounced saves are flushed immediately
  - Drafts are cleared after successful attempt save

**Thinking Log in Attempt Metadata**
- All thinking is combined into `meta.thinking_log` array:
  - `{ type: "initial_explanation", text: "...", ts: 1234567890 }`
  - `{ type: "followup_explanation", text: "...", ts: 1234567891 }`
  - `{ type: "teachback", text: "...", ts: 1234567892 }`
- Stored in `attempts.top_misconceptions[0].thinking_log` (no DB migration needed)

**Coach Notes Use Full Thinking Trail**
- `/api/evaluate` now accepts optional `thinking_log` parameter
- `generateCoachNotes()` combines all thinking entries for analysis
- Coach notes reference the full thinking trail, not just initial explanation
- Extra credit for persistence: "Great persistence—you kept working through this!"

**Debug Page Test Section**
- Shows current user and stored draft count
- Displays most recent draft with timestamp
- Lists all stored drafts
- "Save Test Draft" button to simulate a save
- "Clear All Drafts" button to reset

### How to Test Thinking Autosave (5 steps)

1. **Go to Practice → any topic → Start Practice**
2. **Type in "Explain your thinking" field**
3. **Verify:** "✓ Draft saved" indicator appears after you stop typing
4. **Click "Speak" toggle → turn mic ON → speak**
5. **Do NOT manually stop mic → press "Next Question"**
6. **Go to /debug → "Thinking Autosave Test" section**
7. **Verify:** "Draft persisted: YES" and your spoken text appears

### Full Flow Test

1. **Answer a question incorrectly** (to get follow-up question + teach-back)
2. **Type initial explanation** → "Draft saved" appears
3. **Type follow-up explanation** → "Draft saved" appears
4. **Type teach-back response** → "Draft saved" appears
5. **Click "Save Response"** (teach-back) → attempt saved with all thinking
6. **Check /debug → Thinking Autosave Test** → verify drafts cleared after save
7. **Check Learn → My Coach Notes** → coach notes reference multiple thinking entries

### Acceptance Tests

| Test | Expected |
|------|----------|
| Type in explanation | "✓ Draft saved" appears after ~600ms |
| Mic ON + navigate | Mic stops, transcript flushed, draft saved |
| Check /debug after practice | Shows recent draft with text |
| Coach notes with multiple entries | References "persistence" or multiple thinking |
| Clear All Drafts | Drafts removed, count = 0 |
| Attempt save | thinking_log in metadata, drafts cleared |

### Files Changed

| File | Change |
|------|--------|
| `src/lib/thinking-drafts.ts` | **NEW** - Draft management utility (save, load, debounce, combine for coach notes) |
| `src/components/VoiceInput.tsx` | Added VoiceInputHandle ref interface, stopAndFlush method, draft status indicators |
| `src/lib/supabase/database.types.ts` | Added `thinking_log` to AttemptMetadata |
| `src/app/api/evaluate/route.ts` | Accept thinking_log, use full trail for coach notes |
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Added draft refs, debounced savers, navigation cleanup, thinking_log in metadata |
| `src/app/debug/page.tsx` | Added ThinkingAutosaveTestSection |

---

## Strict Answer Parsing + Fraction Swap Misconception

### What's New

**Format Typo Detection (before LLM)**
- Added deterministic parsing BEFORE any LLM call to catch format errors
- For fraction answers: accepts `^\s*-?\d+\s*/\s*-?\d+\s*$` format or integer
- Rejects malformed inputs like "5/", "/5", "3//4", "3/4/", non-numeric characters
- Returns `error_class="review_error"`, `review_error_type="format_typo"`
- Shows friendly message: "Looks like a typo or format slip. Check your answer format."
- Increments `REVIEW:format_typo` stat (no LLM call, no diagnose call)

**Fraction Swap Misconception (FRAC-SWAP)**
- New misconception entry for swapped numerator/denominator
- Heuristic detection in /api/diagnose:
  - If student's numerator = correct's denominator AND student's denominator = correct's numerator
  - Automatically prioritizes FRAC-SWAP as top misconception with ≥95% confidence
- FRAC-SWAP is auto-added to candidate list for all fraction questions
- Includes targeted remediation explaining numerator vs denominator roles

### How to Test (3 clicks)

1. **Go to /debug → Answer Parsing Tests section**
2. **Click "Test Format Typo (5/)"**
   - Verify: PASS indicator shows, `review_error/format_typo` detected
3. **Click "Test Fraction Swap (4/3)"**
   - Verify: PASS indicator shows, FRAC-SWAP is top misconception with ≥90% confidence

### Alternative Test via Practice

1. **Go to Practice → Fractions → any question**
2. **Enter "5/" as answer** → Should show "Looks like a typo..." review error
3. **Enter "4/3" when correct is "3/4"** → Should show FRAC-SWAP in diagnosis

### Acceptance Tests

| Test | Expected |
|------|----------|
| Enter "5/" for fraction | review_error detected, format_typo type |
| Enter "/5" for fraction | review_error detected, format_typo type |
| Enter "4/3" when correct is "3/4" | FRAC-SWAP is top misconception |
| FRAC-SWAP confidence | ≥0.9 when reciprocal detected |
| No LLM call for format_typo | Returns immediately, no diagnose call |

### Files Changed

| File | Change |
|------|--------|
| `src/lib/types.ts` | Added `format_typo` to ReviewErrorType |
| `content/misconceptions.json` | Added REVIEW:format_typo and FRAC-SWAP entries |
| `src/app/api/evaluate/route.ts` | Added format typo detection before other checks |
| `src/app/api/diagnose/route.ts` | Added fraction swap heuristic detection, auto-add FRAC-SWAP for fractions |
| `src/app/debug/page.tsx` | Added Answer Parsing Tests section |

---

## Focus Mode Keyboard Flow (Enter → Next Question)

### What's New

**Enter Key Advances on Feedback Screen**
- In Focus Mode, pressing Enter on the feedback screen (Correct/Incorrect) triggers "Next Question"
- Does NOT interfere with typing in textareas (explanation, follow-up, teach-back)
- Stops any playing narration/audio before advancing
- Shows visual hint: "Next (Enter) →" on the button

**Auto-Focus Next Button**
- When feedback renders in Focus Mode, the Next button is automatically focused
- This allows Enter to work even without the global keydown handler (native behavior)

**Guardrails**
- Enter is ignored when focus is on textarea or text input
- Audio/narration is stopped before advancing
- Only active when Focus Mode is enabled

### How to Test (5 steps)

1. **Go to Practice → any topic → Start Practice**
2. **Enable Focus Mode** (toggle in header or settings)
3. **Answer a question** (type answer, press Enter to submit)
4. **On feedback screen**: Verify "Next (Enter) →" button is visible
5. **Press Enter** → Should advance to next question

### Edge Case Tests

| Test | Expected |
|------|----------|
| Focus Mode ON + Feedback + Enter | Advances to next question |
| Focus Mode OFF + Feedback + Enter | No action (must click button) |
| Typing in textarea + Enter | New line in textarea (no advance) |
| Audio playing + Enter | Stops audio, then advances |
| Next button label (Focus Mode) | Shows "Next (Enter) →" |
| Next button auto-focused | Button has focus ring on feedback render |

### Files Changed

| File | Change |
|------|--------|
| `src/app/(main)/practice/[topicId]/[questionId]/page.tsx` | Added nextButtonRef, auto-focus, stopGlobalAudio on Enter, updated button label |
| `src/app/debug/page.tsx` | Added Focus Mode Keyboard Flow test checklist |

---

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres)
- OpenAI API (gpt-4o-mini) — or Demo Mode
- ElevenLabs API (Text-to-Speech)
- Zod (JSON validation)
