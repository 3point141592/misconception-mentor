// ============================================
// Lightweight i18n system (no route-based locale)
// ============================================

import en from "./messages/en.json";
import hi_latn from "./messages/hi_latn.json";
import es from "./messages/es.json";
import fr from "./messages/fr.json";
import zh_hans from "./messages/zh_hans.json";

// Language code type
export type LanguageCode = "en" | "hi_latn" | "es" | "fr" | "zh_hans";

// Language display names
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  hi_latn: "Hinglish",
  es: "Español",
  fr: "Français",
  zh_hans: "中文(简体)",
};

// Language flag emojis
export const LANGUAGE_FLAGS: Record<LanguageCode, string> = {
  en: "🇺🇸",
  hi_latn: "🇮🇳",
  es: "🇪🇸",
  fr: "🇫🇷",
  zh_hans: "🇨🇳",
};

// All available languages
export const AVAILABLE_LANGUAGES: LanguageCode[] = ["en", "hi_latn", "es", "fr", "zh_hans"];

// Default language
export const DEFAULT_LANGUAGE: LanguageCode = "en";

// localStorage key
export const LANGUAGE_STORAGE_KEY = "mm_language";

// Type for messages (nested object)
type MessageValue = string | { [key: string]: MessageValue };
type Messages = { [key: string]: MessageValue };

// All message dictionaries
const messages: Record<LanguageCode, Messages> = {
  en,
  hi_latn,
  es,
  fr,
  zh_hans,
};

/**
 * Get a translation by key path (e.g., "common.learn" or "practice.answer")
 * Falls back to English if key not found in selected language
 */
export function getTranslation(language: LanguageCode, keyPath: string): string {
  const keys = keyPath.split(".");
  
  // Try selected language first
  let value: MessageValue | undefined = messages[language];
  for (const key of keys) {
    if (typeof value === "object" && value !== null && key in value) {
      value = value[key];
    } else {
      value = undefined;
      break;
    }
  }
  
  if (typeof value === "string") {
    return value;
  }
  
  // Fallback to English
  if (language !== "en") {
    let fallback: MessageValue | undefined = messages.en;
    for (const key of keys) {
      if (typeof fallback === "object" && fallback !== null && key in fallback) {
        fallback = fallback[key];
      } else {
        fallback = undefined;
        break;
      }
    }
    
    if (typeof fallback === "string") {
      return fallback;
    }
  }
  
  // Return key as fallback (for debugging)
  console.warn(`[i18n] Missing translation: ${keyPath}`);
  return keyPath;
}

/**
 * Load language from localStorage
 */
export function loadLanguage(): LanguageCode {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && AVAILABLE_LANGUAGES.includes(stored as LanguageCode)) {
      return stored as LanguageCode;
    }
  } catch (e) {
    console.warn("[i18n] Failed to load language:", e);
  }
  
  return DEFAULT_LANGUAGE;
}

/**
 * Save language to localStorage
 */
export function saveLanguage(language: LanguageCode): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (e) {
    console.warn("[i18n] Failed to save language:", e);
  }
}

/**
 * Get AI language instruction for API calls
 */
export function getAILanguageInstruction(language: LanguageCode): string {
  switch (language) {
    case "hi_latn":
      return `IMPORTANT: All user-facing text in your response MUST be written in Roman Hindi (Hinglish) - Hindi written in Latin script.
Use natural Roman Hindi/Hinglish as spoken by students in India.
MINIMIZE English words - only use these unavoidable math terms in English: fraction, numerator, denominator, common denominator, equation, variable, coefficient, positive, negative, add, subtract, multiply, divide.
All other words should be Hindi in Latin script: hai, nahi, karo, dhundho, pehle, phir, sirf, etc.
Example: "Acha try hai, lekin pehle common denominator dhundho. Phir sirf numerators ko add karo."
Example: "Yeh galat hai kyunki aapne denominators ko bhi add kar diya."
Do NOT use Devanagari script (हिंदी). Keep JSON keys in English but values in Roman Hindi.`;
    
    case "es":
      return `IMPORTANT: All user-facing text in your response must be written in Spanish (Español).
Use clear, simple Spanish appropriate for middle school students.
Keep JSON keys in English.`;
    
    case "fr":
      return `IMPORTANT: All user-facing text in your response must be written in French (Français).
Use clear, simple French appropriate for middle school students.
Use "tu" instead of "vous" for a friendly tone.
Keep JSON keys in English.`;
    
    case "zh_hans":
      return `IMPORTANT: All user-facing text in your response must be written in Simplified Chinese (简体中文).
Use clear, simple Chinese appropriate for middle school students.
Keep JSON keys in English.`;
    
    default:
      return "All user-facing text should be in English.";
  }
}

/**
 * Preview translations for a language (for debugging)
 */
export function getTranslationPreview(language: LanguageCode): Record<string, string> {
  const keys = [
    "common.learn",
    "common.practice",
    "common.dashboard",
    "practice.check",
    "practice.nextQuestion",
    "practice.correctAnswer",
    "feedback.keyTakeaway",
    "coachNotes.title",
    "settings.focusMode",
    "dashboard.yourProgress",
  ];
  
  const preview: Record<string, string> = {};
  for (const key of keys) {
    preview[key] = getTranslation(language, key);
  }
  return preview;
}

/**
 * Get lesson translation for a specific topic
 * Returns the lesson content in the specified language
 */
export interface LessonTranslation {
  title: string;
  description: string;
  bigIdea: string;
  keyTakeaways: string[];
}

export function getLessonTranslation(language: LanguageCode, topicId: string): LessonTranslation {
  // Get lesson data from messages
  const lessonData = messages[language]?.lessons as Record<string, LessonTranslation> | undefined;
  const enLessonData = messages.en?.lessons as Record<string, LessonTranslation> | undefined;
  
  // Try to get from current language, fall back to English
  const lesson = lessonData?.[topicId] || enLessonData?.[topicId];
  
  if (!lesson) {
    // Final fallback
    return {
      title: topicId,
      description: "",
      bigIdea: "",
      keyTakeaways: [],
    };
  }
  
  return {
    title: lesson.title || topicId,
    description: lesson.description || "",
    bigIdea: lesson.bigIdea || "",
    keyTakeaways: Array.isArray(lesson.keyTakeaways) ? lesson.keyTakeaways : [],
  };
}

/**
 * Get an array translation (like keyTakeaways)
 * Falls back to English if not found
 */
export function getArrayTranslation(language: LanguageCode, keyPath: string): string[] {
  const keys = keyPath.split(".");
  
  // Try selected language first
  let value: MessageValue | undefined = messages[language];
  for (const key of keys) {
    if (typeof value === "object" && value !== null && key in value) {
      value = value[key];
    } else {
      value = undefined;
      break;
    }
  }
  
  if (Array.isArray(value)) {
    return value as string[];
  }
  
  // Fallback to English
  if (language !== "en") {
    let fallback: MessageValue | undefined = messages.en;
    for (const key of keys) {
      if (typeof fallback === "object" && fallback !== null && key in fallback) {
        fallback = fallback[key];
      } else {
        fallback = undefined;
        break;
      }
    }
    
    if (Array.isArray(fallback)) {
      return fallback as string[];
    }
  }
  
  return [];
}
