// Types used across the app

// Error classification: correct, review_error (quick slip), or misconception_error
export type ErrorClass = "correct" | "review_error" | "misconception_error";

// Maps to REVIEW:* IDs in misconceptions.json
export type ReviewErrorType = 
  | "extra_digit" 
  | "missing_digit" 
  | "extra_zero"
  | "sign_slip" 
  | "decimal_slip"
  | "transposed_digits"
  | "arithmetic_slip"
  | "format_typo"; // Malformed answer format (e.g., "5/", "/5", "3//4")

// Coach notes generated from student explanation
export interface CoachNotes {
  title: string;                   // e.g., "Coach Notes (from your thinking)"
  what_went_well: string[];        // 1–2 bullets (can be empty)
  what_to_fix: string[];           // 1–2 bullets (can be empty)
  remember: string;                // 1 short highlighted line (<= 12 words)
  next_step: string;               // 1 actionable next step
}

// Focus Mode timing metadata
export interface FocusMeta {
  enabled: true;                   // Marker that Focus Mode was on
  time_ms: number;                 // Time taken in milliseconds
  pauses: number;                  // Number of times timer was paused (tab switches)
  nudges: number;                  // Number of hints/nudges used (future feature)
}

export interface EvaluationResult {
  is_correct: boolean;
  solution_steps: string[];
  short_feedback: string;
  // Error classification
  error_class: ErrorClass;
  review_error_type: ReviewErrorType | null;
  review_error_message: string | null; // Must NOT reveal correct answer
  // Coach notes derived from student explanation
  coach_notes: CoachNotes;
}

export interface DiagnosedMisconception {
  id: string;
  name: string;
  confidence: number;
  evidence: string;
  diagnosis: string;
  remediation: string;
}

export interface DiagnosisResult {
  top_3: DiagnosedMisconception[];
  next_practice_question: {
    prompt: string;
    correct_answer: string;
    why_this_targets: string;
  };
  teach_back_prompt: string;
  key_takeaway: string; // <= 12 words, student-friendly, the ONE thing to remember
}

export interface PracticeAttempt {
  questionId: string;
  topic: string;
  studentAnswer: string;
  studentExplanation: string;
  isCorrect: boolean;
  evaluation?: EvaluationResult;
  diagnosis?: DiagnosisResult;
  timestamp: Date;
}

// Practice session state
export interface PracticeSession {
  topicId: string;
  currentQuestionIndex: number;
  attempts: PracticeAttempt[];
}
