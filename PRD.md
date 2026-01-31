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
- Lesson #1–#4 cards (for the 3 topics + a “mixed review”)
- Each lesson card shows:
  - title
  - 1-sentence goal
  - progress indicator (Not started / Learning / Solid)
- Bottom area: simple progress lines (like the sketch)
  - Accuracy over last 10 questions
  - Top misconceptions this week (top 3)

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
  - evidence (exact quote from student explanation OR “none provided”)
  - diagnosis (1 sentence)
  - remediation (micro-lesson, <= 120 words)
- next_practice_question: (generated, same topic, targets top misconception)
- teach_back_prompt: 1 prompt asking student to explain the corrected concept

## Content: initial misconception library (MVP size)
Build a curated library of ~25 misconceptions across the 3 topics.
Each misconception has:
- id
- topic
- name
- short description
- common evidence patterns (keywords/phrases)
- remediation template

We do NOT train a model in the hackathon. We use LLM + structured library.

## Data to store (MVP)
- User profile (grade band)
- Attempts: question_id, answer, explanation, correctness, top misconception id, timestamp
- Mastery:
  - per topic: accuracy + last practiced
  - per misconception: count + last seen

## Success metrics (for the demo + writeup)
- Time-to-value: user gets a misconception diagnosis in < 10 seconds
- Demo shows:
  1) A wrong answer
  2) A plausible misconception identified with evidence
  3) A targeted follow-up question
  4) Progress updated in the Learn tab

## Demo script (2–3 min video)
1) Start on Practice → Fractions Set
2) Intentionally answer wrong + give a realistic explanation
3) Show: top misconception + evidence + micro-lesson
4) Take the follow-up question and get it right
5) Switch to Learn tab: show progress + “Top misconceptions this week”

## Stretch goals (only if MVP is stable)
- Voice explanation (record → transcribe → diagnose)
- “Daily 2-minute review” from top misconceptions
- Shareable “Misconception Report” for parents/teachers
