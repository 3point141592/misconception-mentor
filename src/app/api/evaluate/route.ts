import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ErrorClass, ReviewErrorType, CoachNotes } from "@/lib/types";
import { type LanguageCode, getAILanguageInstruction } from "@/i18n";
import { type ThinkingLogEntry, combineThinkingForCoachNotes } from "@/lib/thinking-drafts";

// Response type (strict JSON schema)
interface EvaluateResponse {
  is_correct: boolean;
  solution_steps: string[];
  short_feedback: string;
  error_class: ErrorClass;
  review_error_type: ReviewErrorType | null;
  review_error_message: string | null; // Must NOT reveal correct answer
  coach_notes: CoachNotes;
}

// Get model from env or use default
const getModel = () => process.env.OPENAI_MODEL_EVALUATE || "gpt-4o-mini";

// Request body type
interface EvaluateRequest {
  question_prompt: string;
  correct_answer: string;
  student_answer: string;
  student_explanation?: string;
  question_id?: string;
  language?: LanguageCode; // Language for AI output
  thinking_log?: ThinkingLogEntry[]; // Full thinking trail (initial + followup + teachback)
}

// Calculate Levenshtein edit distance
function editDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Helper to check if a string is a valid integer format
function isValidIntegerFormat(s: string): boolean {
  return /^\s*-?\d+\s*$/.test(s);
}

// Helper to check if a string is a valid fraction format
function isValidFractionFormat(s: string): boolean {
  return /^\s*-?\d+\s*\/\s*-?\d+\s*$/.test(s);
}

// Helper to parse a fraction string into numerator and denominator
function parseFraction(s: string): { num: number; den: number } | null {
  const match = s.trim().match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const den = parseInt(match[2], 10);
  if (isNaN(num) || isNaN(den) || den === 0) return null;
  return { num, den };
}

// Detect format typos before other checks
function detectFormatTypo(
  studentAnswer: string,
  correctAnswer: string
): { isFormatError: boolean; message: string | null } {
  const student = studentAnswer.trim();
  const correct = correctAnswer.trim();
  
  // Determine expected format from correct answer
  const correctIsFraction = isValidFractionFormat(correct);
  const correctIsInteger = isValidIntegerFormat(correct);
  
  // If correct answer is a fraction
  if (correctIsFraction) {
    // Student answer should be a valid fraction OR a valid integer (if they simplified to whole number)
    if (!isValidFractionFormat(student) && !isValidIntegerFormat(student)) {
      // Check for common format typos
      if (/\/\s*$/.test(student) || /^\s*\//.test(student) || /\/\s*\//.test(student)) {
        return {
          isFormatError: true,
          message: "Looks like a typo or format slip. Make sure your fraction is complete (e.g., '3/4')."
        };
      }
      // Contains slash but not valid fraction format
      if (student.includes("/")) {
        return {
          isFormatError: true,
          message: "Looks like a typo or format slip. Check your fraction format (e.g., '3/4')."
        };
      }
      // Contains non-numeric characters (excluding allowed symbols)
      if (!/^[\d\s\/\-\.]+$/.test(student)) {
        return {
          isFormatError: true,
          message: "Looks like a typo or format slip. Use only numbers for your answer."
        };
      }
    }
  }
  
  // If correct answer is an integer
  if (correctIsInteger) {
    // Student answer should be a valid integer
    if (!isValidIntegerFormat(student)) {
      // Might be trying to enter a fraction for an integer answer
      if (student.includes("/")) {
        // This might be intentional (equivalent fraction), so don't flag
        // unless it's malformed
        if (!isValidFractionFormat(student)) {
          return {
            isFormatError: true,
            message: "Looks like a typo or format slip. Check your answer format."
          };
        }
      }
      // Contains non-numeric characters
      if (!/^[\d\s\-\.]+$/.test(student)) {
        return {
          isFormatError: true,
          message: "Looks like a typo or format slip. Enter a number for your answer."
        };
      }
    }
  }
  
  return { isFormatError: false, message: null };
}

// Review error detection heuristics - runs BEFORE any AI call
// Returns review_error_type and message WITHOUT revealing the correct answer
function detectReviewError(
  studentAnswer: string,
  correctAnswer: string
): { 
  isReviewError: boolean; 
  type: ReviewErrorType | null; 
  message: string | null;
} {
  const student = studentAnswer.trim();
  const correct = correctAnswer.trim();

  // Normalize for comparison (remove spaces)
  const studentNorm = student.replace(/\s+/g, "");
  const correctNorm = correct.replace(/\s+/g, "");

  // If exact match, not a review error
  if (studentNorm.toLowerCase() === correctNorm.toLowerCase()) {
    return { isReviewError: false, type: null, message: null };
  }
  
  // FIRST: Check for format typos (e.g., "5/", "/5", "3//4")
  const formatResult = detectFormatTypo(student, correct);
  if (formatResult.isFormatError) {
    return {
      isReviewError: true,
      type: "format_typo",
      message: formatResult.message || "Looks like a typo or format slip. Double-check your answer format."
    };
  }

  // Check for extra digit (e.g., "111" instead of "11") - most specific check first
  if (/^-?\d+$/.test(studentNorm) && /^-?\d+$/.test(correctNorm)) {
    const studentDigits = studentNorm.replace("-", "");
    const correctDigits = correctNorm.replace("-", "");
    
    // Extra digit
    if (studentDigits.length === correctDigits.length + 1) {
      if (studentDigits.startsWith(correctDigits) || studentDigits.endsWith(correctDigits)) {
        return { 
          isReviewError: true, 
          type: "extra_digit", 
          message: "Review error detected: likely a quick slip (extra digit). Double-check your number and try again."
        };
      }
    }
    // Missing digit
    if (correctDigits.length === studentDigits.length + 1) {
      if (correctDigits.startsWith(studentDigits) || correctDigits.endsWith(studentDigits)) {
        return { 
          isReviewError: true, 
          type: "missing_digit", 
          message: "Review error detected: likely a quick slip (missing digit). Double-check your number and try again."
        };
      }
    }
    // Extra zero
    if (studentNorm === correctNorm + "0") {
      return { 
        isReviewError: true, 
        type: "extra_zero", 
        message: "Review error detected: likely a quick slip (extra zero). Double-check your answer and try again."
      };
    }
    // Transposed digits (e.g., 43 vs 34)
    if (studentDigits.length === correctDigits.length && studentDigits.length >= 2) {
      const sortedStudent = studentDigits.split("").sort().join("");
      const sortedCorrect = correctDigits.split("").sort().join("");
      if (sortedStudent === sortedCorrect && studentDigits !== correctDigits) {
        return {
          isReviewError: true,
          type: "transposed_digits",
          message: "Review error detected: likely a quick slip (transposed digits). Check the order of your digits and try again."
        };
      }
    }
  }

  // Check for sign slip (e.g., "-5" vs "5" or "5" vs "-5")
  if (studentNorm === "-" + correctNorm || "-" + studentNorm === correctNorm) {
    return { 
      isReviewError: true, 
      type: "sign_slip", 
      message: "Review error detected: likely a quick slip (sign error). Check if your answer should be positive or negative."
    };
  }

  // Check for decimal point issues
  if (studentNorm.replace(".", "") === correctNorm || studentNorm === correctNorm.replace(".", "")) {
    return { 
      isReviewError: true, 
      type: "decimal_slip", 
      message: "Review error detected: likely a quick slip (decimal placement). Check your decimal point and try again."
    };
  }

  // Small edit distance with short answers - could be arithmetic slip
  if (editDistance(studentNorm, correctNorm) <= 2 && studentNorm.length <= 5 && correctNorm.length <= 5) {
    // Only count as arithmetic slip if both are numeric
    if (/^-?\d+\.?\d*$/.test(studentNorm) && /^-?\d+\.?\d*$/.test(correctNorm)) {
      return { 
        isReviewError: true, 
        type: "arithmetic_slip", 
        message: "Review error detected: likely a quick slip (arithmetic). Your answer is very close—double-check your calculation."
      };
    }
  }

  return { isReviewError: false, type: null, message: null };
}

// Generate coach notes based on student explanation and context
// MUST be personalized and reference the student's explanation when present
// Uses full thinking trail when available (initial + followup + teachback)
function generateCoachNotes(
  studentExplanation: string | undefined,
  isCorrect: boolean,
  errorClass: ErrorClass,
  reviewErrorType: ReviewErrorType | null,
  questionPrompt: string,
  thinkingLog?: ThinkingLogEntry[]
): CoachNotes {
  // Combine all thinking into a single analysis string
  let fullThinking = studentExplanation?.trim() || "";
  
  // If we have a thinking log, combine it for richer analysis
  if (thinkingLog && thinkingLog.length > 0) {
    const combinedLog = combineThinkingForCoachNotes(thinkingLog);
    if (combinedLog) {
      fullThinking = combinedLog;
    }
  }
  
  const hasExplanation = fullThinking.length >= 15;
  
  // Base coach notes structure
  const baseNotes: CoachNotes = {
    title: "Coach Notes (from your thinking)",
    what_went_well: [],
    what_to_fix: [],
    remember: "",
    next_step: "",
  };
  
  // If no meaningful explanation, prompt them to explain next time
  if (!hasExplanation) {
    return {
      ...baseNotes,
      what_went_well: [],
      what_to_fix: ["I couldn't see your thinking this time."],
      remember: "Explaining helps me coach you better!",
      next_step: "Write 1–2 sentences next time so I can help with your specific approach.",
    };
  }
  
  // Extract a short quote from the thinking (up to 30 chars)
  const shortQuote = fullThinking.length > 30 
    ? `"${fullThinking.substring(0, 27)}..."`
    : `"${fullThinking}"`;
  
  // Check if we have multiple thinking entries (shows persistence)
  const hasMultipleEntries = thinkingLog && thinkingLog.length > 1;
  
  // Correct answer with explanation
  if (isCorrect) {
    const wellDone = hasMultipleEntries
      ? [
          `You explained: ${shortQuote}—great thinking!`,
          "Your reasoning led you to the right answer.",
          "I can see you reflected on this problem—nice persistence!",
        ]
      : [
          `You explained: ${shortQuote}—great thinking!`,
          "Your reasoning led you to the right answer.",
        ];
    
    return {
      ...baseNotes,
      what_went_well: wellDone.slice(0, 2),
      what_to_fix: [],
      remember: "Keep explaining your thinking—it builds strong habits!",
      next_step: "Try a harder problem to stretch your skills.",
    };
  }
  
  // Review error (quick slip)
  if (errorClass === "review_error") {
    const slipTypes: Record<string, string> = {
      extra_digit: "Watch for extra digits when writing your answer.",
      missing_digit: "Make sure you write all the digits in your answer.",
      sign_slip: "Double-check positive vs negative signs.",
      extra_zero: "Count your zeros carefully.",
      transposed_digits: "Check the order of your digits.",
      decimal_slip: "Check your decimal point placement.",
      arithmetic_slip: "Slow down on the final calculation.",
    };
    
    const slipAdvice = reviewErrorType ? slipTypes[reviewErrorType] : "Double-check your final answer.";
    
    return {
      ...baseNotes,
      what_went_well: [
        `You wrote ${shortQuote}—your approach makes sense.`,
        "Just a small slip at the end!",
      ],
      what_to_fix: ["The logic was right, but check your final answer carefully."],
      remember: slipAdvice,
      next_step: "Before submitting, read your answer out loud to catch slips.",
    };
  }
  
  // Misconception error - analyze the full thinking and make it personal
  const thinkingLower = fullThinking.toLowerCase();
  const whatWentWell: string[] = [];
  const whatToFix: string[] = [];
  
  // Check for positive signals in thinking and QUOTE them
  if (thinkingLower.includes("step") || thinkingLower.includes("first") || thinkingLower.includes("then")) {
    whatWentWell.push(`You showed step-by-step thinking: ${shortQuote}`);
  } else if (thinkingLower.includes("i think") || thinkingLower.includes("because") || thinkingLower.includes("so")) {
    whatWentWell.push(`You explained your reasoning: ${shortQuote}`);
  } else {
    whatWentWell.push(`Thanks for writing: ${shortQuote}`);
  }
  
  // Extra credit for persistence (multiple thinking entries)
  if (hasMultipleEntries) {
    whatWentWell.push("Great persistence—you kept working through this!");
  }
  
  // Analyze the thinking for specific misconception indicators
  let rememberTip = "Understanding why helps more than memorizing how.";
  
  if (thinkingLower.includes("add") && (thinkingLower.includes("top") || thinkingLower.includes("numerator") || thinkingLower.includes("bottom") || thinkingLower.includes("denominator"))) {
    whatToFix.push("You mentioned adding tops and bottoms—that's a common trap!");
    rememberTip = "Only add numerators when denominators match.";
  } else if (thinkingLower.includes("add") && thinkingLower.includes("both")) {
    whatToFix.push("Check which parts should be added together.");
    rememberTip = "Not everything gets added the same way.";
  } else if (thinkingLower.includes("multiply") || thinkingLower.includes("times")) {
    whatToFix.push("Review when to multiply vs other operations.");
    rememberTip = "Check which operation the problem is asking for.";
  } else if (thinkingLower.includes("positive") || thinkingLower.includes("negative")) {
    whatToFix.push("The sign rules need another look.");
    rememberTip = "Same signs = positive, different signs = negative.";
  } else if (thinkingLower.includes("same") || thinkingLower.includes("equal")) {
    whatToFix.push("There's a step that got skipped or mixed up.");
    rememberTip = "Check each step against the rules.";
  } else {
    whatToFix.push("Your approach has a gap—review the concept.");
    rememberTip = "Re-read the lesson, then try again.";
  }
  
  return {
    ...baseNotes,
    what_went_well: whatWentWell.slice(0, 2),
    what_to_fix: whatToFix.slice(0, 2),
    remember: rememberTip,
    next_step: "Review the solution steps, then try the follow-up question.",
  };
}

export async function POST(request: NextRequest) {
  // Parse request body first
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

  // STEP 1: Check for exact correctness first
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();
  if (normalize(student_answer) === normalize(correct_answer)) {
    const coachNotes = generateCoachNotes(
      body.student_explanation,
      true,
      "correct",
      null,
      question_prompt,
      body.thinking_log
    );
    return NextResponse.json({
      is_correct: true,
      solution_steps: ["Your answer is correct!"],
      short_feedback: "Great job! You got it right.",
      error_class: "correct",
      review_error_type: null,
      review_error_message: null,
      coach_notes: coachNotes,
    } as EvaluateResponse);
  }

  // STEP 2: Run review error detection heuristics BEFORE any AI
  const reviewResult = detectReviewError(student_answer, correct_answer);
  if (reviewResult.isReviewError) {
    const coachNotes = generateCoachNotes(
      body.student_explanation,
      false,
      "review_error",
      reviewResult.type,
      question_prompt,
      body.thinking_log
    );
    return NextResponse.json({
      is_correct: false,
      solution_steps: [], // Don't show solution for review errors initially
      short_feedback: reviewResult.message || "Check your answer for a small error.",
      error_class: "review_error",
      review_error_type: reviewResult.type,
      review_error_message: reviewResult.message,
      coach_notes: coachNotes,
    } as EvaluateResponse);
  }

  // STEP 3: Not a review error - check for demo mode
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json(getDemoResponse(question_prompt, body.student_explanation, body.thinking_log));
  }

  // STEP 4: Validate API key (only needed if not in demo mode)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Please add it to .env.local or enable DEMO_MODE=true" },
      { status: 500 }
    );
  }

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey });

  // Get language instruction
  const languageInstruction = getAILanguageInstruction(body.language || "en");

  // Build prompt - Note: we still pass correct answer to AI for evaluation
  const systemPrompt = `You are a math teacher evaluating a student's answer. Your task is to:
1. Determine if the student's answer is mathematically correct (equivalent to the expected answer)
2. If incorrect, provide a clear step-by-step solution
3. Provide brief feedback

${languageInstruction}

You MUST respond with valid JSON only, no other text. Use this exact schema:
{
  "is_correct": boolean,
  "solution_steps": ["step 1", "step 2", ...],
  "short_feedback": "brief encouraging feedback"
}

Rules:
- "is_correct": true if the student's answer is mathematically equivalent to the correct answer (e.g., "0.5" = "1/2")
- "solution_steps": If correct, return ["Your answer is correct!"]. If incorrect, return 3-5 clear steps showing the solution.
- "short_feedback": 1-2 sentences. Be encouraging but honest.
- Keep all JSON keys in English (is_correct, solution_steps, short_feedback).`;

  const userPrompt = `Question: ${question_prompt}
Correct answer: ${correct_answer}
Student's answer: ${student_answer}
${body.student_explanation ? `Student's explanation: ${body.student_explanation}` : ""}

Evaluate this answer and respond with JSON only.`;

  try {
    const completion = await openai.chat.completions.create({
      model: getModel(),
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
    const parsed = JSON.parse(content);
    const isCorrect = Boolean(parsed.is_correct);
    const errorClass: ErrorClass = isCorrect ? "correct" : "misconception_error";
    
    // Generate coach notes based on explanation and result
    const coachNotes = generateCoachNotes(
      body.student_explanation,
      isCorrect,
      errorClass,
      null,
      question_prompt,
      body.thinking_log
    );
    
    // Ensure required fields exist
    const response: EvaluateResponse = {
      is_correct: isCorrect,
      solution_steps: Array.isArray(parsed.solution_steps) 
        ? parsed.solution_steps 
        : ["Unable to generate solution steps"],
      short_feedback: parsed.short_feedback || "Please review your answer.",
      error_class: errorClass,
      review_error_type: null,
      review_error_message: null,
      coach_notes: coachNotes,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("OpenAI API error:", error);
    
    // Return a graceful error response
    return NextResponse.json(
      { 
        error: "Failed to evaluate answer. Please try again.",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true
      },
      { status: 500 }
    );
  }
}

// Deterministic demo mode response for misconception errors
function getDemoResponse(questionPrompt: string, studentExplanation?: string, thinkingLog?: ThinkingLogEntry[]): EvaluateResponse {
  const questionLower = questionPrompt.toLowerCase();
  
  // Generate coach notes for demo mode
  const coachNotes = generateCoachNotes(
    studentExplanation,
    false,
    "misconception_error",
    null,
    questionPrompt,
    thinkingLog
  );
  
  const baseResponse = {
    is_correct: false,
    error_class: "misconception_error" as ErrorClass,
    review_error_type: null,
    review_error_message: null,
    coach_notes: coachNotes,
  };

  if (questionLower.includes("fraction") || questionLower.includes("/")) {
    return {
      ...baseResponse,
      solution_steps: [
        "Step 1: Identify the fractions in the problem.",
        "Step 2: Find a common denominator if needed.",
        "Step 3: Perform the operation on the numerators.",
        "Step 4: Simplify the result if possible.",
      ],
      short_feedback: "Remember to find a common denominator before adding or subtracting fractions!",
    };
  }
  
  if (questionLower.includes("negative") || questionLower.includes("-")) {
    return {
      ...baseResponse,
      solution_steps: [
        "Step 1: Identify all negative numbers in the problem.",
        "Step 2: Apply the rules for operations with negatives.",
        "Step 3: Remember: negative × negative = positive.",
      ],
      short_feedback: "Watch your signs! Operations with negatives follow specific rules.",
    };
  }
  
  if (questionLower.includes("solve") || questionLower.includes("x")) {
    return {
      ...baseResponse,
      solution_steps: [
        "Step 1: Identify what operation is being done to x.",
        "Step 2: Use the inverse operation on both sides.",
        "Step 3: Isolate x by performing the same operation on both sides.",
      ],
      short_feedback: "Remember: whatever you do to one side, do to the other!",
    };
  }

  // Generic fallback
  return {
    ...baseResponse,
    solution_steps: [
      "Step 1: Read the problem carefully.",
      "Step 2: Identify the operation needed.",
      "Step 3: Apply the correct mathematical rules.",
    ],
    short_feedback: "Not quite right, but keep practicing! Review the steps above.",
  };
}
