# Misconception Mentor (Speak2Learn Math) — PRD

## One-liner
A math practice app that does **attempt-first learning**: the student must try, then the AI identifies the **misconception behind the mistake** (top-3 ranked), shows evidence from the student’s explanation, and generates targeted remediation + a follow-up practice question.

## Why this can win (hackathon framing)
- Not “just an AI tutor.” The hero feature is a **Misconception Engine** with structured, ranked outputs.
- Demo is crisp: wrong answer → misconception diagnosis → targeted fix → improvement.
- Built for reliability: small scope (grades 6–8, 3 topics) but polished.

## Target users
- Grade band: 6–8 (default)
- Secondary: 9–10 as a stretch (not required for MVP)
- Primary user: student
- Secondary user: parent/teacher (view progress, misconceptions)

## Scope for MVP (strict)
Topics:
1) Fractions (add/subtract + equivalence)
2) Negative numbers (add/subtract/multiply)
3) Linear equations (one-step + two-step)

Core loop:
Practice Question → Student submits (answer + explanation) → Evaluate correctness → If incorrect: diagnose misconception (top 3) → Show correct solution → Generate micro-lesson + 1 targeted follow-up question → Track mastery

## Non-goals (explicitly out of scope for MVP)
- “All math”
- Full notebook/PDF upload (NotebookLM style)
- Long multi-day spaced repetition scheduler
- Voice-first everywhere (optional stretch only)

## Key screens (match the sketches)

### 1) Home / Tabs
Top: two tabs
- Learn (default)
- Practice

Visual style:
- “Graph paper” vibe
- Yellow highlighter style on active tab
- Simple, calm, kid-friendly

### 2) Learn tab
Shows:
- Lesson #1–#4 cards (for the 3 topics + a "mixed review")
- Each lesson card shows:
  - title
  - 1-sentence goal
  - **Mastery health bar (0–100%)** with emoji badge
  - "Next up" hint showing the subskill that needs work
- Mastery percentage is based on:
  - **Coverage** — practicing all subskills within a topic
  - **Accuracy** — getting questions correct
  - You cannot reach high mastery by only doing one type of problem
- Bottom area: simple progress lines (like the sketch)
  - Accuracy over last 10 questions
  - Top misconceptions this week (top 3)
  - Explanatory note about coverage-based mastery

Lesson detail page:
- Short explanation (with math formatting)
- 1 worked example
- “Try Practice” button

### 3) Practice tab
Shows:
- Practice Set #1–#4
  - Fractions set
  - Negatives set
  - Linear equations set
  - Mixed review
- Each set displays: questions completed + accuracy

### 4) Practice question page (core)
Top:
- Back arrow
- Title: “Practice”

Question block:
- The math problem (clear and large)

Inputs:
- Answer input (short)
- Explanation input (large text area: “Enter your explanation here…”)

Submit button:
- “Check”

Optional (nice-to-have):
- Model label in small text: “Model: ____” (for demo transparency)

### 5) Feedback page
If correct:
- Big “Correct!” + friendly icon
- 1–2 sentence reinforcement
- Next button

If incorrect:
- “Incorrect — Let’s look at what went wrong”
- Correct solution (step-by-step, short)
- Misconception Engine output:
  - “What you got wrong” (top misconception)
  - Evidence: quote or highlight from student explanation
  - “Why this happens” (1–2 sentences)
  - Micro-lesson (short)
  - Follow-up practice question (immediately)
- Next button

## Misconception Engine (the differentiator)
### Inputs
- question text
- correct answer
- student answer
- student explanation
- topic (fractions / negatives / linear equations)
- candidate misconceptions list (predefined per question)

### Output (must be STRUCTURED)
Return:
- is_correct: true/false
- correct_solution_steps: 3–7 steps
- top_3_misconceptions: array of 3 items:
  - id
  - name
  - confidence (0–1)
  - evidence (exact quote from student explanation OR "none provided")
  - diagnosis (1 sentence)
  - remediation (micro-lesson, <= 120 words)
- next_practice_question: (generated, same topic, targets top misconception)
- teach_back_prompt: 1 prompt asking student to explain the corrected concept
- **key_takeaway**: the ONE thing to remember (max 12 words, student-friendly)

## Content: initial misconception library (MVP size)
Build a curated library of ~25 misconceptions across the 3 topics.
Each misconception has:
- id
- topic
- name
- short description
- common evidence patterns (keywords/phrases)
- remediation template
- **resources** (optional): array of { title, url, type } where type is video|article|practice

We do NOT train a model in the hackathon. We use LLM + structured library.

## Learning Resources (curated, no scraping)
Resources are curated links (no web scraping):
- Each misconception may have 1-3 curated resources
- Topic-level fallback resources exist for fractions/negatives/linear-equations
- Displayed in a "Learn More" card on the feedback page
- Links open in new tab (external sites)

## Learn Content + Read → Practice Loop
The Learn tab provides a polished "Read → Practice" experience:

### Lesson Structure (content/lessons.json)
Each topic has:
- **title** — Topic name
- **overview** — One-line description
- **explanation** — 1-2 paragraphs of kid-friendly explanation
- **worked_example** — Problem + step-by-step solution + answer
- **key_takeaways** — 3 memorable bullets
- **resources** — Curated external links (video/article/practice)

### Curated Resources (no web scraping)
All external links are manually curated for reliability:
- **Fractions**: Khan Academy fraction arithmetic, videos, practice
- **Negatives**: Khan Academy integer operations, videos, practice
- **Linear Equations**: Khan Academy equation solving, reviews, practice

### Learn UI Flow
1. **Lesson cards** — Show mastery bar (0–100%) + "Next up" hint + Read + Practice buttons
2. **Lesson detail page** — Key concepts, worked example, key takeaways, resource cards
3. **Practice CTA** — Clear "Practice This Topic" button links to practice set

### Subskill Tags (for mastery coverage)
Each question has a `skill_tag` indicating the subskill it tests:
- **Fractions**: `frac_same_denom`, `frac_unlike_denom`, `frac_equivalence`
- **Negatives**: `neg_add`, `neg_sub`, `neg_mul`
- **Linear Equations**: `lin_one_step`, `lin_two_step`

Mastery formula per skill:
```
coverage_factor = min(1, attempts / 3)
skill_score = coverage_factor * accuracy
topic_mastery = average(skill_scores) * 100
```

## Review Errors vs Misconceptions (error classification)
The system classifies incorrect answers into two categories:

### Review Errors
Quick slips that are NOT conceptual misunderstandings:
- **extra_digit** — typed "111" instead of "11"
- **missing_digit** — typed "1" instead of "11"
- **sign_slip** — typed "-5" instead of "5"
- **transposed_digits** — typed "43" instead of "34"
- **extra_zero** — typed "100" instead of "10"
- **decimal_slip** — typed "15" instead of "1.5"
- **arithmetic_slip** — close numeric error (edit distance ≤ 2)

**UX behavior:**
- Show "Review error detected: likely a quick slip (extra digit/sign slip/etc.)."
- Do NOT show "Did you mean {correct answer}?" — never reveal the answer
- Show misconception analysis with heading: "If you truly meant this answer, here are likely misconceptions…"
- No confirmation buttons — just "Try Again" / "Next Question" flow

### Misconception Errors
True conceptual misunderstandings requiring the full Misconception Engine diagnosis.

**UX behavior:**
- Show full misconception analysis with top-3 ranked cards
- Show follow-up question and teach-back prompt
- Solution steps shown immediately (not collapsed)

## Data to store (MVP)
- User profile (grade band)
- Attempts: question_id, answer, explanation, correctness, error_class (correct/review_error/misconception_error), review_error_type (nullable), top misconception id, timestamp
- Mastery:
  - per topic: accuracy + last practiced
  - per misconception: count + last seen
  - per review error type: count + last seen (stored as REVIEW:* in misconception_stats)

## Success metrics (for the demo + writeup)
- Time-to-value: user gets a misconception diagnosis in < 10 seconds
- Demo shows:
  1) A wrong answer
  2) A plausible misconception identified with evidence
  3) A targeted follow-up question
  4) Progress updated in the Learn tab

## Learn Dashboard Progress Panel
Shows two separate sections:
1. **Accuracy bar** (last 10 questions)
2. **Mistakes breakdown** (last 10):
   - Misconception errors bar (pink)
   - Review errors bar (amber)
3. **Top review errors this week** (top 3 from REVIEW:* stats)
4. **Top misconceptions this week** (top 3, excludes REVIEW:*)

## Demo script (2–3 min video)
1) Start on Practice → Fractions Set
2) Show a **review error**: type "111" instead of "11"
   - Point out: "Review error detected" + no correct answer revealed
   - Show collapsible solution + "If you truly meant this answer…" section
3) Show a **misconception error**: type "5/8" instead of "3/4"
   - Show: top misconception + evidence + micro-lesson
4) Take the follow-up question and get it right
5) Switch to Learn tab: show progress bars + "Top review errors" + "Top misconceptions"

## Stretch goals (only if MVP is stable)
- Voice explanation (record → transcribe → diagnose)
- “Daily 2-minute review” from top misconceptions
- Shareable “Misconception Report” for parents/teachers
## Review Errors (Slip vs Misconception)

### Definition
A **review error** is a wrong answer caused by a likely slip (typing/transcription/attention), not a conceptual misunderstanding.
Examples:
- extra digit (111 instead of 11)
- sign slip (-11 vs 11)
- transposed digits (43 vs 34)
- extra/missing zero (12 vs 120)

A **misconception error** is a wrong answer caused by applying an incorrect concept or procedure.

### Product behavior
When an answer is incorrect:
1) The system first checks for **review error** patterns using deterministic heuristics.
2) If it is likely a review error:
   - show “Review error detected” messaging
   - do NOT reveal the correct answer as a suggestion (no “Did you mean ___?”)
   - still show misconceptions as conditional: “If you truly meant this answer…”
3) If not a review error:
   - proceed with normal misconception diagnosis and remediation.

### Tracking and dashboard
The dashboard must display BOTH:
- **Review errors (last 10 attempts)** as a bar and count
- **Misconception errors (last 10 attempts)** as a bar and count

Additionally show:
- Top review error types this week (top 3)
- Top misconceptions this week (top 3)

### Success criteria for demo
In the demo video, show:
- a review error being detected and logged
- a misconception being detected and logged
- the Learn dashboard reflecting both categories separately
