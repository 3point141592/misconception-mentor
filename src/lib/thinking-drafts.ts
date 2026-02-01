/**
 * Thinking Drafts - localStorage-based autosave for student thinking
 * 
 * Ensures no student thinking is lost due to navigation, mic left on, or route changes.
 * Drafts are keyed by userId + questionId + fieldType.
 */

// Types for thinking log entries
export interface ThinkingLogEntry {
  type: "initial_explanation" | "followup_explanation" | "teachback";
  text: string;
  ts: number; // timestamp
}

// Field types that can be autosaved
export type ThinkingFieldType = "initial_explanation" | "followup_explanation" | "teachback";

// LocalStorage key prefix
const DRAFT_KEY_PREFIX = "mm_thinking_draft";

// Generate a unique key for a draft
function getDraftKey(userId: string | null, questionId: string, fieldType: ThinkingFieldType): string {
  const userKey = userId || "guest";
  return `${DRAFT_KEY_PREFIX}_${userKey}_${questionId}_${fieldType}`;
}

// Save a draft to localStorage
export function saveDraft(
  userId: string | null,
  questionId: string,
  fieldType: ThinkingFieldType,
  text: string
): void {
  if (typeof window === "undefined") return;
  
  const key = getDraftKey(userId, questionId, fieldType);
  
  if (!text || text.trim() === "") {
    // Remove empty drafts
    localStorage.removeItem(key);
    return;
  }
  
  const draft = {
    text: text.trim(),
    ts: Date.now(),
  };
  
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (e) {
    console.warn("[ThinkingDrafts] Failed to save draft:", e);
  }
}

// Load a draft from localStorage
export function loadDraft(
  userId: string | null,
  questionId: string,
  fieldType: ThinkingFieldType
): { text: string; ts: number } | null {
  if (typeof window === "undefined") return null;
  
  const key = getDraftKey(userId, questionId, fieldType);
  
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("[ThinkingDrafts] Failed to load draft:", e);
  }
  
  return null;
}

// Clear a specific draft
export function clearDraft(
  userId: string | null,
  questionId: string,
  fieldType: ThinkingFieldType
): void {
  if (typeof window === "undefined") return;
  
  const key = getDraftKey(userId, questionId, fieldType);
  localStorage.removeItem(key);
}

// Clear all drafts for a question (after successful save)
export function clearAllDraftsForQuestion(userId: string | null, questionId: string): void {
  if (typeof window === "undefined") return;
  
  const fieldTypes: ThinkingFieldType[] = ["initial_explanation", "followup_explanation", "teachback"];
  
  fieldTypes.forEach((fieldType) => {
    clearDraft(userId, questionId, fieldType);
  });
}

// Get the thinking log from current drafts (for saving in metadata)
export function getThinkingLog(
  userId: string | null,
  questionId: string,
  currentValues: {
    initialExplanation?: string;
    followupExplanation?: string;
    teachback?: string;
  }
): ThinkingLogEntry[] {
  const log: ThinkingLogEntry[] = [];
  const now = Date.now();
  
  // Use current values if provided (more up-to-date than drafts)
  // Fall back to drafts if current values are empty
  
  // Initial explanation
  const initialText = currentValues.initialExplanation?.trim();
  if (initialText) {
    const draft = loadDraft(userId, questionId, "initial_explanation");
    log.push({
      type: "initial_explanation",
      text: initialText,
      ts: draft?.ts || now,
    });
  }
  
  // Follow-up explanation
  const followupText = currentValues.followupExplanation?.trim();
  if (followupText) {
    const draft = loadDraft(userId, questionId, "followup_explanation");
    log.push({
      type: "followup_explanation",
      text: followupText,
      ts: draft?.ts || now,
    });
  }
  
  // Teach-back response
  const teachbackText = currentValues.teachback?.trim();
  if (teachbackText) {
    const draft = loadDraft(userId, questionId, "teachback");
    log.push({
      type: "teachback",
      text: teachbackText,
      ts: draft?.ts || now,
    });
  }
  
  return log;
}

// Combine thinking log into a single string for coach notes
export function combineThinkingForCoachNotes(log: ThinkingLogEntry[]): string {
  if (!log || log.length === 0) return "";
  
  const parts: string[] = [];
  
  for (const entry of log) {
    if (!entry.text) continue;
    
    switch (entry.type) {
      case "initial_explanation":
        parts.push(`Initial thinking: ${entry.text}`);
        break;
      case "followup_explanation":
        parts.push(`Follow-up thinking: ${entry.text}`);
        break;
      case "teachback":
        parts.push(`Teach-back response: ${entry.text}`);
        break;
    }
  }
  
  return parts.join("\n\n");
}

// Create a debounced save function
export function createDebouncedSave(delayMs: number = 600): {
  save: (
    userId: string | null,
    questionId: string,
    fieldType: ThinkingFieldType,
    text: string,
    onSaved?: () => void
  ) => void;
  flush: () => void;
  cancel: () => void;
} {
  let timeoutId: NodeJS.Timeout | null = null;
  let pendingArgs: {
    userId: string | null;
    questionId: string;
    fieldType: ThinkingFieldType;
    text: string;
    onSaved?: () => void;
  } | null = null;
  
  const executeSave = () => {
    if (pendingArgs) {
      saveDraft(
        pendingArgs.userId,
        pendingArgs.questionId,
        pendingArgs.fieldType,
        pendingArgs.text
      );
      if (pendingArgs.onSaved) {
        pendingArgs.onSaved();
      }
      pendingArgs = null;
    }
  };
  
  return {
    save: (userId, questionId, fieldType, text, onSaved) => {
      pendingArgs = { userId, questionId, fieldType, text, onSaved };
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        executeSave();
        timeoutId = null;
      }, delayMs);
    },
    
    flush: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      executeSave();
    },
    
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      pendingArgs = null;
    },
  };
}

// Debug: Get all drafts for a user
export function getAllDrafts(userId: string | null): Record<string, { text: string; ts: number }> {
  if (typeof window === "undefined") return {};
  
  const result: Record<string, { text: string; ts: number }> = {};
  const userKey = userId || "guest";
  const prefix = `${DRAFT_KEY_PREFIX}_${userKey}_`;
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const value = localStorage.getItem(key);
        if (value) {
          result[key] = JSON.parse(value);
        }
      }
    }
  } catch (e) {
    console.warn("[ThinkingDrafts] Failed to get all drafts:", e);
  }
  
  return result;
}

// Debug: Get the most recent draft
export function getMostRecentDraft(userId: string | null): {
  key: string;
  text: string;
  ts: number;
  fieldType: ThinkingFieldType;
  questionId: string;
} | null {
  const drafts = getAllDrafts(userId);
  const entries = Object.entries(drafts);
  
  if (entries.length === 0) return null;
  
  // Sort by timestamp descending
  entries.sort((a, b) => b[1].ts - a[1].ts);
  
  const [key, value] = entries[0];
  
  // Parse key to extract fieldType and questionId
  // Key format: mm_thinking_draft_userId_questionId_fieldType
  const parts = key.split("_");
  const fieldType = parts[parts.length - 1] as ThinkingFieldType;
  const questionId = parts[parts.length - 2];
  
  return {
    key,
    text: value.text,
    ts: value.ts,
    fieldType,
    questionId,
  };
}
