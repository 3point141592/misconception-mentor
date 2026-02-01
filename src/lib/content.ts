import questionsData from "../../content/questions.json";
import misconceptionsData from "../../content/misconceptions.json";
import lessonsData from "../../content/lessons.json";
import notesData from "../../content/notes.json";

export interface Question {
  id: string;
  topic: string;
  difficulty: number; // 1-10, where 1 is easiest and 10 is "big boss"
  prompt: string;
  answer_format: string;
  correct_answer: string;
  candidate_misconception_ids: string[];
  skill_tag: string; // Subskill tag for coverage-based mastery
}

// ============================================
// Skill Tags for Mastery Tracking
// ============================================

// Required skill tags per topic for full mastery
export const REQUIRED_SKILLS_BY_TOPIC: Record<string, string[]> = {
  fractions: ["frac_same_denom", "frac_unlike_denom", "frac_equivalence"],
  negatives: ["neg_add", "neg_sub", "neg_mul"],
  "linear-equations": ["lin_one_step", "lin_two_step"],
  "mixed-review": ["frac_same_denom", "frac_unlike_denom", "neg_add", "neg_sub", "lin_one_step"], // Subset for mixed
};

// Human-readable skill names
export const SKILL_TAG_NAMES: Record<string, string> = {
  frac_same_denom: "Same denominators",
  frac_unlike_denom: "Unlike denominators",
  frac_equivalence: "Equivalence & simplifying",
  neg_add: "Adding negatives",
  neg_sub: "Subtracting negatives",
  neg_mul: "Multiplying negatives",
  lin_one_step: "One-step equations",
  lin_two_step: "Two-step equations",
  mixed: "Mixed review",
};

// Minimum attempts required per skill for full coverage (easy to adjust)
export const REQUIRED_ATTEMPTS_PER_SKILL = 3;

// Human-readable review error names
export const REVIEW_ERROR_NAMES: Record<string, string> = {
  extra_digit: "Extra digit",
  missing_digit: "Missing digit",
  extra_zero: "Extra zero",
  sign_slip: "Sign slip",
  decimal_slip: "Decimal slip",
  transposed_digits: "Transposed digits",
  arithmetic_slip: "Arithmetic slip",
};

export interface Resource {
  title: string;
  url: string;
  type: "video" | "article" | "practice";
}

export interface Misconception {
  id: string;
  topic: string;
  category?: "misconception" | "review_error";
  name: string;
  description: string;
  evidence_patterns: string[];
  remediation_template: string;
  resources?: Resource[];
}

export type TopicId = "fractions" | "negatives" | "linear-equations" | "mixed-review";

export function getQuestionsByTopic(topicId: string): Question[] {
  const questions = questionsData[topicId as keyof typeof questionsData];
  return questions || [];
}

export function getQuestionById(topicId: string, questionId: string): Question | null {
  const questions = getQuestionsByTopic(topicId);
  return questions.find((q) => q.id === questionId) || null;
}

export function getMisconceptionById(misconceptionId: string): Misconception | null {
  return (
    misconceptionsData.misconceptions.find((m) => m.id === misconceptionId) || null
  );
}

export function getMisconceptionsByIds(ids: string[]): Misconception[] {
  return ids
    .map((id) => getMisconceptionById(id))
    .filter((m): m is Misconception => m !== null);
}

export function getAllMisconceptions(): Misconception[] {
  return misconceptionsData.misconceptions;
}

export function getTopicName(topicId: string): string {
  const names: Record<string, string> = {
    fractions: "Fractions",
    negatives: "Negative Numbers",
    "linear-equations": "Linear Equations",
    "mixed-review": "Mixed Review",
  };
  return names[topicId] || topicId;
}

// Get all misconception IDs for a topic (excluding review errors)
export function getMisconceptionIdsByTopic(topicId: string): string[] {
  return misconceptionsData.misconceptions
    .filter((m) => m.topic === topicId && m.category !== "review_error")
    .map((m) => m.id);
}

// Get resources for a misconception, with topic-level fallback
export function getResourcesForMisconception(misconceptionId: string, topicId: string): Resource[] {
  // First try to get misconception-specific resources
  const misconception = getMisconceptionById(misconceptionId);
  if (misconception?.resources && misconception.resources.length > 0) {
    return misconception.resources.slice(0, 3); // Max 3 resources
  }
  
  // Fall back to topic-level resources
  const topicResources = (misconceptionsData as any).topic_resources?.[topicId];
  if (topicResources && Array.isArray(topicResources)) {
    return topicResources.slice(0, 3);
  }
  
  return [];
}

// Get topic-level resources (for Learn page or general use)
export function getTopicResources(topicId: string): Resource[] {
  const topicResources = (misconceptionsData as any).topic_resources?.[topicId];
  if (topicResources && Array.isArray(topicResources)) {
    return topicResources;
  }
  return [];
}

// Lesson content types
export interface WorkedExample {
  problem: string;
  steps: string[];
  answer: string;
}

export interface Lesson {
  id: string;
  title: string;
  overview: string;
  explanation: string[];
  worked_example: WorkedExample;
  key_takeaways: string[];
  resources: Resource[];
}

// Get lesson content by topic ID
export function getLessonById(topicId: string): Lesson | null {
  const lesson = lessonsData.lessons.find((l) => l.id === topicId);
  return lesson || null;
}

// Get all lessons
export function getAllLessons(): Lesson[] {
  return lessonsData.lessons;
}

// ============================================
// Difficulty-based session ordering
// ============================================

// Seeded random number generator for deterministic shuffling
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Shuffle array in place using seeded random
function seededShuffle<T>(array: T[], random: () => number): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Build a session order for questions:
 * 1. Group questions by difficulty (1-10)
 * 2. Shuffle within each difficulty group
 * 3. Flatten into one ordered list (easy → hard)
 */
export function buildDifficultySessionOrder(questions: Question[], seed: number): string[] {
  const random = seededRandom(seed);
  
  // Group by difficulty
  const groups: Map<number, Question[]> = new Map();
  for (const q of questions) {
    const difficulty = q.difficulty || 5; // Default to middle if missing
    if (!groups.has(difficulty)) {
      groups.set(difficulty, []);
    }
    groups.get(difficulty)!.push(q);
  }
  
  // Sort difficulty levels and shuffle within each
  const sortedDifficulties = Array.from(groups.keys()).sort((a, b) => a - b);
  const orderedIds: string[] = [];
  
  for (const difficulty of sortedDifficulties) {
    const groupQuestions = groups.get(difficulty)!;
    const shuffled = seededShuffle(groupQuestions, random);
    orderedIds.push(...shuffled.map(q => q.id));
  }
  
  return orderedIds;
}

// Difficulty rank titles
export const DIFFICULTY_RANKS: Record<number, string> = {
  1: "Rookie",
  2: "Beginner",
  3: "Apprentice",
  4: "Student",
  5: "Learner",
  6: "Practitioner",
  7: "Expert",
  8: "Master",
  9: "Champion",
  10: "Big Boss",
};

export function getDifficultyRank(difficulty: number): string {
  return DIFFICULTY_RANKS[Math.min(10, Math.max(1, difficulty))] || "Learner";
}

// ============================================
// Notes-driven lesson content (from notes.json)
// ============================================

// Block types for notes content
export interface CalloutBlock {
  type: "callout";
  tone: "rule" | "tip" | "warn" | "fun";
  title: string;
  lines: string[];
}

export interface BulletsBlock {
  type: "bullets";
  title: string;
  items: string[];
}

export interface ExampleBlock {
  type: "example";
  prompt: string;
  steps: string[];
  answer: string;
}

export interface MiniQuizBlock {
  type: "mini_quiz";
  question: string;
  answer: string;
  explain: string;
}

export interface ImageBlock {
  type: "image";
  src: string;
  alt: string;
  caption?: string;
}

export interface LinkItem {
  label: string;
  url: string;
}

export interface LinksBlock {
  type: "links";
  items: LinkItem[];
}

export type NoteBlock = CalloutBlock | BulletsBlock | ExampleBlock | MiniQuizBlock | ImageBlock | LinksBlock;

export interface NoteSection {
  id: string;
  level: number;
  title: string;
  blocks: NoteBlock[];
}

export interface NoteMascot {
  name: string;
  emoji: string;
  catchphrase: string;
}

export interface NoteTopic {
  topicId: string;
  title: string;
  subtitle: string;
  accent: string;
  mascot: NoteMascot;
  sections: NoteSection[];
}

export interface NotesData {
  version: string;
  topics: NoteTopic[];
}

// Topic ID mapping (notes.json uses underscores, app uses hyphens)
const topicIdMap: Record<string, string> = {
  "linear-equations": "linear_equations",
  "linear_equations": "linear-equations",
};

function normalizeTopicId(topicId: string): string {
  // Convert app's hyphen format to notes.json's underscore format
  if (topicId === "linear-equations") return "linear_equations";
  return topicId;
}

// Get notes topic by ID
export function getNotesByTopicId(topicId: string): NoteTopic | null {
  const normalizedId = normalizeTopicId(topicId);
  const notes = notesData as NotesData;
  return notes.topics.find((t) => t.topicId === normalizedId) || null;
}

// Get all notes topics
export function getAllNotes(): NoteTopic[] {
  const notes = notesData as NotesData;
  return notes.topics;
}
