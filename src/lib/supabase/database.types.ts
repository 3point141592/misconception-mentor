// Database types for Supabase tables
// Based on architecture.md data model
// 
// IMPORTANT: The actual database columns are:
// attempts: id, user_id, question_id, topic, answer_text, explanation_text, is_correct, top_misconceptions (JSONB), created_at
// 
// error_class and review_error_type are stored INSIDE top_misconceptions JSONB as metadata,
// NOT as separate columns (those columns don't exist in the DB).

import type { ErrorClass, ReviewErrorType, CoachNotes, FocusMeta } from "../types";
import type { ThinkingLogEntry } from "../thinking-drafts";

export interface Profile {
  user_id: string;
  display_name: string | null;
  grade_band: string;
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

// Metadata stored inside top_misconceptions JSONB
export interface AttemptMetadata {
  _metadata: true; // Marker to identify this as metadata
  error_class: ErrorClass;
  review_error_type: ReviewErrorType | null;
  coach_notes?: CoachNotes; // Coach notes derived from student explanation
  focus?: FocusMeta; // Focus Mode timing data (only present if Focus Mode was ON)
  skill_tag?: string; // Subskill tag for coverage-based mastery tracking
  thinking_log?: ThinkingLogEntry[]; // Full thinking trail (initial + followup + teachback)
}

// The full JSONB payload stored in top_misconceptions
export type TopMisconceptionsPayload = (DiagnosedMisconceptionRecord | AttemptMetadata)[] | null;

export interface Attempt {
  id: string;
  user_id: string;
  question_id: string;
  topic: string;
  answer_text: string;
  explanation_text: string | null;
  is_correct: boolean;
  // top_misconceptions is a JSONB column that contains:
  // - Array of DiagnosedMisconceptionRecord objects (from diagnosis)
  // - Optionally an AttemptMetadata object with error_class and review_error_type
  top_misconceptions: TopMisconceptionsPayload;
  created_at: string;
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
// ONLY includes columns that actually exist in the database
export interface AttemptInsert {
  user_id: string;
  question_id: string;
  topic: string;
  answer_text: string;
  explanation_text?: string | null;
  is_correct: boolean;
  top_misconceptions?: TopMisconceptionsPayload;
}

export interface ProfileInsert {
  user_id: string;
  display_name?: string | null;
  grade_band?: string;
}

// Helper to extract metadata from top_misconceptions
export function extractAttemptMetadata(payload: TopMisconceptionsPayload): AttemptMetadata | null {
  if (!payload || !Array.isArray(payload)) return null;
  const metadata = payload.find((item): item is AttemptMetadata => 
    item && typeof item === 'object' && '_metadata' in item && item._metadata === true
  );
  return metadata || null;
}

// Helper to extract misconceptions (excluding metadata) from top_misconceptions
export function extractMisconceptions(payload: TopMisconceptionsPayload): DiagnosedMisconceptionRecord[] {
  if (!payload || !Array.isArray(payload)) return [];
  return payload.filter((item): item is DiagnosedMisconceptionRecord => 
    item && typeof item === 'object' && !('_metadata' in item)
  );
}
