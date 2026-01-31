import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Response type (strict JSON schema)
interface EvaluateResponse {
  is_correct: boolean;
  solution_steps: string[];
  short_feedback: string;
}

// Request body type
interface EvaluateRequest {
  question_prompt: string;
  correct_answer: string;
  student_answer: string;
  student_explanation?: string;
}

export async function POST(request: NextRequest) {
  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Please add it to .env.local" },
      { status: 500 }
    );
  }

  // Parse request body
  let body: EvaluateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  // Validate required fields
  const { question_prompt, correct_answer, student_answer } = body;
  if (!question_prompt || !correct_answer || !student_answer) {
    return NextResponse.json(
      { error: "Missing required fields: question_prompt, correct_answer, student_answer" },
      { status: 400 }
    );
  }

  // Check for demo mode
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json(getDemoResponse(student_answer, correct_answer));
  }

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey });

  // Build prompt
  const systemPrompt = `You are a math teacher evaluating a student's answer. Your task is to:
1. Determine if the student's answer is mathematically correct (equivalent to the expected answer)
2. If incorrect, provide a clear step-by-step solution
3. Provide brief feedback

You MUST respond with valid JSON only, no other text. Use this exact schema:
{
  "is_correct": boolean,
  "solution_steps": ["step 1", "step 2", ...],
  "short_feedback": "brief encouraging feedback"
}

Rules:
- "is_correct": true if the student's answer is mathematically equivalent to the correct answer (e.g., "0.5" = "1/2")
- "solution_steps": If correct, return ["Your answer is correct!"]. If incorrect, return 3-5 clear steps showing the solution.
- "short_feedback": 1-2 sentences. Be encouraging but honest.`;

  const userPrompt = `Question: ${question_prompt}
Correct answer: ${correct_answer}
Student's answer: ${student_answer}
${body.student_explanation ? `Student's explanation: ${body.student_explanation}` : ""}

Evaluate this answer and respond with JSON only.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse and validate response
    const parsed = JSON.parse(content) as EvaluateResponse;
    
    // Ensure required fields exist
    const response: EvaluateResponse = {
      is_correct: Boolean(parsed.is_correct),
      solution_steps: Array.isArray(parsed.solution_steps) 
        ? parsed.solution_steps 
        : ["Unable to generate solution steps"],
      short_feedback: parsed.short_feedback || "Please review your answer.",
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("OpenAI API error:", error);
    
    // Return a graceful error response
    return NextResponse.json(
      { 
        error: "Failed to evaluate answer. Please try again.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// Demo mode response (no API call)
function getDemoResponse(studentAnswer: string, correctAnswer: string): EvaluateResponse {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/\+/g, "");
  const isCorrect = normalize(studentAnswer) === normalize(correctAnswer);

  if (isCorrect) {
    return {
      is_correct: true,
      solution_steps: ["Your answer is correct!"],
      short_feedback: "Great job! You got it right.",
    };
  }

  return {
    is_correct: false,
    solution_steps: [
      "Let's work through this step by step.",
      "First, identify what operation is needed.",
      "Apply the correct mathematical rules.",
      `The correct answer is ${correctAnswer}.`,
    ],
    short_feedback: "Not quite right, but you're learning! Review the steps above.",
  };
}
