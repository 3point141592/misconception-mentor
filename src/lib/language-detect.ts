/**
 * Lightweight language detection for AI output validation
 * 
 * Supports:
 * - hi-Deva: Devanagari script (Hindi)
 * - ur-Arab: Arabic script (Urdu)
 * - hi-Latn: Roman Hindi (Hindi written in Latin script)
 * - mixed-hi-Latn-en: Mixed Roman Hindi + English
 * - en: English
 * - unknown: Cannot determine
 */

export interface LanguageDetectionResult {
  /** Detected language tag */
  tag: "hi-Deva" | "hi-Latn" | "ur-Arab" | "mixed-hi-Latn-en" | "en" | "unknown";
  /** Confidence score 0-1 */
  confidence: number;
  /** Human-readable label for UI */
  label: string;
  /** Debug notes explaining detection */
  notes: string;
}

// Roman Hindi marker words (case-insensitive)
// These are common Hindi words written in Latin script
const ROMAN_HINDI_MARKERS = new Set([
  // Common verbs and verb forms
  "hai", "hain", "tha", "the", "thi", "tho", "ho", "hoga", "hogi", "honge", "hona",
  "karo", "karein", "karna", "karne", "kar", "kiya", "kiye", "ki", "kara",
  "dekho", "dekhen", "dekhna", "dekh",
  "dhundho", "dhundhen", "dhundna", "dhund",
  "samjho", "samjhen", "samajhna", "samajh",
  "socho", "sochen", "sochna", "soch",
  "likho", "likhen", "likhna", "likh",
  "padho", "padhen", "padhna", "padh",
  "batao", "bataen", "batana", "bata",
  "yaad", "rakh", "rakho", "rakhna",
  
  // Negation
  "nahi", "nahin", "mat", "na",
  
  // Question words
  "kya", "kyun", "kyu", "kyunki", "kaise", "kaisa", "kaisi", "kahan", "kab", "kaun",
  
  // Postpositions
  "ka", "ki", "ke", "ko", "se", "par", "pe", "mein", "me", "tak", "liye",
  
  // Conjunctions and connectors
  "aur", "lekin", "magar", "ya", "phir", "pehle", "baad", "toh", "to", "bhi",
  
  // Pronouns
  "tum", "aap", "hum", "main", "yeh", "ye", "woh", "wo", "iska", "uska", "inhe", "unhe",
  "apna", "apni", "apne", "mera", "meri", "mere", "tera", "teri", "tere",
  
  // Common adjectives and adverbs
  "sahi", "galat", "acha", "accha", "bura", "bada", "chota", "naya", "purana",
  "pehla", "doosra", "teesra", "ek", "do", "teen", "char",
  "bahut", "thoda", "zyada", "kam", "sirf", "bilkul",
  
  // Common nouns in context
  "tarika", "tareeka", "jawab", "sawal", "matlab", "wajah",
  
  // Math context words in Hindi
  "jod", "ghatao", "guna", "bhag", "barabar",
]);

// Unicode ranges for script detection
const DEVANAGARI_RANGE = /[\u0900-\u097F]/;
const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F]/;

/**
 * Extract only natural language string values from an object (recursive)
 * Excludes JSON keys to avoid false English detection
 */
export function extractTextValues(obj: unknown): string {
  if (typeof obj === "string") {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(extractTextValues).filter(Boolean).join(" ");
  }
  
  if (obj && typeof obj === "object") {
    return Object.values(obj).map(extractTextValues).filter(Boolean).join(" ");
  }
  
  return "";
}

/**
 * Count Roman Hindi marker words in text
 */
function countMarkerWords(text: string): { count: number; total: number; found: string[] } {
  // Tokenize: split on whitespace and punctuation, lowercase
  const words = text.toLowerCase().split(/[\s,.!?;:'"()\[\]{}]+/).filter(Boolean);
  const found: string[] = [];
  
  for (const word of words) {
    if (ROMAN_HINDI_MARKERS.has(word)) {
      found.push(word);
    }
  }
  
  return { count: found.length, total: words.length, found: [...new Set(found)] };
}

/**
 * Detect the language of the given text
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  if (!text || text.trim().length === 0) {
    return {
      tag: "unknown",
      confidence: 0,
      label: "Unknown",
      notes: "Empty or no text provided",
    };
  }
  
  const trimmed = text.trim();
  
  // Check for Devanagari script (Hindi)
  if (DEVANAGARI_RANGE.test(trimmed)) {
    const devanagariChars = (trimmed.match(DEVANAGARI_RANGE) || []).length;
    const ratio = devanagariChars / trimmed.replace(/\s/g, "").length;
    
    return {
      tag: "hi-Deva",
      confidence: Math.min(0.95, 0.7 + ratio * 0.25),
      label: "Hindi (Devanagari)",
      notes: `Devanagari script detected (${devanagariChars} chars, ${(ratio * 100).toFixed(0)}% of text)`,
    };
  }
  
  // Check for Arabic script (Urdu)
  if (ARABIC_RANGE.test(trimmed)) {
    const arabicChars = (trimmed.match(ARABIC_RANGE) || []).length;
    const ratio = arabicChars / trimmed.replace(/\s/g, "").length;
    
    return {
      tag: "ur-Arab",
      confidence: Math.min(0.95, 0.7 + ratio * 0.25),
      label: "Urdu (Arabic script)",
      notes: `Arabic script detected (${arabicChars} chars, ${(ratio * 100).toFixed(0)}% of text)`,
    };
  }
  
  // Latin script - check for Roman Hindi markers
  const markers = countMarkerWords(trimmed);
  const markerRatio = markers.total > 0 ? markers.count / markers.total : 0;
  
  // High marker density = Roman Hindi
  if (markers.count >= 3 && markerRatio >= 0.15) {
    return {
      tag: "hi-Latn",
      confidence: Math.min(0.95, 0.6 + markerRatio),
      label: "Roman Hindi (hi-Latn)",
      notes: `${markers.count}/${markers.total} words are Hindi markers (${(markerRatio * 100).toFixed(0)}%): ${markers.found.slice(0, 5).join(", ")}${markers.found.length > 5 ? "..." : ""}`,
    };
  }
  
  // Medium marker density = Mixed Roman Hindi + English
  if (markers.count >= 2 && markerRatio >= 0.08) {
    return {
      tag: "mixed-hi-Latn-en",
      confidence: Math.min(0.85, 0.5 + markerRatio),
      label: "Mixed (Roman Hindi + English)",
      notes: `${markers.count}/${markers.total} words are Hindi markers (${(markerRatio * 100).toFixed(0)}%): ${markers.found.join(", ")}`,
    };
  }
  
  // Low/no markers = likely English
  // But check for any markers at all
  if (markers.count >= 1) {
    return {
      tag: "mixed-hi-Latn-en",
      confidence: 0.5,
      label: "Mixed (Roman Hindi + English)",
      notes: `Few Hindi markers found (${markers.count}): ${markers.found.join(", ")}`,
    };
  }
  
  // No markers - assume English
  return {
    tag: "en",
    confidence: 0.8,
    label: "English",
    notes: "No Hindi markers detected, Latin script only",
  };
}

/**
 * Detect language from an API response object
 * Extracts only string values, ignoring keys
 */
export function detectLanguageFromResponse(response: unknown): LanguageDetectionResult {
  const text = extractTextValues(response);
  return detectLanguage(text);
}

/**
 * Check if detected language matches expected target
 * For hi_latn target, accept both hi-Latn and mixed-hi-Latn-en
 */
export function isTargetLanguageMatch(
  detected: LanguageDetectionResult,
  expectedLang: string
): boolean {
  // English target - accept en
  if (expectedLang === "en") {
    return detected.tag === "en";
  }
  
  // Hindi/Hinglish target - accept hi-Latn, mixed-hi-Latn-en, hi-Deva
  if (expectedLang === "hi_latn") {
    return ["hi-Latn", "mixed-hi-Latn-en", "hi-Deva"].includes(detected.tag);
  }
  
  // Spanish target - should have Spanish markers (simplified check)
  if (expectedLang === "es") {
    // For now, accept if not clearly English
    return detected.tag !== "en" || detected.confidence < 0.7;
  }
  
  // French target
  if (expectedLang === "fr") {
    return detected.tag !== "en" || detected.confidence < 0.7;
  }
  
  // Chinese target - would need non-ASCII
  if (expectedLang === "zh_hans") {
    return detected.tag !== "en";
  }
  
  // Default: not English = probably translated
  return detected.tag !== "en";
}
