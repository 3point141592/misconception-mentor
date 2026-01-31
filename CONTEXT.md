# Misconception Mentor — Build Context

## Current Status
**Chunk 5 of 7: COMPLETE ✅**

## What's Done
### Chunk 1-4 ✅
- Next.js 14 + TypeScript + Tailwind scaffold
- UI shell with Learn/Practice tabs
- Content JSON (18 questions, 15 misconceptions)
- Practice flow with feedback pages
- Supabase auth + database tables

### Chunk 5 ✅
- [x] POST /api/evaluate route handler
- [x] OpenAI integration with gpt-4o-mini
- [x] Strict JSON response format
- [x] API key validation (500 error if missing)
- [x] Demo mode fallback (DEMO_MODE=true)
- [x] Practice UI calls /api/evaluate on "Check"
- [x] Loading spinner during API call
- [x] Error display with troubleshooting tip
- [x] Solution steps from AI shown on incorrect answers

## How to Run Locally

### 1. Set environment variables
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
OPENAI_API_KEY=sk-your-openai-key-here
```

### 2. Install & run
```bash
npm install
npm run dev
```

### 3. Open http://localhost:3001

## API: POST /api/evaluate

**Request:**
```json
{
  "question_prompt": "Calculate: 1/4 + 1/2",
  "correct_answer": "3/4",
  "student_answer": "1/6",
  "student_explanation": "I added the denominators"
}
```

**Response (strict JSON):**
```json
{
  "is_correct": false,
  "solution_steps": [
    "Find a common denominator: 4",
    "Convert 1/2 to 2/4",
    "Add: 1/4 + 2/4 = 3/4"
  ],
  "short_feedback": "Not quite! Remember to find a common denominator first."
}
```

## Project Structure
```
/src
  /app
    /api
      /evaluate/route.ts    # ← NEW: AI evaluation endpoint
    /(main)/practice/[topicId]/[questionId]/page.tsx  # Updated
  /lib
    /supabase/...
```

## Next Chunk
**Chunk 6: /api/diagnose route**
- Misconception Engine with AI ranking
- Top-3 misconceptions with evidence
- Replace mock diagnosis

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=     # Required
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Required  
OPENAI_API_KEY=               # Required for Chunk 5+
DEMO_MODE=false               # Optional: "true" skips API calls
```

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres)
- OpenAI API (gpt-4o-mini)
