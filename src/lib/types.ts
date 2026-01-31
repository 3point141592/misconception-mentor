// Types used across the app

export interface EvaluationResult {
  is_correct: boolean;
  solution_steps: string[];
  short_feedback: string;
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
