import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import misconceptionsData from "../../../../content/misconceptions.json";
import { type LanguageCode, getAILanguageInstruction } from "@/i18n";

// Helper to parse a fraction string into numerator and denominator
function parseFraction(s: string): { num: number; den: number } | null {
  const trimmed = s.trim();
  const match = trimmed.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const den = parseInt(match[2], 10);
  if (isNaN(num) || isNaN(den) || den === 0) return null;
  return { num, den };
}

// Check if student answer is a swapped (reciprocal) fraction
function detectFractionSwap(studentAnswer: string, correctAnswer: string): boolean {
  const studentFrac = parseFraction(studentAnswer);
  const correctFrac = parseFraction(correctAnswer);
  
  if (!studentFrac || !correctFrac) return false;
  
  // Check if student's numerator = correct's denominator AND student's denominator = correct's numerator
  return studentFrac.num === correctFrac.den && studentFrac.den === correctFrac.num;
}

// Prioritize FRAC-SWAP misconception if fraction swap is detected
function prioritizeFractionSwap(
  response: DiagnoseResponse,
  studentExplanation: string | undefined,
  correctAnswer: string,
  studentAnswer: string
): DiagnoseResponse {
  // Check if FRAC-SWAP is already in top_3
  const fracSwapIndex = response.top_3.findIndex(m => m.id === "FRAC-SWAP");
  
  if (fracSwapIndex === 0) {
    // Already top, just boost confidence
    response.top_3[0].confidence = Math.max(response.top_3[0].confidence, 0.95);
    return response;
  }
  
  if (fracSwapIndex > 0) {
    // Move FRAC-SWAP to top and boost confidence
    const fracSwap = response.top_3.splice(fracSwapIndex, 1)[0];
    fracSwap.confidence = 0.95;
    response.top_3.unshift(fracSwap);
    response.top_3 = response.top_3.slice(0, 3); // Keep only top 3
    return response;
  }
  
  // FRAC-SWAP not in list, need to create and insert it
  const fracSwapMisconception = misconceptionsData.misconceptions.find(m => m.id === "FRAC-SWAP");
  if (!fracSwapMisconception) {
    console.warn("[diagnose] FRAC-SWAP misconception not found in data");
    return response;
  }
  
  const newFracSwap = {
    id: "FRAC-SWAP",
    name: fracSwapMisconception.name,
    confidence: 0.95,
    evidence: studentExplanation 
      ? `Student answered ${studentAnswer} when correct was ${correctAnswer} (reciprocal). "${studentExplanation.slice(0, 50)}..."`
      : `Student answered ${studentAnswer} when correct was ${correctAnswer} (reciprocal fraction).`,
    diagnosis: "The student swapped the numerator and denominator, writing the fraction upside down.",
    remediation: fracSwapMisconception.remediation_template,
  };
  
  // Insert at top, remove last item
  response.top_3.unshift(newFracSwap);
  response.top_3 = response.top_3.slice(0, 3);
  
  return response;
}

// Zod schema for strict JSON validation
const DiagnosedMisconceptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  diagnosis: z.string(),
  remediation: z.string(),
});

const NextPracticeQuestionSchema = z.object({
  prompt: z.string(),
  correct_answer: z.string(),
  why_this_targets: z.string(),
});

const DiagnoseResponseSchema = z.object({
  top_3: z.array(DiagnosedMisconceptionSchema).length(3),
  next_practice_question: NextPracticeQuestionSchema,
  teach_back_prompt: z.string(),
  key_takeaway: z.string().max(100), // <= 12 words, student-friendly
});

export type DiagnoseResponse = z.infer<typeof DiagnoseResponseSchema>;

// Request body type
interface DiagnoseRequest {
  question_prompt: string;
  correct_answer: string;
  student_answer: string;
  student_explanation?: string;
  topic: string;
  candidate_misconception_ids: string[];
  language?: LanguageCode; // Language for AI output
}

// Get misconception details by IDs
function getMisconceptionsByIds(ids: string[]) {
  return ids
    .map((id) => misconceptionsData.misconceptions.find((m) => m.id === id))
    .filter((m): m is (typeof misconceptionsData.misconceptions)[number] => m !== null);
}

// Build the system prompt with language instruction
function buildSystemPrompt(language: LanguageCode, candidateIds: string[]): string {
  const languageInstruction = getAILanguageInstruction(language);
  
  // Create explicit ID list to prevent translation
  const idList = candidateIds.join(", ");
  
  return `You are a math education expert diagnosing student misconceptions. Your task is to:
1. Analyze the student's incorrect answer and explanation
2. Rank the candidate misconceptions by likelihood (confidence 0-1)
3. Provide evidence from the student's explanation
4. Generate targeted remediation and a follow-up question
5. Create a memorable key takeaway (the ONE thing to remember)

${languageInstruction}

CRITICAL JSON STRUCTURE RULES (NEVER VIOLATE):
- You MUST respond with valid JSON only
- All JSON keys MUST be in English exactly as shown: "top_3", "id", "name", "confidence", "evidence", "diagnosis", "remediation", "next_practice_question", "prompt", "correct_answer", "why_this_targets", "teach_back_prompt", "key_takeaway"
- The "id" field values MUST be one of these exact IDs (DO NOT translate): ${idList}
- DO NOT translate the JSON keys or the misconception IDs
- ONLY translate the STRING VALUES for: name, evidence, diagnosis, remediation, prompt, why_this_targets, teach_back_prompt, key_takeaway

Required JSON schema:
{
  "top_3": [
    {
      "id": "EXACT_MISCONCEPTION_ID_FROM_LIST",
      "name": "Misconception Name (translate this)",
      "confidence": 0.85,
      "evidence": "quote from student (translate this)",
      "diagnosis": "explanation (translate this)",
      "remediation": "micro-lesson max 120 words (translate this)"
    }
  ],
  "next_practice_question": {
    "prompt": "math problem (translate this)",
    "correct_answer": "answer (keep numbers/fractions as-is)",
    "why_this_targets": "explanation (translate this)"
  },
  "teach_back_prompt": "question for student (translate this)",
  "key_takeaway": "max 12 words (translate this)"
}

RULES:
- top_3 MUST have exactly 3 items, even if confidence is low
- confidence values must be numbers between 0 and 1
- evidence MUST quote student explanation if available; otherwise say equivalent of "none provided"
- remediation must be <= 120 words
- Use ONLY these misconception IDs: ${idList}
- key_takeaway MUST be max 12 words, simple language`;
}

export async function POST(request: NextRequest) {
  // Parse request body first
  let body: DiagnoseRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  // Validate required fields
  const { question_prompt, correct_answer, student_answer, student_explanation, topic, candidate_misconception_ids } = body;
  if (!question_prompt || !correct_answer || !student_answer || !topic || !candidate_misconception_ids?.length) {
    return NextResponse.json(
      { error: "Missing required fields: question_prompt, correct_answer, student_answer, topic, candidate_misconception_ids" },
      { status: 400 }
    );
  }

  const language = body.language || "en";
  console.log(`[diagnose] Starting diagnosis, language=${language}, topic=${topic}`);

  // Ensure FRAC-SWAP is in candidate list for fraction questions
  let extendedCandidateIds = [...candidate_misconception_ids];
  if (topic === "fractions" && !extendedCandidateIds.includes("FRAC-SWAP")) {
    extendedCandidateIds.push("FRAC-SWAP");
  }

  // Load candidate misconceptions from content
  const candidateMisconceptions = getMisconceptionsByIds(extendedCandidateIds);
  if (candidateMisconceptions.length === 0) {
    return NextResponse.json(
      { error: "No valid misconceptions found for the given IDs" },
      { status: 400 }
    );
  }

  // Check for demo mode FIRST (before checking API key)
  if (process.env.DEMO_MODE === "true") {
    console.log(`[diagnose] Demo mode, returning mock response`);
    return NextResponse.json({
      ...getDemoResponse(candidateMisconceptions, student_explanation, topic, language),
      _meta: { status: "demo", language }
    });
  }

  // Validate API key (only needed if not in demo mode)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Please add it to .env.local or enable DEMO_MODE=true" },
      { status: 500 }
    );
  }

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey });

  const candidateList = candidateMisconceptions.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    evidence_patterns: m.evidence_patterns,
  }));

  const userPrompt = `Question: ${question_prompt}
Correct answer: ${correct_answer}
Student's answer: ${student_answer}
Student's explanation: ${student_explanation || "(none provided)"}
Topic: ${topic}

Candidate misconceptions (use ONLY these IDs):
${JSON.stringify(candidateList, null, 2)}

Diagnose the most likely misconceptions. Respond with valid JSON only.`;

  // Check for fraction swap heuristic BEFORE AI call
  const isFractionSwap = detectFractionSwap(student_answer, correct_answer);
  if (isFractionSwap) {
    console.log(`[diagnose] Detected fraction swap: student=${student_answer}, correct=${correct_answer}`);
  }

  // Try with requested language first
  let result = await attemptDiagnosis(
    openai, 
    buildSystemPrompt(language, extendedCandidateIds), 
    userPrompt, 
    language,
    extendedCandidateIds
  );

  if (result.success && result.data) {
    // Apply fraction swap heuristic: ensure FRAC-SWAP is top if detected
    if (isFractionSwap && extendedCandidateIds.includes("FRAC-SWAP")) {
      result.data = prioritizeFractionSwap(result.data, student_explanation, correct_answer, student_answer);
    }
    
    console.log(`[diagnose] Success with language=${language}`);
    return NextResponse.json({
      ...result.data,
      _meta: { status: "ok", language, retried: false, fractionSwapDetected: isFractionSwap }
    });
  }

  // If non-English failed, retry with English
  if (language !== "en") {
    console.log(`[diagnose] ${language} failed, retrying with English`);
    result = await attemptDiagnosis(
      openai,
      buildSystemPrompt("en", extendedCandidateIds),
      userPrompt,
      "en",
      extendedCandidateIds
    );

    if (result.success && result.data) {
      // Apply fraction swap heuristic: ensure FRAC-SWAP is top if detected
      if (isFractionSwap && extendedCandidateIds.includes("FRAC-SWAP")) {
        result.data = prioritizeFractionSwap(result.data, student_explanation, correct_answer, student_answer);
      }
      
      console.log(`[diagnose] Success with English fallback`);
      return NextResponse.json({
        ...result.data,
        _meta: { status: "ok", language: "en", retried: true, originalLanguage: language, fractionSwapDetected: isFractionSwap }
      });
    }
  }

  // Both attempts failed - return safe fallback
  console.log(`[diagnose] All attempts failed, using safe fallback`);
  return NextResponse.json({
    ...getSafeFallbackResponse(candidateMisconceptions, student_explanation, topic),
    _meta: { status: "fallback", language, error: result.error }
  });
}

interface DiagnosisAttemptResult {
  success: boolean;
  data?: DiagnoseResponse;
  error?: string;
}

async function attemptDiagnosis(
  openai: OpenAI,
  systemPrompt: string,
  userPrompt: string,
  language: LanguageCode,
  validIds: string[]
): Promise<DiagnosisAttemptResult> {
  try {
    let responseJson = await callOpenAI(openai, systemPrompt, userPrompt);
    
    // Post-process: ensure IDs are from valid list
    responseJson = fixMisconceptionIds(responseJson, validIds);
    
    // Validate with Zod
    const parseResult = DiagnoseResponseSchema.safeParse(responseJson);
    
    if (!parseResult.success) {
      console.log(`[diagnose] Validation failed for ${language}:`, parseResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`));
      
      // Log truncated response for debugging
      const responseStr = JSON.stringify(responseJson);
      console.log(`[diagnose] Raw response (truncated): ${responseStr.slice(0, 500)}${responseStr.length > 500 ? "..." : ""}`);
      
      // Retry with fix prompt
      responseJson = await retryWithFixPrompt(openai, systemPrompt, userPrompt, responseJson, parseResult.error.issues, validIds);
      responseJson = fixMisconceptionIds(responseJson, validIds);
      
      const retryResult = DiagnoseResponseSchema.safeParse(responseJson);
      if (!retryResult.success) {
        console.log(`[diagnose] Retry validation also failed for ${language}:`, retryResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`));
        return { 
          success: false, 
          error: `Validation failed: ${retryResult.error.issues.map(i => i.message).join(", ")}` 
        };
      }
      
      return { success: true, data: retryResult.data };
    }

    return { success: true, data: parseResult.data };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[diagnose] OpenAI API error for ${language}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

// Fix misconception IDs to ensure they're from the valid list
function fixMisconceptionIds(response: unknown, validIds: string[]): unknown {
  if (!response || typeof response !== "object") return response;
  
  const obj = response as Record<string, unknown>;
  if (!Array.isArray(obj.top_3)) return response;
  
  // Map any invalid IDs to valid ones
  obj.top_3 = obj.top_3.map((item: unknown, index: number) => {
    if (!item || typeof item !== "object") return item;
    const misconception = item as Record<string, unknown>;
    
    // If ID is not in valid list, use a valid one
    if (typeof misconception.id !== "string" || !validIds.includes(misconception.id)) {
      misconception.id = validIds[index % validIds.length];
    }
    
    return misconception;
  });
  
  return obj;
}

async function callOpenAI(openai: OpenAI, systemPrompt: string, userPrompt: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3, // Lower temperature for more consistent JSON
    max_tokens: 1200,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error("[diagnose] JSON parse error:", content.slice(0, 200));
    throw new Error("Invalid JSON from OpenAI");
  }
}

async function retryWithFixPrompt(
  openai: OpenAI, 
  systemPrompt: string, 
  userPrompt: string, 
  invalidJson: unknown,
  issues: z.ZodIssue[],
  validIds: string[]
) {
  const fixPrompt = `Your previous response had validation errors:
${issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}

IMPORTANT: 
- All JSON keys MUST be in English: "top_3", "id", "name", "confidence", etc.
- The "id" field MUST be one of: ${validIds.join(", ")}
- DO NOT translate JSON keys or misconception IDs

Previous response (with errors):
${JSON.stringify(invalidJson, null, 2).slice(0, 800)}

Fix the JSON to match the required schema exactly. Respond with corrected JSON only.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
      { role: "assistant", content: JSON.stringify(invalidJson).slice(0, 1000) },
      { role: "user", content: fixPrompt },
    ],
    temperature: 0.1, // Very low for strict correction
    max_tokens: 1200,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI on retry");
  }

  return JSON.parse(content);
}

// Safe fallback response when all AI attempts fail
function getSafeFallbackResponse(
  misconceptions: typeof misconceptionsData.misconceptions,
  studentExplanation?: string,
  topic?: string
): DiagnoseResponse {
  const top3 = misconceptions.slice(0, 3).map((m, i) => ({
    id: m.id,
    name: m.name,
    confidence: i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2, // Lower confidence for fallback
    evidence: studentExplanation 
      ? `"${studentExplanation.slice(0, 50)}..."` 
      : "none provided",
    diagnosis: m.description,
    remediation: m.remediation_template || "Review the concept and try similar problems.",
  }));

  // Pad to exactly 3 if needed
  while (top3.length < 3) {
    top3.push({
      id: misconceptions[0]?.id || "GENERAL",
      name: "General calculation error",
      confidence: 0.1,
      evidence: "none provided",
      diagnosis: "A general error occurred.",
      remediation: "Double-check your work step by step.",
    });
  }

  const followUpQuestions: Record<string, { prompt: string; correct_answer: string; why_this_targets: string }> = {
    fractions: {
      prompt: "Calculate: 2/5 + 1/10",
      correct_answer: "1/2",
      why_this_targets: "This problem requires finding a common denominator.",
    },
    negatives: {
      prompt: "Calculate: -7 + 4",
      correct_answer: "-3",
      why_this_targets: "This reinforces adding with negative numbers.",
    },
    "linear-equations": {
      prompt: "Solve for x: 3x - 6 = 9",
      correct_answer: "5",
      why_this_targets: "This reinforces two-step equation solving.",
    },
  };

  return {
    top_3: top3,
    next_practice_question: followUpQuestions[topic || "fractions"] || followUpQuestions.fractions,
    teach_back_prompt: "Can you explain this concept in your own words?",
    key_takeaway: "Take it step by step and check your work!",
  };
}

// Deterministic demo mode response based on candidate misconceptions and topic
function getDemoResponse(
  misconceptions: typeof misconceptionsData.misconceptions,
  studentExplanation?: string,
  topic?: string,
  language?: LanguageCode
): DiagnoseResponse {
  // Use first 3 misconceptions, with deterministic confidence scores
  const top3 = misconceptions.slice(0, 3).map((m, i) => ({
    id: m.id,
    name: m.name,
    confidence: i === 0 ? 0.75 : i === 1 ? 0.18 : 0.07,
    evidence: studentExplanation 
      ? `"${studentExplanation.slice(0, 60)}${studentExplanation.length > 60 ? "..." : ""}"` 
      : "none provided",
    diagnosis: m.description,
    remediation: m.remediation_template,
  }));

  // Pad to exactly 3 if needed
  while (top3.length < 3) {
    top3.push({
      id: "GENERAL",
      name: "General calculation error",
      confidence: 0.05,
      evidence: "none provided",
      diagnosis: "A general error occurred in the calculation.",
      remediation: "Double-check your work step by step. Make sure you understand each operation before moving forward.",
    });
  }

  // Deterministic follow-up question based on topic
  const followUpQuestions: Record<string, { prompt: string; correct_answer: string; why_this_targets: string }> = {
    fractions: {
      prompt: "Calculate: 2/5 + 1/10",
      correct_answer: "1/2",
      why_this_targets: "This problem requires finding a common denominator, reinforcing the same skill.",
    },
    negatives: {
      prompt: "Calculate: -7 + 4",
      correct_answer: "-3",
      why_this_targets: "This reinforces understanding of adding with negative numbers on a number line.",
    },
    "linear-equations": {
      prompt: "Solve for x: 3x - 6 = 9",
      correct_answer: "5",
      why_this_targets: "This two-step equation reinforces the order of operations when solving.",
    },
  };

  const followUp = followUpQuestions[topic || "fractions"] || followUpQuestions.fractions;

  const teachBackPrompts: Record<string, string> = {
    fractions: "Can you explain in your own words why we need a common denominator when adding fractions?",
    negatives: "Can you explain how the number line helps when adding negative numbers?",
    "linear-equations": "Can you explain why we do the same operation to both sides of an equation?",
  };

  const keyTakeaways: Record<string, string> = {
    fractions: "Same denominators first, then add the tops!",
    negatives: "Use the number line to see where you land.",
    "linear-equations": "What you do to one side, do to the other.",
  };

  return {
    top_3: top3,
    next_practice_question: followUp,
    teach_back_prompt: teachBackPrompts[topic || "fractions"] || teachBackPrompts.fractions,
    key_takeaway: keyTakeaways[topic || "fractions"] || keyTakeaways.fractions,
  };
}
