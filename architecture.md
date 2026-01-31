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
  - top misconceptions this week
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
- misconception_id (text)
- count (int)
- last_seen_at

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
- name
- description
- evidence_patterns (array of strings)
- remediation_template

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
  "short_feedback": "..."
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
  "teach_back_prompt": "…"
}

Rules:
- Always return exactly 3 items in top_3 (even if low confidence)
- Evidence must quote from student explanation if available; otherwise "none provided"
- Keep remediation short and actionable

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
