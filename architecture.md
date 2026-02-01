# Misconception Mentor — Architecture

## Goals
- Ship a reliable MVP that matches PRD.md
- Make the misconception engine central + visible
- Keep the build small enough to finish + polish

## Tech stack (recommended)
Frontend:
- Next.js (App Router) + TypeScript
- Tailwind CSS for rapid styling
- UI vibe: graph-paper background + highlighter accents + clean cards

Backend:
- Next.js route handlers (server API endpoints)
- Supabase for:
  - Auth
  - Postgres DB
  - (Optional) Storage later

AI:
- One LLM provider via API (default: OpenAI)
- Keep prompts short, JSON outputs strict, and latency low

Deployment:
- Vercel (recommended)

## System overview
Client (Next.js UI)
  ↕
API routes (/api/*)
  ↕
Supabase (auth + db)
  ↕
LLM API (evaluate + diagnose + remediate)

## Key flows

### Flow A: Practice submission
1) User submits answer + explanation
2) API validates input
3) API calls LLM for:
   - correctness check
   - correct solution steps
4) If incorrect:
   - call Misconception Engine prompt with candidate misconception list
   - return top-3 misconceptions + targeted remediation + follow-up question
5) Persist attempt + update mastery
6) UI renders feedback page

### Flow B: Learn tab dashboard
- Pull last N attempts
- Compute:
  - accuracy trend
  - review errors count (last 10)
  - misconception errors count (last 10)
  - top review errors this week (from REVIEW:* stats)
  - top misconceptions this week (excludes REVIEW:*)
  - per-topic mastery (Not started / Learning / Solid)

## Data model (Supabase)
Tables (minimum viable):

1) profiles
- user_id (uuid, pk, matches auth.users)
- display_name (text)
- grade_band (text; default "6-8")
- created_at

2) attempts
- id (uuid, pk)
- user_id (uuid, fk)
- question_id (text)
- topic (text)
- answer_text (text)
- explanation_text (text)
- is_correct (bool)
- top_misconceptions (jsonb)  // store top-3 array
- created_at

3) mastery
- user_id (uuid, fk)
- topic (text)
- accuracy (float)
- last_practiced_at

4) misconception_stats
- user_id (uuid, fk)
- misconception_id (text)  // For review errors: "REVIEW:extra_digit", "REVIEW:sign_slip", etc.
- count (int)
- last_seen_at

Note: Review errors are tracked in the same table with IDs like `REVIEW:extra_digit`. The Learn dashboard filters these separately from actual misconceptions.

## Content model (in repo for MVP)
Store these as plain JSON files (easy, fast, no admin UI yet):
- /content/questions.json
- /content/misconceptions.json

Each question includes:
- id
- topic
- prompt
- answer_format (short text / mcq)
- correct_answer
- candidate_misconception_ids (array)

Each misconception includes:
- id
- topic
- category: "misconception" | "review_error"
- name
- description
- evidence_patterns (array of strings)
- remediation_template

Review error entries use IDs like `REVIEW:extra_digit` and have `category: "review_error"`.

## Review Error Detection (deterministic, no LLM)

Before calling the LLM, the `/api/evaluate` route runs `detectReviewError()` heuristics:
- **extra_digit** — edit distance 1, student answer longer
- **missing_digit** — edit distance 1, student answer shorter  
- **sign_slip** — student = "-" + correct OR correct = "-" + student
- **transposed_digits** — same digits, different order
- **extra_zero** — student = correct + "0"
- **decimal_slip** — decimal point added/removed
- **arithmetic_slip** — edit distance ≤ 2 and both numeric

If a review error is detected:
- Return immediately (no LLM call)
- `error_class: "review_error"`
- `review_error_type`: one of the above
- `review_error_message`: user-friendly message (does NOT reveal correct answer)

## LLM prompt contracts (must be strict JSON)

### 1) Evaluate endpoint (correctness + solution)
Input:
- question.prompt
- question.correct_answer
- student_answer
- student_explanation

Output JSON:
{
  "is_correct": boolean,
  "solution_steps": ["step1", "step2", "..."],
  "short_feedback": "...",
  "error_class": "correct" | "review_error" | "misconception_error",
  "review_error_type": null | "extra_digit" | "sign_slip" | ...,
  "review_error_message": null | "Review error detected: likely a quick slip..."
}

### 2) Diagnose endpoint (top-3 misconceptions + remediation)
Input:
- question + correct_answer
- student_answer + explanation
- candidate_misconceptions: [{id, name, description, evidence_patterns, remediation_template}]

Output JSON:
{
  "top_3": [
    {
      "id": "MISCON_01",
      "name": "…",
      "confidence": 0.0,
      "evidence": "…",
      "diagnosis": "…",
      "remediation": "…"
    }
  ],
  "next_practice_question": {
    "prompt": "…",
    "correct_answer": "…",
    "why_this_targets": "…"
  },
  "teach_back_prompt": "…",
  "key_takeaway": "The ONE thing to remember (max 12 words)"
}

Rules:
- Always return exactly 3 items in top_3 (even if low confidence)
- Evidence must quote from student explanation if available; otherwise "none provided"
- Keep remediation short and actionable
- key_takeaway must be max 12 words, simple language, memorable

## Learning Resources (curated links)
Resources are curated manually (no web scraping):
- Misconception-specific resources: stored in misconceptions.json as `resources` array
- Topic-level fallbacks: stored in misconceptions.json under `topic_resources`
- Format: `{ title, url, type }` where type is video|article|practice
- Displayed on feedback page as "Learn More" card (max 3 links)
- Links open in new tab (external sites like Khan Academy, MathIsFun, IXL)

## Learn Content Model (content/lessons.json)
Lesson content stored in local JSON (no web scraping):

```json
{
  "id": "fractions",
  "title": "Fractions",
  "overview": "One-line description",
  "explanation": ["Paragraph 1", "Paragraph 2"],
  "worked_example": {
    "problem": "Calculate: 1/4 + 1/2",
    "steps": ["Step 1...", "Step 2..."],
    "answer": "3/4"
  },
  "key_takeaways": ["Bullet 1", "Bullet 2", "Bullet 3"],
  "resources": [
    { "title": "...", "url": "https://...", "type": "video|article|practice" }
  ]
}
```

### Content Helpers (src/lib/content.ts)
- `getLessonById(topicId)` — Returns full lesson content
- `getAllLessons()` — Returns all lessons

### Learn UI Components
- **LessonCard** — Shows status badge + Read/Practice buttons
- **Lesson Detail Page** — Key concepts, worked example, key takeaways, resource cards, Practice CTA

## Security + reliability requirements
- Never commit API keys (use .env.local)
- If AI call fails, UI should show a friendly error and allow retry
- Add basic rate limiting (lightweight) to avoid accidental cost spikes
- Log errors server-side (console is fine for hackathon)

## Environment variables (.env.local)
- NEXT_PUBLIC_SUPABASE_URL=
- NEXT_PUBLIC_SUPABASE_ANON_KEY=
- SUPABASE_SERVICE_ROLE_KEY=   (server only; never expose to client)
- AI_PROVIDER= "openai"
- OPENAI_API_KEY=
- DEMO_MODE= "false"  // if true, return canned responses for demo reliability

## Deployment checklist
- Vercel project connected to GitHub repo
- Add env vars in Vercel dashboard
- Deploy main branch
- Verify: login works, practice flow works, AI responses render, Learn dashboard updates

## “Context file” (recommended for vibe coding)
Create /CONTEXT.md and keep updated:
- What’s implemented
- What’s broken
- How to run locally
- Next chunk to build
This reduces “AI forgetting” when context windows reset.
## Error classification layer: Review Errors vs Misconceptions

### Classification order
When a student submits an answer:
1) Evaluate correctness
2) If incorrect, run deterministic `detectReviewError(correctAnswer, studentAnswer)`
3) If review error:
   - return `error_class="review_error"` and `review_error_type`
   - do NOT reveal the correct answer as a suggestion
   - optionally still compute misconceptions but label them as conditional (“if you meant it”)
4) Else:
   - return `error_class="misconception_error"` and normal misconception diagnosis

### /api/evaluate response contract (strict JSON)
- is_correct: boolean
- solution_steps: string[]
- short_feedback: string
- error_class: "correct" | "review_error" | "misconception_error"
- review_error_type: string | null
- review_error_message: string | null  (must not reveal the correct answer)

### Storage + stats
- Attempts must store `error_class` and `review_error_type` (direct columns or within JSONB payload).
- Use existing misconception_stats table to track review errors with ids like:
  - REVIEW:extra_digit
  - REVIEW:sign_slip
  - REVIEW:transpose_digits
- Dashboard queries must separate:
  - REVIEW:* stats → review error analytics
  - non-REVIEW ids → misconception analytics

### Learn dashboard metrics
For last 10 attempts:
- correct_count
- review_error_count
- misconception_error_count
Display two bars:
- Review errors bar (review_error_count / total)
- Misconception errors bar (misconception_error_count / total)
