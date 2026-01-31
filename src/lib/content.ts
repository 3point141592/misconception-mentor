import questionsData from "../../content/questions.json";
import misconceptionsData from "../../content/misconceptions.json";

export interface Question {
  id: string;
  topic: string;
  prompt: string;
  answer_format: string;
  correct_answer: string;
  candidate_misconception_ids: string[];
}

export interface Misconception {
  id: string;
  topic: string;
  name: string;
  description: string;
  evidence_patterns: string[];
  remediation_template: string;
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
