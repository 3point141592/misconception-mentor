// Database types for Supabase tables
// Based on architecture.md data model

export interface Profile {
  user_id: string;
  display_name: string | null;
  grade_band: string;
  created_at: string;
}

export interface Attempt {
  id: string;
  user_id: string;
  question_id: string;
  topic: string;
  answer_text: string;
  explanation_text: string | null;
  is_correct: boolean;
  top_misconceptions: DiagnosedMisconceptionRecord[] | null;
  created_at: string;
}

export interface DiagnosedMisconceptionRecord {
  id: string;
  name: string;
  confidence: number;
  evidence: string;
  diagnosis: string;
  remediation: string;
}

export interface Mastery {
  user_id: string;
  topic: string;
  accuracy: number;
  last_practiced_at: string;
}

export interface MisconceptionStat {
  user_id: string;
  misconception_id: string;
  count: number;
  last_seen_at: string;
}

// Insert types (without auto-generated fields)
export interface AttemptInsert {
  user_id: string;
  question_id: string;
  topic: string;
  answer_text: string;
  explanation_text?: string | null;
  is_correct: boolean;
  top_misconceptions?: DiagnosedMisconceptionRecord[] | null;
}

export interface ProfileInsert {
  user_id: string;
  display_name?: string | null;
  grade_band?: string;
}
