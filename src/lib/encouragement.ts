// ============================================
// Encouragement Engine
// Dynamic, context-aware encouragement messages
// ============================================

// ============================================
// Types
// ============================================

export type EncouragementTone = 
  | "success" 
  | "support" 
  | "streak" 
  | "milestone" 
  | "focus" 
  | "comeback";

export interface EncouragementMessage {
  text: string;
  tone: EncouragementTone;
}

export interface EncouragementContext {
  isCorrect: boolean;
  correctStreak: number;
  incorrectStreak: number;
  isReviewError?: boolean;
  isMisconceptionError?: boolean;
  isFastAnswer?: boolean;  // Focus mode: answered faster than target
  isComeback?: boolean;    // Correct after 2+ incorrect
  isPerfectSet?: boolean;  // 100% on the set
  totalAttempts?: number;
}

// ============================================
// Phrase Pools (8-20 phrases each)
// ============================================

const PHRASES = {
  correct_basic: [
    "Nice work! 🎯",
    "You got it! ✨",
    "Excellent! 🌟",
    "Well done! ⭐",
    "That's right! 👍",
    "Spot on! 💫",
    "Great thinking! 🧠",
    "Correct! 🎉",
    "You nailed it! 💪",
    "Brilliant! ✨",
    "Sharp! 🔥",
    "Keep it up! 🚀",
  ],

  correct_streak: [
    "You're on fire! 🔥",
    "Streak going strong! ⚡",
    "Unstoppable! 💪",
    "Another one! 🎯",
    "Keep rolling! 🎲",
    "You're crushing it! 🏆",
    "Momentum! 🚀",
    "Hat trick energy! 🎩",
    "Can't stop you! ⭐",
    "Machine mode! 🤖",
  ],

  correct_fast: [
    "Lightning fast! ⚡",
    "Speed demon! 🏎️",
    "Quick thinking! 🧠",
    "Zoom! Fast and accurate! 💨",
    "Speedy and correct! 🚀",
    "That was quick! ⏱️",
    "No hesitation! 💪",
    "Rapid fire! 🔥",
  ],

  correct_comeback: [
    "That's the spirit! 💪",
    "Bounced back! 🦘",
    "There you go! 🎯",
    "Now you've got it! ✨",
    "Nice recovery! 🌟",
    "Back on track! 🛤️",
    "Persistence pays off! 💫",
    "You figured it out! 🧠",
    "That's the way! 👏",
  ],

  incorrect_support: [
    "Keep going, you're learning! 💪",
    "Almost there! 🌱",
    "Good effort! Try again. 💫",
    "Learning in progress! 🧠",
    "You're getting closer! 📈",
    "Mistakes help us grow! 🌿",
    "Part of the process! 🔄",
    "Let's try another way! 🛤️",
    "Don't give up! ⭐",
    "Practice makes progress! 💪",
  ],

  incorrect_review_error: [
    "Quick slip! Double-check. ✏️",
    "Tiny typo—careful! 🔍",
    "Almost! Check your work. 📝",
    "Small slip, you know this! 💡",
    "Double-check the details. 🔎",
    "So close! Review it. 📋",
    "Little error—try again! ✨",
    "Check your signs/digits! ➕",
  ],

  incorrect_misconception: [
    "Let's think step by step. 🪜",
    "A common tricky spot! 🤔",
    "Let's unpack this. 📦",
    "Good learning moment! 📚",
    "This one's tricky! 🧩",
    "Let's slow down here. ⏸️",
    "Worth understanding deeply. 🔬",
    "Key concept alert! 🔑",
  ],

  milestone_streak_3: [
    "3 in a row! 🔥",
    "Triple threat! ⚡",
    "Three-peat! 🏆",
    "Hat trick! 🎩",
    "On a roll! 🎲",
  ],

  milestone_streak_5: [
    "5 streak! Incredible! 🏆",
    "Five stars! ⭐⭐⭐⭐⭐",
    "Fantastic five! 🖐️",
    "High five for five! ✋",
  ],

  milestone_perfect: [
    "100%! Amazing! 🏆",
    "Perfect score! 🌟",
    "Flawless! ✨",
    "You crushed it! 💪",
    "Absolute champion! 👑",
  ],
};

// ============================================
// Anti-Monotony: Recent phrases tracking
// ============================================

const RECENT_PHRASES_KEY = "mm_recent_encouragements";
const MAX_RECENT_PHRASES = 5;

function getRecentPhrases(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_PHRASES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("[Encouragement] Failed to load recent phrases:", e);
  }
  return [];
}

function addRecentPhrase(phrase: string): void {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentPhrases();
    // Add to front, remove duplicates, limit to MAX
    const updated = [phrase, ...recent.filter(p => p !== phrase)].slice(0, MAX_RECENT_PHRASES);
    localStorage.setItem(RECENT_PHRASES_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("[Encouragement] Failed to save recent phrase:", e);
  }
}

function selectNonRepeatingPhrase(pool: string[]): string {
  const recent = getRecentPhrases();
  
  // Filter out recently used phrases
  const available = pool.filter(p => !recent.includes(p));
  
  // If all have been used recently, use any from the pool
  const candidates = available.length > 0 ? available : pool;
  
  // Random selection
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  
  // Track it
  addRecentPhrase(selected);
  
  return selected;
}

// ============================================
// Main Encouragement Function
// ============================================

export function getEncouragementMessage(context: EncouragementContext): EncouragementMessage {
  const { 
    isCorrect, 
    correctStreak, 
    incorrectStreak,
    isReviewError,
    isMisconceptionError,
    isFastAnswer,
    isComeback,
    isPerfectSet,
  } = context;

  // Perfect set milestone (highest priority)
  if (isPerfectSet && isCorrect) {
    return {
      text: selectNonRepeatingPhrase(PHRASES.milestone_perfect),
      tone: "milestone",
    };
  }

  // Correct answers
  if (isCorrect) {
    // Streak milestones
    if (correctStreak >= 5) {
      return {
        text: selectNonRepeatingPhrase(PHRASES.milestone_streak_5),
        tone: "streak",
      };
    }
    
    if (correctStreak === 3) {
      return {
        text: selectNonRepeatingPhrase(PHRASES.milestone_streak_3),
        tone: "streak",
      };
    }

    // Comeback (correct after 2+ wrong)
    if (isComeback || incorrectStreak >= 2) {
      return {
        text: selectNonRepeatingPhrase(PHRASES.correct_comeback),
        tone: "comeback",
      };
    }

    // Fast answer in focus mode
    if (isFastAnswer) {
      return {
        text: selectNonRepeatingPhrase(PHRASES.correct_fast),
        tone: "focus",
      };
    }

    // Continuing streak (2+)
    if (correctStreak >= 2) {
      return {
        text: selectNonRepeatingPhrase(PHRASES.correct_streak),
        tone: "streak",
      };
    }

    // Basic correct
    return {
      text: selectNonRepeatingPhrase(PHRASES.correct_basic),
      tone: "success",
    };
  }

  // Incorrect answers
  if (isReviewError) {
    return {
      text: selectNonRepeatingPhrase(PHRASES.incorrect_review_error),
      tone: "support",
    };
  }

  if (isMisconceptionError) {
    return {
      text: selectNonRepeatingPhrase(PHRASES.incorrect_misconception),
      tone: "support",
    };
  }

  // Generic incorrect support
  return {
    text: selectNonRepeatingPhrase(PHRASES.incorrect_support),
    tone: "support",
  };
}

// ============================================
// Session Streak Tracking
// ============================================

const SESSION_STREAKS_KEY = "mm_session_streaks";

export interface SessionStreaks {
  correctStreak: number;
  incorrectStreak: number;
  lastOutcome: "correct" | "incorrect" | null;
  totalCorrect: number;
  totalIncorrect: number;
}

export function getSessionStreaks(): SessionStreaks {
  if (typeof window === "undefined") {
    return { 
      correctStreak: 0, 
      incorrectStreak: 0, 
      lastOutcome: null,
      totalCorrect: 0,
      totalIncorrect: 0,
    };
  }
  
  try {
    const stored = sessionStorage.getItem(SESSION_STREAKS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("[Encouragement] Failed to load session streaks:", e);
  }
  
  return { 
    correctStreak: 0, 
    incorrectStreak: 0, 
    lastOutcome: null,
    totalCorrect: 0,
    totalIncorrect: 0,
  };
}

export function updateSessionStreaks(isCorrect: boolean): SessionStreaks {
  const current = getSessionStreaks();
  
  let updated: SessionStreaks;
  
  if (isCorrect) {
    updated = {
      correctStreak: current.correctStreak + 1,
      incorrectStreak: 0,
      lastOutcome: "correct",
      totalCorrect: current.totalCorrect + 1,
      totalIncorrect: current.totalIncorrect,
    };
  } else {
    updated = {
      correctStreak: 0,
      incorrectStreak: current.incorrectStreak + 1,
      lastOutcome: "incorrect",
      totalCorrect: current.totalCorrect,
      totalIncorrect: current.totalIncorrect + 1,
    };
  }
  
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(SESSION_STREAKS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("[Encouragement] Failed to save session streaks:", e);
    }
  }
  
  return updated;
}

export function resetSessionStreaks(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_STREAKS_KEY);
  } catch (e) {
    console.warn("[Encouragement] Failed to reset session streaks:", e);
  }
}

// ============================================
// Helper: Check if answer was fast
// ============================================

export function isFastForTopic(timeTakenMs: number, topicId: string): boolean {
  // Target times in seconds
  const TARGET_TIMES: Record<string, number> = {
    fractions: 35,
    negatives: 25,
    "linear-equations": 40,
    "mixed-review": 35,
  };
  
  const targetSeconds = TARGET_TIMES[topicId] ?? 35;
  const targetMs = targetSeconds * 1000;
  
  // "Fast" if under 60% of target time
  return timeTakenMs < targetMs * 0.6;
}

// ============================================
// Debug: Get all phrase pools for testing
// ============================================

export function getAllPhrasePools(): Record<string, string[]> {
  return PHRASES;
}

export function clearRecentPhrases(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RECENT_PHRASES_KEY);
  } catch (e) {
    console.warn("[Encouragement] Failed to clear recent phrases:", e);
  }
}
