"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useDelight } from "@/components/DelightProvider";
import { useTranslation, LANGUAGE_NAMES, AVAILABLE_LANGUAGES } from "@/components/I18nProvider";
import { getTranslationPreview } from "@/i18n";
import { getRecentAttempts, saveAttempt, incrementMisconceptionStat, getMisconceptionStats } from "@/lib/supabase/db";
import type { AttemptInsert, AttemptMetadata } from "@/lib/supabase/database.types";
import { extractAttemptMetadata } from "@/lib/supabase/database.types";
import type { ErrorClass, ReviewErrorType, FocusMeta } from "@/lib/types";
import { 
  fireConfetti, 
  computeEfficiencyRating, 
  getEfficiencyLabel, 
  computeAverageFocusTime,
  computeAdaptiveNudgeThresholds,
  computeFocusModeScores,
  type FocusAttempt 
} from "@/lib/delight";
import { ReadAloudButton, stopGlobalAudio } from "@/components/ReadAloudButton";
import { STT_LANGUAGE_MAP } from "@/components/VoiceInput";
import { 
  getAllDrafts, 
  getMostRecentDraft, 
  saveDraft, 
  clearDraft,
  type ThinkingFieldType 
} from "@/lib/thinking-drafts";
import {
  detectLanguageFromResponse,
  isTargetLanguageMatch,
  type LanguageDetectionResult,
} from "@/lib/language-detect";
import { useAvatar } from "@/components/AvatarProvider";
import { useNarrationRegistry, NarrationBlock } from "@/components/NarrationBlock";
import {
  getEncouragementMessage,
  getSessionStreaks,
  updateSessionStreaks,
  resetSessionStreaks,
  clearRecentPhrases,
  type EncouragementContext,
  type SessionStreaks,
} from "@/lib/encouragement";

// ============================================
// Access Control: Only allow in dev or with env flag
// ============================================
const isDebugPageEnabled = () => {
  // Always allow in development
  if (process.env.NODE_ENV === "development") return true;
  // Allow in production if explicitly enabled
  if (process.env.NEXT_PUBLIC_ENABLE_DEBUG_PAGE === "true") return true;
  return false;
};

// ============================================
// Privacy Helpers: Mask sensitive user info
// ============================================

/** Mask email: "john.doe@example.com" -> "jo***@example.com" */
function maskEmail(email: string | undefined): string {
  if (!email) return "Unknown";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + "***" : "***";
  return `${maskedLocal}@${domain}`;
}

/** Mask user ID: show first 6 chars only */
function maskUserId(userId: string | undefined): string {
  if (!userId) return "Unknown";
  if (userId.length <= 6) return userId;
  return userId.slice(0, 6) + "...";
}

// Test question for MISCONCEPTION error (fractions)
const MISCONCEPTION_TEST = {
  id: "frac-001",
  topic: "fractions",
  prompt: "Calculate: 1/4 + 1/2",
  correct_answer: "3/4",
  wrong_answer: "2/6", // Conceptual error - adding numerators and denominators
  explanation: "I added the top numbers and the bottom numbers",
  candidate_misconception_ids: ["FRAC-01", "FRAC-02", "FRAC-03"],
};

// Test question for REVIEW ERROR (negatives - sign slip)
const REVIEW_ERROR_TEST = {
  id: "neg-001",
  topic: "negatives",
  prompt: "Calculate: -3 + (-2)",
  correct_answer: "-5",
  wrong_answer: "5", // Sign slip - forgot the negative
  explanation: "I think the answer is positive",
  expected_review_type: "sign_slip" as ReviewErrorType,
};

// Test question for COACH NOTES (detailed explanation)
const COACH_NOTES_TEST = {
  id: "frac-002",
  topic: "fractions",
  prompt: "Calculate: 2/3 - 1/6",
  correct_answer: "1/2",
  wrong_answer: "1/3", // Wrong answer
  // Long, detailed explanation that should produce personalized coach notes
  explanation: "I first looked at the denominators 3 and 6. Since 6 is bigger, I kept that. Then I subtracted the numerators: 2 minus 1 equals 1. So my answer is 1 over 3, which is 1/3. I think this is right because I kept the bigger denominator.",
};

// Test question for FOCUS MODE (correct answer, simulated time)
const FOCUS_MODE_TEST = {
  id: "neg-002",
  topic: "negatives",
  prompt: "Calculate: -4 - 6",
  correct_answer: "-10",
  answer: "-10", // Correct answer for testing
  explanation: "I know that subtracting a positive from a negative makes it more negative.",
  simulated_time_ms: 18000, // 18 seconds - fast for negatives (target 25s)
};

interface ApiResult {
  status: number;
  statusText: string;
  data: unknown;
  timestamp: string;
}

interface SupabaseCheckResult {
  attemptCount: number;
  newestAttempt: {
    id: string;
    topic: string;
    is_correct: boolean;
    created_at: string;
    error_class?: string;
    review_error_type?: string | null;
  } | null;
  timestamp: string;
}

interface ReviewErrorTestResult {
  evaluateResponse: ApiResult;
  attemptSaved: boolean;
  attemptId?: string;
  statIncremented: boolean;
  statId: string;
  statCountBefore: number;
  statCountAfter: number;
  savedMetadata?: {
    error_class: string;
    review_error_type: string | null;
  };
  timestamp: string;
}

interface StatsPreviewResult {
  reviewErrorStats: { id: string; count: number; last_seen_at: string }[];
  misconceptionStats: { id: string; count: number; last_seen_at: string }[];
  timestamp: string;
}

interface CoachNotesTestResult {
  evaluateResponse: ApiResult;
  coachNotesReturned: {
    what_went_well: string[];
    what_to_fix: string[];
    remember: string;
    next_step: string;
  } | null;
  attemptSaved: boolean;
  attemptId?: string;
  persistedCoachNotes: {
    what_went_well: string[];
    what_to_fix: string[];
    remember: string;
    next_step: string;
  } | null;
  isPersisted: boolean; // PASS/FAIL - whether coach notes were persisted
  timestamp: string;
}

interface FocusEfficiencyTestResult {
  attemptSaved: boolean;
  attemptId?: string;
  focusMeta: FocusMeta | null;
  rating: number;
  label: string;
  emoji: string;
  avgTime: number | null;
  focusAttemptCount: number;
  timestamp: string;
}

interface TranslationTestResult {
  language: string;
  languageName: string;
  uiKeys: { key: string; value: string }[];
  lessonBlock: {
    title: string;
    overview: string;
    mascotCatchphrase: string;
  } | null;
  evaluateResult: {
    shortFeedback: string;
    isInTargetLanguage: boolean;
    detection: LanguageDetectionResult;
    timestamp: string;
  } | null;
  diagnoseResult: {
    keyTakeaway: string;
    remediation: string;
    teachBackPrompt: string;
    isInTargetLanguage: boolean;
    detection: LanguageDetectionResult;
    status: "ok" | "retried" | "fallback" | "error";
    statusDetails?: string;
    timestamp: string;
  } | null;
  timestamp: string;
}

// Thinking Autosave Test Section
function ThinkingAutosaveTestSection({ userId }: { userId: string | null }) {
  const [drafts, setDrafts] = useState<Record<string, { text: string; ts: number }>>({});
  const [recentDraft, setRecentDraft] = useState<{
    key: string;
    text: string;
    ts: number;
    fieldType: ThinkingFieldType;
    questionId: string;
  } | null>(null);
  const [testText, setTestText] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "saved" | "cleared">("idle");
  
  // Load drafts on mount and when userId changes
  useEffect(() => {
    const loadedDrafts = getAllDrafts(userId);
    setDrafts(loadedDrafts);
    const recent = getMostRecentDraft(userId);
    setRecentDraft(recent);
  }, [userId]);
  
  const handleSimulateSave = () => {
    const testQuestionId = "test-draft-" + Date.now();
    saveDraft(userId, testQuestionId, "initial_explanation", testText || "Test draft content from debug page");
    setTestStatus("saved");
    
    // Reload drafts
    setTimeout(() => {
      const loadedDrafts = getAllDrafts(userId);
      setDrafts(loadedDrafts);
      const recent = getMostRecentDraft(userId);
      setRecentDraft(recent);
    }, 100);
  };
  
  const handleClearAllDrafts = () => {
    // Clear all drafts for this user
    const keys = Object.keys(drafts);
    keys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn("Failed to remove draft:", key, e);
      }
    });
    setDrafts({});
    setRecentDraft(null);
    setTestStatus("cleared");
  };
  
  const draftCount = Object.keys(drafts).length;
  
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-indigo-300 mb-6">
      <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
        <span className="text-lg">📝</span>
        Thinking Autosave Test
      </h2>
      
      {/* Current User */}
      <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200 mb-4">
        <p className="text-sm text-indigo-800">
          <strong>User:</strong> {userId || "guest"}
        </p>
        <p className="text-sm text-indigo-600">
          <strong>Stored drafts:</strong> {draftCount}
        </p>
      </div>
      
      {/* Most Recent Draft */}
      <div className="mb-4">
        <p className="text-sm font-medium text-ink mb-2">Most Recent Draft:</p>
        {recentDraft ? (
          <div className="bg-green-50 rounded-lg p-3 border border-green-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-700 bg-green-200 px-2 py-0.5 rounded">
                ✓ Draft persisted: YES
              </span>
              <span className="text-xs text-green-600">
                {new Date(recentDraft.ts).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-green-800 mb-1">
              <strong>Type:</strong> {recentDraft.fieldType}
            </p>
            <p className="text-sm text-green-800 mb-1">
              <strong>Question:</strong> {recentDraft.questionId.substring(0, 20)}...
            </p>
            <p className="text-sm text-green-900 bg-green-100 p-2 rounded font-mono text-xs overflow-hidden">
              {recentDraft.text.length > 100 
                ? recentDraft.text.substring(0, 100) + "..." 
                : recentDraft.text}
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-sm text-gray-500">
              ✗ No drafts found. Go to Practice → type in "Explain your thinking" → drafts will autosave.
            </p>
          </div>
        )}
      </div>
      
      {/* All Drafts List */}
      {draftCount > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-ink mb-2">All Stored Drafts:</p>
          <div className="bg-gray-50 rounded-lg p-2 border border-gray-200 max-h-32 overflow-y-auto">
            {Object.entries(drafts).map(([key, value]) => (
              <div key={key} className="text-xs text-gray-600 mb-1 font-mono truncate">
                {key.split("_").slice(-2).join("_")}: "{value.text.substring(0, 30)}..."
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Simulate Draft Save */}
      <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm font-medium text-blue-800 mb-2">Simulate Draft Save:</p>
        <input
          type="text"
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          placeholder="Enter test text..."
          className="w-full px-3 py-2 text-sm border border-blue-300 rounded mb-2"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSimulateSave}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            💾 Save Test Draft
          </button>
          <button
            onClick={handleClearAllDrafts}
            className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            🗑️ Clear All Drafts
          </button>
          {testStatus === "saved" && (
            <span className="text-xs text-green-600 self-center">✓ Saved!</span>
          )}
          {testStatus === "cleared" && (
            <span className="text-xs text-red-600 self-center">✓ Cleared!</span>
          )}
        </div>
      </div>
      
      {/* Test Instructions */}
      <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
        <p className="text-sm text-amber-800">
          <strong>Full Test:</strong> Go to Practice → turn mic ON → speak → do NOT manually stop mic → press Next Question → 
          return here → verify "Draft persisted: YES" and your spoken text appears.
        </p>
      </div>
    </div>
  );
}

// Avatar Test Section Component
function AvatarTestSection({ 
  settings, 
  updateSettings 
}: { 
  settings: any; 
  updateSettings: (s: any) => void;
}) {
  const avatar = useAvatar();
  const [isWalking, setIsWalking] = useState(false);
  
  // Test walk with right-angle path + footsteps
  const testWalkWithFootsteps = async () => {
    if (isWalking) return;
    setIsWalking(true);
    
    try {
      // Walk to left side (horizontal + vertical movement with footsteps)
      await avatar.walkRightAngle(100, 200);
      avatar.say("I walked here! (right-angle path) 👀");
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Walk to another position
      await avatar.walkRightAngle(300, 150);
      avatar.say("Now over here! 📍");
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Return to home dock
      await avatar.moveToDefault();
      avatar.hideBubble();
    } finally {
      setIsWalking(false);
    }
  };
  
  // Test anchor-based walking
  const testAnchorWalk = async () => {
    if (isWalking) return;
    setIsWalking(true);
    
    try {
      // This requires anchors to exist on the page
      // For debug purposes, just show the concept
      avatar.say("Looking for anchors... 🔍");
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Walk to a position on the left
      await avatar.walkRightAngle(80, 300);
      avatar.say("This is how I'd point at a key takeaway! 🎯");
      
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Walk to another position
      await avatar.walkRightAngle(80, 200);
      avatar.say("And now at the solution steps! 📝");
      
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      await avatar.moveToDefault();
      avatar.hideBubble();
    } finally {
      setIsWalking(false);
    }
  };
  
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
      <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
        <span className="text-lg">{settings.avatarStyle === "owl" ? "🦉" : "👩‍🏫"}</span>
        Teacher Avatar ({settings.avatarStyle === "owl" ? "Owl" : "Human"})
      </h2>
      
      {/* Current Settings Display */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <div className={`p-3 rounded-lg text-center ${settings.avatarEnabled ? "bg-amber-50 border border-amber-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Avatar</p>
          <p className={`text-sm font-bold ${settings.avatarEnabled ? "text-amber-700" : "text-gray-500"}`}>
            {settings.avatarEnabled ? "ON" : "OFF"}
          </p>
        </div>
        <div className="p-3 rounded-lg text-center bg-purple-50 border border-purple-200">
          <p className="text-xs font-medium text-ink-muted">Style</p>
          <p className="text-sm font-bold text-purple-700">
            {settings.avatarStyle === "owl" ? "🦉 Owl" : "👩‍🏫 Teacher"}
          </p>
        </div>
        <div className={`p-3 rounded-lg text-center ${settings.avatarSize ? "bg-purple-50 border border-purple-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Size</p>
          <p className="text-sm font-bold text-purple-700">
            {settings.avatarSize || "medium"}
          </p>
        </div>
        <div className={`p-3 rounded-lg text-center ${settings.avatarSpeaks ? "bg-amber-50 border border-amber-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Speaks</p>
          <p className={`text-sm font-bold ${settings.avatarSpeaks ? "text-amber-700" : "text-gray-500"}`}>
            {settings.avatarSpeaks ? "ON" : "OFF"}
          </p>
        </div>
        <div className={`p-3 rounded-lg text-center ${settings.focusNudgesEnabled ? "bg-amber-50 border border-amber-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Nudges</p>
          <p className={`text-sm font-bold ${settings.focusNudgesEnabled ? "text-amber-700" : "text-gray-500"}`}>
            {settings.focusNudgesEnabled ? "ON" : "OFF"}
          </p>
        </div>
      </div>
      
      {/* Home Position Display */}
      <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-blue-700">Home Position (draggable)</p>
            <p className="text-sm font-mono text-blue-900">
              X: {avatar.homePosition.xPct.toFixed(1)}% | Y: {avatar.homePosition.yPct.toFixed(1)}%
            </p>
          </div>
          <button
            onClick={() => avatar.resetHomePosition()}
            className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-medium rounded-lg transition-all"
          >
            📍 Reset Position
          </button>
        </div>
      </div>

      {/* Quick Toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => updateSettings({ avatarEnabled: !settings.avatarEnabled })}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
            settings.avatarEnabled 
              ? "bg-amber-500 text-white hover:bg-amber-600" 
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {settings.avatarEnabled ? (settings.avatarStyle === "owl" ? "🦉 Avatar ON" : "👩‍🏫 Avatar ON") : "👩‍🏫 Avatar OFF"}
        </button>
        <button
          onClick={() => updateSettings({ avatarStyle: settings.avatarStyle === "owl" ? "teacher" : "owl" })}
          className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all bg-purple-100 hover:bg-purple-200 text-purple-800"
        >
          {settings.avatarStyle === "owl" ? "👩‍🏫 Switch to Teacher" : "🦉 Switch to Owl"}
        </button>
        {(["small", "medium", "large"] as const).map((size) => (
          <button
            key={size}
            onClick={() => updateSettings({ avatarSize: size })}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
              settings.avatarSize === size
                ? "bg-purple-500 text-white hover:bg-purple-600"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {size.charAt(0).toUpperCase() + size.slice(1)}
          </button>
        ))}
      </div>

      {/* Test Avatar Actions */}
      <div className="border-t border-paper-line pt-4">
        <p className="text-sm font-medium text-ink mb-3">Test Avatar Actions:</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => avatar.say("Hello! I'm here to help you learn! 🎓")}
            className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium rounded-lg transition-all"
          >
            💬 Say Hello
          </button>
          <button
            onClick={() => avatar.celebrate()}
            className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-800 text-sm font-medium rounded-lg transition-all"
          >
            🎉 Celebrate
          </button>
          <button
            onClick={testWalkWithFootsteps}
            disabled={isWalking}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
              isWalking
                ? "bg-purple-300 text-purple-700 cursor-not-allowed"
                : "bg-purple-100 hover:bg-purple-200 text-purple-800"
            }`}
          >
            {isWalking ? "🚶 Walking..." : "👠 Walk + Footsteps"}
          </button>
          <button
            onClick={testAnchorWalk}
            disabled={isWalking}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
              isWalking
                ? "bg-indigo-300 text-indigo-700 cursor-not-allowed"
                : "bg-indigo-100 hover:bg-indigo-200 text-indigo-800"
            }`}
          >
            {isWalking ? "🚶 Walking..." : "🛤️ Test Walk Path"}
          </button>
          <button
            onClick={() => avatar.nudge("Still with me? Try the first step! 🤔")}
            className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-medium rounded-lg transition-all"
          >
            💡 Test Nudge
          </button>
          <button
            onClick={() => avatar.resetToHome()}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-all"
          >
            🏠 Reset Home
          </button>
          <button
            onClick={() => avatar.hideBubble()}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-all"
          >
            ✕ Hide Bubble
          </button>
        </div>
        <p className="text-xs text-ink-muted mt-2">
          Note: Avatar is draggable (click-hold and move). Position persists across pages. "Walk + Footsteps" plays heel clicks if Sound effects ON. After anchor movement, avatar returns to saved home position.
        </p>
      </div>
    </div>
  );
}

// Encouragement Test Section Component
function EncouragementTestSection({ 
  settings, 
  updateSettings 
}: { 
  settings: any; 
  updateSettings: (s: Partial<any>) => void;
}) {
  const avatar = useAvatar();
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastTone, setLastTone] = useState<string | null>(null);
  const [streaks, setStreaks] = useState<SessionStreaks>(getSessionStreaks());
  const [messageHistory, setMessageHistory] = useState<string[]>([]);
  
  const refreshStreaks = () => {
    setStreaks(getSessionStreaks());
  };
  
  const simulateOutcome = (context: EncouragementContext) => {
    const result = getEncouragementMessage(context);
    setLastMessage(result.text);
    setLastTone(result.tone);
    setMessageHistory(prev => [result.text, ...prev].slice(0, 10));
    
    // Show in avatar if enabled
    if (settings.encouragementEnabled && settings.avatarEnabled) {
      avatar.say(result.text, false);
    }
    
    // Update streaks
    if (context.isCorrect) {
      updateSessionStreaks(true);
    } else {
      updateSessionStreaks(false);
    }
    refreshStreaks();
  };
  
  const simulateCorrect = () => {
    const currentStreaks = getSessionStreaks();
    simulateOutcome({
      isCorrect: true,
      correctStreak: currentStreaks.correctStreak + 1,
      incorrectStreak: 0,
      isComeback: currentStreaks.incorrectStreak >= 2,
    });
  };
  
  const simulateIncorrect = () => {
    const currentStreaks = getSessionStreaks();
    simulateOutcome({
      isCorrect: false,
      correctStreak: 0,
      incorrectStreak: currentStreaks.incorrectStreak + 1,
    });
  };
  
  const simulateReviewError = () => {
    const currentStreaks = getSessionStreaks();
    simulateOutcome({
      isCorrect: false,
      correctStreak: 0,
      incorrectStreak: currentStreaks.incorrectStreak + 1,
      isReviewError: true,
    });
  };
  
  const simulateMisconception = () => {
    const currentStreaks = getSessionStreaks();
    simulateOutcome({
      isCorrect: false,
      correctStreak: 0,
      incorrectStreak: currentStreaks.incorrectStreak + 1,
      isMisconceptionError: true,
    });
  };
  
  const simulateStreak3 = () => {
    // Reset and build a streak
    resetSessionStreaks();
    clearRecentPhrases();
    updateSessionStreaks(true);
    updateSessionStreaks(true);
    
    simulateOutcome({
      isCorrect: true,
      correctStreak: 3,
      incorrectStreak: 0,
    });
  };
  
  const simulateFastCorrect = () => {
    const currentStreaks = getSessionStreaks();
    simulateOutcome({
      isCorrect: true,
      correctStreak: currentStreaks.correctStreak + 1,
      incorrectStreak: 0,
      isFastAnswer: true,
    });
  };
  
  const simulateComeback = () => {
    // First simulate 2 incorrect
    resetSessionStreaks();
    clearRecentPhrases();
    updateSessionStreaks(false);
    updateSessionStreaks(false);
    
    simulateOutcome({
      isCorrect: true,
      correctStreak: 1,
      incorrectStreak: 0,
      isComeback: true,
    });
  };
  
  const resetAll = () => {
    resetSessionStreaks();
    clearRecentPhrases();
    setMessageHistory([]);
    setLastMessage(null);
    setLastTone(null);
    refreshStreaks();
  };
  
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
      <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
        <span className="text-lg">💬</span>
        Encouragement Engine Test
      </h2>
      
      {/* Current Settings */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className={`p-3 rounded-lg text-center ${settings.encouragementEnabled ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Encouragement</p>
          <p className={`text-sm font-bold ${settings.encouragementEnabled ? "text-green-700" : "text-gray-500"}`}>
            {settings.encouragementEnabled ? "ON" : "OFF"}
          </p>
        </div>
        <div className="p-3 rounded-lg text-center bg-blue-50 border border-blue-200">
          <p className="text-xs font-medium text-ink-muted">Correct Streak</p>
          <p className="text-sm font-bold text-blue-700">{streaks.correctStreak}</p>
        </div>
        <div className="p-3 rounded-lg text-center bg-amber-50 border border-amber-200">
          <p className="text-xs font-medium text-ink-muted">Incorrect Streak</p>
          <p className="text-sm font-bold text-amber-700">{streaks.incorrectStreak}</p>
        </div>
      </div>
      
      {/* Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => updateSettings({ encouragementEnabled: !settings.encouragementEnabled })}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
            settings.encouragementEnabled 
              ? "bg-green-500 text-white hover:bg-green-600" 
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {settings.encouragementEnabled ? "💬 Encouragement ON" : "💬 Encouragement OFF"}
        </button>
        <button
          onClick={resetAll}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-all"
        >
          🔄 Reset All
        </button>
        <button
          onClick={refreshStreaks}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-all"
        >
          ↻ Refresh
        </button>
      </div>
      
      {/* Simulation Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={simulateCorrect}
          className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-800 text-sm font-medium rounded-lg transition-all"
        >
          ✅ Correct
        </button>
        <button
          onClick={simulateIncorrect}
          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium rounded-lg transition-all"
        >
          ❌ Incorrect
        </button>
        <button
          onClick={simulateReviewError}
          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium rounded-lg transition-all"
        >
          ✏️ Review Error
        </button>
        <button
          onClick={simulateMisconception}
          className="px-3 py-1.5 bg-pink-100 hover:bg-pink-200 text-pink-800 text-sm font-medium rounded-lg transition-all"
        >
          🧩 Misconception
        </button>
        <button
          onClick={simulateStreak3}
          className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 text-sm font-medium rounded-lg transition-all"
        >
          🔥 Streak 3
        </button>
        <button
          onClick={simulateFastCorrect}
          className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-medium rounded-lg transition-all"
        >
          ⚡ Fast Correct
        </button>
        <button
          onClick={simulateComeback}
          className="px-3 py-1.5 bg-teal-100 hover:bg-teal-200 text-teal-800 text-sm font-medium rounded-lg transition-all"
        >
          💪 Comeback
        </button>
      </div>
      
      {/* Last Message Display */}
      {lastMessage && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-ink-muted">Last Message:</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              lastTone === "success" ? "bg-green-100 text-green-700" :
              lastTone === "support" ? "bg-amber-100 text-amber-700" :
              lastTone === "streak" ? "bg-purple-100 text-purple-700" :
              lastTone === "milestone" ? "bg-yellow-100 text-yellow-700" :
              lastTone === "focus" ? "bg-blue-100 text-blue-700" :
              lastTone === "comeback" ? "bg-teal-100 text-teal-700" :
              "bg-gray-100 text-gray-700"
            }`}>
              {lastTone}
            </span>
          </div>
          <p className="text-lg font-medium text-ink">{lastMessage}</p>
        </div>
      )}
      
      {/* Message History */}
      {messageHistory.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-muted mb-2">Recent Messages (verify no repeats):</p>
          <div className="space-y-1">
            {messageHistory.map((msg, i) => (
              <div 
                key={i} 
                className={`text-sm px-2 py-1 rounded ${
                  i === 0 ? "bg-green-50 text-green-800" : "bg-gray-50 text-gray-600"
                }`}
              >
                {i + 1}. {msg}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <p className="text-xs text-ink-muted mt-3">
        Tip: Click the same button multiple times to verify varied phrases. History shows last 10 messages.
      </p>
    </div>
  );
}

// Focus Mode UX Test Section Component
function FocusModeUXTestSection({ 
  settings, 
  updateSettings 
}: { 
  settings: any; 
  updateSettings: (s: Partial<any>) => void;
}) {
  const [lastInteractionAge, setLastInteractionAge] = useState(0);
  const [recentTimes, setRecentTimes] = useState<number[]>([]);
  const [thresholds, setThresholds] = useState<{ firstNudgeMs: number; secondNudgeMs: number; baselineMs: number } | null>(null);
  
  const refreshData = () => {
    // Load recent times from localStorage
    const RECENT_FOCUS_TIMES_KEY = "mm_recent_focus_times";
    try {
      const stored = localStorage.getItem(RECENT_FOCUS_TIMES_KEY);
      if (stored) {
        const times = JSON.parse(stored);
        if (Array.isArray(times)) {
          setRecentTimes(times.slice(0, 10));
          const computed = computeAdaptiveNudgeThresholds(times.slice(0, 5));
          setThresholds(computed);
        }
      }
    } catch (e) {
      console.warn("[Debug] Failed to load focus times:", e);
    }
  };
  
  // Refresh on mount
  useEffect(() => {
    refreshData();
    
    // Update interaction age every second
    const interval = setInterval(() => {
      setLastInteractionAge(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const clearRecentTimes = () => {
    localStorage.removeItem("mm_recent_focus_times");
    setRecentTimes([]);
    setThresholds(null);
  };
  
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
      <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
        <span className="text-lg">⏱️</span>
        Focus Mode UX Test
      </h2>
      
      {/* Current Settings */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className={`p-3 rounded-lg text-center ${settings.focusModeEnabled ? "bg-blue-50 border border-blue-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Focus Mode</p>
          <p className={`text-sm font-bold ${settings.focusModeEnabled ? "text-blue-700" : "text-gray-500"}`}>
            {settings.focusModeEnabled ? "ON" : "OFF"}
          </p>
        </div>
        <div className={`p-3 rounded-lg text-center ${settings.focusNudgesEnabled ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Focus Nudges</p>
          <p className={`text-sm font-bold ${settings.focusNudgesEnabled ? "text-green-700" : "text-gray-500"}`}>
            {settings.focusNudgesEnabled ? "ON" : "OFF"}
          </p>
        </div>
        <div className="p-3 rounded-lg text-center bg-purple-50 border border-purple-200">
          <p className="text-xs font-medium text-ink-muted">Recent Times</p>
          <p className="text-sm font-bold text-purple-700">{recentTimes.length}</p>
        </div>
      </div>
      
      {/* Adaptive Thresholds */}
      {thresholds && (
        <div className="bg-amber-50 rounded-lg p-4 mb-4 border border-amber-200">
          <h3 className="text-sm font-medium text-amber-800 mb-2">Adaptive Nudge Thresholds</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-amber-600">Baseline</p>
              <p className="font-mono font-bold text-amber-800">{(thresholds.baselineMs / 1000).toFixed(1)}s</p>
            </div>
            <div>
              <p className="text-xs text-amber-600">1st Nudge</p>
              <p className="font-mono font-bold text-amber-800">{(thresholds.firstNudgeMs / 1000).toFixed(1)}s</p>
            </div>
            <div>
              <p className="text-xs text-amber-600">2nd Nudge</p>
              <p className="font-mono font-bold text-amber-800">{(thresholds.secondNudgeMs / 1000).toFixed(1)}s</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Recent Focus Times */}
      {recentTimes.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-ink-muted mb-2">Recent Submit Times (ms):</p>
          <div className="flex flex-wrap gap-1">
            {recentTimes.map((time, i) => (
              <span key={i} className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded font-mono">
                {(time / 1000).toFixed(1)}s
              </span>
            ))}
          </div>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => updateSettings({ focusModeEnabled: !settings.focusModeEnabled })}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
            settings.focusModeEnabled 
              ? "bg-blue-500 text-white hover:bg-blue-600" 
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {settings.focusModeEnabled ? "⏱️ Focus Mode ON" : "⏱️ Focus Mode OFF"}
        </button>
        <button
          onClick={refreshData}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-all"
        >
          ↻ Refresh Data
        </button>
        <button
          onClick={clearRecentTimes}
          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition-all"
        >
          🗑️ Clear Times
        </button>
      </div>
      
      {/* Keyboard Flow Checklist */}
      <div className="border-t border-paper-line pt-4">
        <h3 className="text-sm font-medium text-ink mb-2">Keyboard Flow Checklist (Focus Mode)</h3>
        <ul className="text-xs text-ink-muted space-y-1">
          <li>✓ <strong>Enter</strong> in answer box → submits ("Check")</li>
          <li>✓ <strong>Enter</strong> on feedback → advances to next question</li>
          <li>✓ Answer box <strong>auto-focuses</strong> on every new question</li>
          <li>✓ Timer <strong>freezes at submit</strong> (not during feedback reading)</li>
          <li>✓ Nudges trigger based on <strong>inactivity</strong>, not total time</li>
        </ul>
      </div>
      
      <p className="text-xs text-ink-muted mt-3">
        Tip: Go to Practice → enable Focus Mode → test keyboard-only flow with Enter key.
      </p>
    </div>
  );
}

// Language (i18n) Test Section Component
function LanguageTestSection() {
  const { language, setLanguage, t, languageFlag, languageName } = useTranslation();
  const [evalResult, setEvalResult] = useState<{ data: any; error: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  
  const previewTranslations = getTranslationPreview(language);
  
  const testEvaluateInLanguage = async () => {
    setLoading(true);
    setEvalResult(null);
    
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: "Calculate: 1/4 + 1/2",
          correct_answer: "3/4",
          student_answer: "2/6",
          student_explanation: "I added the numerators and denominators",
          language: language,
        }),
      });
      
      const data = await response.json();
      setEvalResult({ data, error: null });
    } catch (err) {
      setEvalResult({ data: null, error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
      <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
        <span className="text-lg">🌐</span>
        Language (i18n) Test
      </h2>
      
      {/* Current Language */}
      <div className="flex items-center justify-between mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{languageFlag}</span>
          <div>
            <p className="text-sm font-medium text-blue-800">Current Language</p>
            <p className="text-lg font-bold text-blue-600">{languageName}</p>
          </div>
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as any)}
          className="px-3 py-2 border border-blue-300 rounded-lg text-sm font-medium bg-white"
        >
          {AVAILABLE_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGE_NAMES[lang]}
            </option>
          ))}
        </select>
      </div>
      
      {/* Preview UI Translations */}
      <div className="border-t border-paper-line pt-4 mb-4">
        <p className="text-sm font-medium text-ink mb-3">Preview UI Translations (10 keys):</p>
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
          {Object.entries(previewTranslations).map(([key, value]) => (
            <div key={key} className="text-xs bg-gray-50 rounded p-2 border border-gray-200">
              <p className="text-gray-500 font-mono truncate">{key}</p>
              <p className="text-ink font-medium truncate">{value}</p>
            </div>
          ))}
        </div>
      </div>
      
      {/* Test Evaluate in Current Language */}
      <div className="border-t border-paper-line pt-4">
        <p className="text-sm font-medium text-ink mb-3">Test Evaluate API in {languageName}:</p>
        <button
          onClick={testEvaluateInLanguage}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? "Testing..." : `🧪 Run Evaluate in ${languageName}`}
        </button>
        
        {evalResult && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 overflow-x-auto">
            {evalResult.error ? (
              <p className="text-red-600 text-sm">Error: {evalResult.error}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-green-600 mb-2">
                  ✓ Response received in {languageName}
                </p>
                <div className="text-xs">
                  <p className="text-ink-muted font-medium">short_feedback:</p>
                  <p className="text-ink bg-white p-2 rounded border border-gray-200 mb-2">
                    {evalResult.data.short_feedback || "(none)"}
                  </p>
                  <p className="text-ink-muted font-medium">solution_steps (first 2):</p>
                  <ul className="list-disc ml-4 text-ink">
                    {(evalResult.data.solution_steps || []).slice(0, 2).map((step: string, i: number) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
        
        <p className="text-xs text-ink-muted mt-3">
          <strong>How to verify:</strong><br/>
          1. Select a language from the dropdown<br/>
          2. Click "Run Evaluate" → short_feedback and solution_steps should be in that language<br/>
          3. Note: JSON keys remain in English; only values are translated
        </p>
      </div>
    </div>
  );
}

// Narration Test Section Component
function NarrationTestSection({ settings }: { settings: any }) {
  const { getRegisteredBlocks, activeBlockId } = useNarrationRegistry();
  const [registeredBlocks, setRegisteredBlocks] = useState<Array<{ id: string; text: string }>>([]);
  
  const refreshBlocks = () => {
    const blocks = getRegisteredBlocks().map(b => ({
      id: b.id,
      text: b.text.slice(0, 80) + (b.text.length > 80 ? "..." : ""),
    }));
    setRegisteredBlocks(blocks);
  };
  
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
      <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
        <span className="text-lg">🎧</span>
        Narration Blocks Preview
      </h2>
      
      {/* Current Settings Display */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className={`p-3 rounded-lg text-center ${settings.showReadAloudButtons ? "bg-purple-50 border border-purple-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Read-Aloud Buttons</p>
          <p className={`text-sm font-bold ${settings.showReadAloudButtons ? "text-purple-700" : "text-gray-500"}`}>
            {settings.showReadAloudButtons ? "VISIBLE" : "HIDDEN"}
          </p>
        </div>
        <div className={`p-3 rounded-lg text-center ${activeBlockId ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xs font-medium text-ink-muted">Active Block</p>
          <p className={`text-sm font-bold ${activeBlockId ? "text-yellow-700" : "text-gray-500"}`}>
            {activeBlockId || "None"}
          </p>
        </div>
      </div>

      {/* Refresh Registered Blocks */}
      <div className="border-t border-paper-line pt-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-ink">Registered Narration Blocks (this page):</p>
          <button
            onClick={refreshBlocks}
            className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 text-sm font-medium rounded-lg transition-all"
          >
            🔄 Refresh List
          </button>
        </div>
        
        {registeredBlocks.length === 0 ? (
          <p className="text-sm text-ink-muted italic">
            No blocks registered on this page. Visit a lesson page (Learn → Read) to see narration blocks.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {registeredBlocks.map((block) => (
              <div
                key={block.id}
                className={`p-2 rounded-lg text-xs font-mono ${
                  activeBlockId === block.id 
                    ? "bg-yellow-100 border border-yellow-300" 
                    : "bg-gray-50 border border-gray-200"
                }`}
              >
                <p className="font-bold text-ink">{block.id}</p>
                <p className="text-ink-muted truncate">{block.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test Narration Highlight */}
      <div className="border-t border-paper-line pt-4">
        <p className="text-sm font-medium text-ink mb-3">Test Narration Highlight:</p>
        <div className="space-y-3">
          <NarrationBlock
            id="debug-test-block-1"
            narrationText="This is a test narration block. When you click Listen, only this block should be highlighted with a yellow glow."
            showButton={true}
            buttonPosition="top-right"
            className="bg-blue-50 border border-blue-200 rounded-lg p-4"
          >
            <p className="text-blue-800 text-sm pr-20">
              <strong>Test Block 1:</strong> Click "Listen" to verify the highlight appears ONLY on this block.
            </p>
          </NarrationBlock>
          
          <NarrationBlock
            id="debug-test-block-2"
            narrationText="This is the second test block. The first block should NOT be highlighted when this one is playing."
            showButton={true}
            buttonPosition="top-right"
            className="bg-green-50 border border-green-200 rounded-lg p-4"
          >
            <p className="text-green-800 text-sm pr-20">
              <strong>Test Block 2:</strong> Playing this should highlight ONLY this block, not block 1.
            </p>
          </NarrationBlock>
        </div>
        <p className="text-xs text-ink-muted mt-2">
          ✅ Pass: Only one block highlights at a time. ❌ Fail: Multiple blocks highlight or no highlight appears.
        </p>
      </div>

      {/* Learn Cleanup Check */}
      <div className="border-t border-paper-line pt-4 mt-4">
        <p className="text-sm font-bold text-ink mb-3">🔍 Learn Page Cleanup Check:</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg text-center bg-green-50 border border-green-200">
            <p className="text-xs font-medium text-green-700">Learn analytics panels present?</p>
            <p className="text-lg font-bold text-green-600">NO ✓</p>
            <p className="text-xs text-green-600">Removed: Progress, Coach Notes, Efficiency</p>
          </div>
          <div className="p-3 rounded-lg text-center bg-green-50 border border-green-200">
            <p className="text-xs font-medium text-green-700">Narration changes text to white?</p>
            <p className="text-lg font-bold text-green-600">NO ✓</p>
            <p className="text-xs text-green-600">Uses ring/glow only, no bg change</p>
          </div>
        </div>
        <p className="text-xs text-ink-muted mt-3">
          <strong>How to verify:</strong><br/>
          1. Go to Learn → All analytics panels should be gone (link to Dashboard instead)<br/>
          2. Click Read on any topic → Click Listen on hero → Text remains readable (no white text)
        </p>
      </div>
    </div>
  );
}

export default function DebugPage() {
  const { user, loading } = useAuth();
  
  // Access control: show 404-style page if not allowed
  if (!isDebugPageEnabled()) {
    return (
      <div className="min-h-screen bg-paper-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-ink mb-4">404</h1>
          <p className="text-ink-muted mb-4">Page not found</p>
          <a href="/" className="text-blue-600 hover:underline">Go home</a>
        </div>
      </div>
    );
  }
  const { settings, updateSettings, playSuccess, playFail, playPerfect, celebrate } = useDelight();
  
  const [evaluateResult, setEvaluateResult] = useState<ApiResult | null>(null);
  const [evaluateLoading, setEvaluateLoading] = useState(false);
  
  const [diagnoseResult, setDiagnoseResult] = useState<ApiResult | null>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  
  const [supabaseResult, setSupabaseResult] = useState<SupabaseCheckResult | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(false);
  
  const [reviewErrorResult, setReviewErrorResult] = useState<ReviewErrorTestResult | null>(null);
  const [reviewErrorLoading, setReviewErrorLoading] = useState(false);
  
  const [statsPreview, setStatsPreview] = useState<StatsPreviewResult | null>(null);
  const [statsPreviewLoading, setStatsPreviewLoading] = useState(false);
  
  const [coachNotesResult, setCoachNotesResult] = useState<CoachNotesTestResult | null>(null);
  const [coachNotesLoading, setCoachNotesLoading] = useState(false);
  
  const [focusEfficiencyResult, setFocusEfficiencyResult] = useState<FocusEfficiencyTestResult | null>(null);
  const [focusEfficiencyLoading, setFocusEfficiencyLoading] = useState(false);
  
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  
  // TTS/Voice state
  const [ttsConfigured, setTtsConfigured] = useState<boolean | null>(null);
  const [ttsCheckLoading, setTtsCheckLoading] = useState(false);
  const [ttsTestPlaying, setTtsTestPlaying] = useState(false);
  const [ttsModelInfo, setTtsModelInfo] = useState<{
    defaultModel: string;
    fallbackModels: string[];
  } | null>(null);
  const [ttsTestResult, setTtsTestResult] = useState<{
    modelUsed?: string;
    languageCode?: string;
    fallbackUsed?: boolean;
    error?: string;
    success: boolean;
  } | null>(null);

  // Translation test state
  const [translationResult, setTranslationResult] = useState<TranslationTestResult | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [evaluateLanguageLoading, setEvaluateLanguageLoading] = useState(false);
  const [diagnoseLanguageLoading, setDiagnoseLanguageLoading] = useState(false);

  // Answer parsing test state
  const [formatTypoTestResult, setFormatTypoTestResult] = useState<{
    status: "idle" | "loading" | "pass" | "fail";
    errorClass?: string;
    reviewErrorType?: string;
    message?: string;
  }>({ status: "idle" });
  const [fractionSwapTestResult, setFractionSwapTestResult] = useState<{
    status: "idle" | "loading" | "pass" | "fail";
    topMisconceptionId?: string;
    confidence?: number;
    message?: string;
  }>({ status: "idle" });

  // Get translation hook
  const { t, language, setLanguage } = useTranslation();

  // Run evaluate test (misconception error)
  const runEvaluateTest = async () => {
    setEvaluateLoading(true);
    setEvaluateResult(null);
    
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: MISCONCEPTION_TEST.prompt,
          correct_answer: MISCONCEPTION_TEST.correct_answer,
          student_answer: MISCONCEPTION_TEST.wrong_answer,
          student_explanation: MISCONCEPTION_TEST.explanation,
        }),
      });
      
      const data = await response.json();
      
      setEvaluateResult({
        status: response.status,
        statusText: response.statusText,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      setEvaluateResult({
        status: 0,
        statusText: "Network Error",
        data: { error: error instanceof Error ? error.message : "Unknown error" },
        timestamp: new Date().toISOString(),
      });
    } finally {
      setEvaluateLoading(false);
    }
  };

  // Run FULL review error test: evaluate → save attempt → increment stats → verify
  const runReviewErrorTest = async () => {
    if (!user) {
      alert("Please sign in to run this test");
      return;
    }
    
    setReviewErrorLoading(true);
    setReviewErrorResult(null);
    
    const expectedStatId = `REVIEW:${REVIEW_ERROR_TEST.expected_review_type}`;
    
    try {
      // STEP 1: Get current stat count BEFORE
      let statCountBefore = 0;
      try {
        const stats = await getMisconceptionStats(user.id);
        const existingStat = stats.find(s => s.misconception_id === expectedStatId);
        statCountBefore = existingStat?.count || 0;
        console.log("[Debug] Stat count before:", expectedStatId, statCountBefore);
      } catch (e) {
        console.error("[Debug] Failed to get stats before:", e);
      }
      
      // STEP 2: Call /api/evaluate to get review error response
      const evalResponse = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: REVIEW_ERROR_TEST.prompt,
          correct_answer: REVIEW_ERROR_TEST.correct_answer,
          student_answer: REVIEW_ERROR_TEST.wrong_answer,
          student_explanation: REVIEW_ERROR_TEST.explanation,
        }),
      });
      
      const evalData = await evalResponse.json();
      console.log("[Debug] Evaluate response:", evalData);
      
      const apiResult: ApiResult = {
        status: evalResponse.status,
        statusText: evalResponse.statusText,
        data: evalData,
        timestamp: new Date().toISOString(),
      };
      
      // Extract error info from API response
      const errorClass: ErrorClass = evalData.error_class || "misconception_error";
      const reviewErrorType: ReviewErrorType | null = evalData.review_error_type || null;
      
      // STEP 3: Build and save attempt with metadata in JSONB
      const metadata: AttemptMetadata = {
        _metadata: true,
        error_class: errorClass,
        review_error_type: reviewErrorType,
      };
      
      const attemptData: AttemptInsert = {
        user_id: user.id,
        question_id: REVIEW_ERROR_TEST.id,
        topic: REVIEW_ERROR_TEST.topic,
        answer_text: REVIEW_ERROR_TEST.wrong_answer,
        explanation_text: REVIEW_ERROR_TEST.explanation,
        is_correct: evalData.is_correct || false,
        top_misconceptions: [metadata], // Metadata stored in JSONB
      };
      
      console.log("[Debug] Saving attempt with metadata:", metadata);
      const { data: savedAttempt, error: saveError } = await saveAttempt(attemptData);
      
      const attemptSaved = !saveError && !!savedAttempt;
      console.log("[Debug] Attempt saved:", attemptSaved, savedAttempt?.id);
      
      // STEP 4: Increment stats if this is a review error
      let statIncremented = false;
      const actualStatId = reviewErrorType ? `REVIEW:${reviewErrorType}` : expectedStatId;
      
      if (errorClass === "review_error" && reviewErrorType) {
        console.log("[Debug] Incrementing stat for:", actualStatId);
        const { error: statError } = await incrementMisconceptionStat(user.id, actualStatId);
        statIncremented = !statError;
        if (statError) {
          console.error("[Debug] Failed to increment stat:", statError);
        }
      }
      
      // STEP 5: Get stat count AFTER
      let statCountAfter = statCountBefore;
      try {
        const statsAfter = await getMisconceptionStats(user.id);
        const updatedStat = statsAfter.find(s => s.misconception_id === actualStatId);
        statCountAfter = updatedStat?.count || 0;
        console.log("[Debug] Stat count after:", actualStatId, statCountAfter);
      } catch (e) {
        console.error("[Debug] Failed to get stats after:", e);
      }
      
      // STEP 6: Read back the saved attempt to verify metadata
      let savedMetadata: { error_class: string; review_error_type: string | null } | undefined;
      if (savedAttempt) {
        const extractedMeta = extractAttemptMetadata(savedAttempt.top_misconceptions);
        if (extractedMeta) {
          savedMetadata = {
            error_class: extractedMeta.error_class,
            review_error_type: extractedMeta.review_error_type,
          };
        }
      }
      
      setReviewErrorResult({
        evaluateResponse: apiResult,
        attemptSaved,
        attemptId: savedAttempt?.id,
        statIncremented,
        statId: actualStatId,
        statCountBefore,
        statCountAfter,
        savedMetadata,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      console.error("[Debug] Review error test failed:", error);
      setReviewErrorResult({
        evaluateResponse: {
          status: 0,
          statusText: "Error",
          data: { error: error instanceof Error ? error.message : "Unknown error" },
          timestamp: new Date().toISOString(),
        },
        attemptSaved: false,
        statIncremented: false,
        statId: expectedStatId,
        statCountBefore: 0,
        statCountAfter: 0,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setReviewErrorLoading(false);
    }
  };

  // Run diagnose test
  const runDiagnoseTest = async () => {
    setDiagnoseLoading(true);
    setDiagnoseResult(null);
    
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: MISCONCEPTION_TEST.prompt,
          correct_answer: MISCONCEPTION_TEST.correct_answer,
          student_answer: MISCONCEPTION_TEST.wrong_answer,
          student_explanation: MISCONCEPTION_TEST.explanation,
          topic: MISCONCEPTION_TEST.topic,
          candidate_misconception_ids: MISCONCEPTION_TEST.candidate_misconception_ids,
        }),
      });
      
      const data = await response.json();
      
      setDiagnoseResult({
        status: response.status,
        statusText: response.statusText,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      setDiagnoseResult({
        status: 0,
        statusText: "Network Error",
        data: { error: error instanceof Error ? error.message : "Unknown error" },
        timestamp: new Date().toISOString(),
      });
    } finally {
      setDiagnoseLoading(false);
    }
  };

  // Check Supabase writes - also shows metadata from attempts
  const checkSupabaseWrites = async () => {
    if (!user) {
      setSupabaseResult({
        attemptCount: 0,
        newestAttempt: null,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    setSupabaseLoading(true);
    setSupabaseResult(null);
    
    try {
      const attempts = await getRecentAttempts(user.id, 100);
      
      let newestAttempt = null;
      if (attempts.length > 0) {
        const newest = attempts[0];
        const metadata = extractAttemptMetadata(newest.top_misconceptions);
        newestAttempt = {
          id: newest.id,
          topic: newest.topic,
          is_correct: newest.is_correct,
          created_at: newest.created_at,
          error_class: metadata?.error_class,
          review_error_type: metadata?.review_error_type,
        };
      }
      
      setSupabaseResult({
        attemptCount: attempts.length,
        newestAttempt,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Debug] Supabase check error:", error);
      setSupabaseResult({
        attemptCount: -1,
        newestAttempt: null,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setSupabaseLoading(false);
    }
  };

  // Fetch stats preview - shows top REVIEW:* and misconception stats
  const fetchStatsPreview = async () => {
    if (!user) {
      return;
    }
    
    setStatsPreviewLoading(true);
    setStatsPreview(null);
    
    try {
      const allStats = await getMisconceptionStats(user.id);
      
      // Split into review errors (REVIEW:*) and misconceptions
      const reviewErrorStats = allStats
        .filter(s => s.misconception_id.startsWith("REVIEW:"))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(s => ({
          id: s.misconception_id,
          count: s.count,
          last_seen_at: s.last_seen_at,
        }));
      
      const misconceptionStats = allStats
        .filter(s => !s.misconception_id.startsWith("REVIEW:") && !s.misconception_id.startsWith("CARELESS_"))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(s => ({
          id: s.misconception_id,
          count: s.count,
          last_seen_at: s.last_seen_at,
        }));
      
      setStatsPreview({
        reviewErrorStats,
        misconceptionStats,
        timestamp: new Date().toISOString(),
      });
      
      console.log("[Debug] Stats preview:", { reviewErrorStats, misconceptionStats });
    } catch (error) {
      console.error("[Debug] Failed to fetch stats preview:", error);
    } finally {
      setStatsPreviewLoading(false);
    }
  };

  // Run COACH NOTES test: evaluate with detailed explanation → save attempt → verify coach_notes persisted
  const runCoachNotesTest = async () => {
    if (!user) {
      alert("Please sign in to run this test");
      return;
    }
    
    setCoachNotesLoading(true);
    setCoachNotesResult(null);
    
    try {
      // STEP 1: Call /api/evaluate with detailed explanation
      console.log("[Debug] Running Coach Notes test with explanation:", COACH_NOTES_TEST.explanation);
      
      const evalResponse = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: COACH_NOTES_TEST.prompt,
          correct_answer: COACH_NOTES_TEST.correct_answer,
          student_answer: COACH_NOTES_TEST.wrong_answer,
          student_explanation: COACH_NOTES_TEST.explanation,
        }),
      });
      
      const evalData = await evalResponse.json();
      console.log("[Debug] Evaluate response:", evalData);
      
      const apiResult: ApiResult = {
        status: evalResponse.status,
        statusText: evalResponse.statusText,
        data: evalData,
        timestamp: new Date().toISOString(),
      };
      
      // Extract coach_notes from API response
      const coachNotesReturned = evalData.coach_notes || null;
      
      // STEP 2: Build and save attempt with coach_notes
      const errorClass: ErrorClass = evalData.error_class || "misconception_error";
      const reviewErrorType: ReviewErrorType | null = evalData.review_error_type || null;
      
      const metadata: AttemptMetadata = {
        _metadata: true,
        error_class: errorClass,
        review_error_type: reviewErrorType,
        coach_notes: coachNotesReturned,
      };
      
      const attemptData: AttemptInsert = {
        user_id: user.id,
        question_id: `coach-test-${Date.now()}`, // Unique ID for each test
        topic: COACH_NOTES_TEST.topic,
        answer_text: COACH_NOTES_TEST.wrong_answer,
        explanation_text: COACH_NOTES_TEST.explanation,
        is_correct: evalData.is_correct || false,
        top_misconceptions: [metadata],
      };
      
      console.log("[Debug] Saving attempt with coach_notes:", metadata.coach_notes);
      const { data: savedAttempt, error: saveError } = await saveAttempt(attemptData);
      
      const attemptSaved = !saveError && !!savedAttempt;
      console.log("[Debug] Attempt saved:", attemptSaved, savedAttempt?.id);
      
      // STEP 3: Read back the saved attempt to verify coach_notes persisted
      let persistedCoachNotes = null;
      let isPersisted = false;
      
      if (savedAttempt) {
        const extractedMeta = extractAttemptMetadata(savedAttempt.top_misconceptions);
        if (extractedMeta?.coach_notes) {
          persistedCoachNotes = {
            what_went_well: extractedMeta.coach_notes.what_went_well || [],
            what_to_fix: extractedMeta.coach_notes.what_to_fix || [],
            remember: extractedMeta.coach_notes.remember || "",
            next_step: extractedMeta.coach_notes.next_step || "",
          };
          isPersisted = true;
        }
      }
      
      console.log("[Debug] Coach notes persisted:", isPersisted, persistedCoachNotes);
      
      setCoachNotesResult({
        evaluateResponse: apiResult,
        coachNotesReturned: coachNotesReturned ? {
          what_went_well: coachNotesReturned.what_went_well || [],
          what_to_fix: coachNotesReturned.what_to_fix || [],
          remember: coachNotesReturned.remember || "",
          next_step: coachNotesReturned.next_step || "",
        } : null,
        attemptSaved,
        attemptId: savedAttempt?.id,
        persistedCoachNotes,
        isPersisted,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      console.error("[Debug] Coach Notes test failed:", error);
      setCoachNotesResult({
        evaluateResponse: {
          status: 0,
          statusText: "Error",
          data: { error: error instanceof Error ? error.message : "Unknown error" },
          timestamp: new Date().toISOString(),
        },
        coachNotesReturned: null,
        attemptSaved: false,
        persistedCoachNotes: null,
        isPersisted: false,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setCoachNotesLoading(false);
    }
  };

  // Run FOCUS EFFICIENCY test: simulate a focus mode attempt → save → compute rating
  const runFocusEfficiencyTest = async () => {
    if (!user) {
      alert("Please sign in to run this test");
      return;
    }
    
    setFocusEfficiencyLoading(true);
    setFocusEfficiencyResult(null);
    
    try {
      // STEP 1: Build focus metadata (simulating a focus mode attempt)
      const focusMeta: FocusMeta = {
        enabled: true,
        time_ms: FOCUS_MODE_TEST.simulated_time_ms,
        pauses: 0,
        nudges: 0,
      };
      
      // STEP 2: Build and save attempt with focus metadata
      const metadata: AttemptMetadata = {
        _metadata: true,
        error_class: "correct",
        review_error_type: null,
        focus: focusMeta,
      };
      
      const attemptData: AttemptInsert = {
        user_id: user.id,
        question_id: `focus-test-${Date.now()}`,
        topic: FOCUS_MODE_TEST.topic,
        answer_text: FOCUS_MODE_TEST.answer,
        explanation_text: FOCUS_MODE_TEST.explanation,
        is_correct: true,
        top_misconceptions: [metadata],
      };
      
      console.log("[Debug] Saving focus mode attempt:", focusMeta);
      const { data: savedAttempt, error: saveError } = await saveAttempt(attemptData);
      
      const attemptSaved = !saveError && !!savedAttempt;
      console.log("[Debug] Focus attempt saved:", attemptSaved, savedAttempt?.id);
      
      // STEP 3: Fetch recent attempts to compute efficiency
      const recentAttempts = await getRecentAttempts(user.id, 30);
      
      // STEP 4: Extract focus attempts and compute efficiency
      const focusAttempts: FocusAttempt[] = [];
      for (const attempt of recentAttempts) {
        const meta = extractAttemptMetadata(attempt.top_misconceptions);
        if (meta?.focus?.enabled) {
          focusAttempts.push({
            isCorrect: attempt.is_correct,
            timeMs: meta.focus.time_ms,
            nudges: meta.focus.nudges,
            topic: attempt.topic,
          });
        }
      }
      
      // Compute rating (reverse for chronological order)
      const rating = computeEfficiencyRating([...focusAttempts.slice(0, 20)].reverse());
      const { label, emoji } = getEfficiencyLabel(rating);
      const avgTime = computeAverageFocusTime(focusAttempts.slice(0, 10));
      
      console.log("[Debug] Focus efficiency computed:", { rating, label, focusAttemptCount: focusAttempts.length });
      
      // STEP 5: Extract the saved focus meta to verify
      let savedFocusMeta: FocusMeta | null = null;
      if (savedAttempt) {
        const extractedMeta = extractAttemptMetadata(savedAttempt.top_misconceptions);
        if (extractedMeta?.focus) {
          savedFocusMeta = extractedMeta.focus;
        }
      }
      
      setFocusEfficiencyResult({
        attemptSaved,
        attemptId: savedAttempt?.id,
        focusMeta: savedFocusMeta,
        rating,
        label,
        emoji,
        avgTime,
        focusAttemptCount: focusAttempts.length,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      console.error("[Debug] Focus Efficiency test failed:", error);
      setFocusEfficiencyResult({
        attemptSaved: false,
        focusMeta: null,
        rating: 50,
        label: "Error",
        emoji: "❌",
        avgTime: null,
        focusAttemptCount: 0,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setFocusEfficiencyLoading(false);
    }
  };

  // Check if TTS is configured
  const checkTtsConfig = async () => {
    setTtsCheckLoading(true);
    try {
      const response = await fetch("/api/tts");
      const data = await response.json();
      setTtsConfigured(data.configured);
      setTtsModelInfo({
        defaultModel: data.defaultModel || "eleven_multilingual_v2",
        fallbackModels: data.fallbackModels || [],
      });
    } catch (error) {
      console.error("[Debug] Failed to check TTS config:", error);
      setTtsConfigured(false);
    } finally {
      setTtsCheckLoading(false);
    }
  };
  
  // Test TTS with model tracking - uses current UI language
  const testTtsWithModelTracking = async () => {
    setTtsTestResult(null);
    setTtsTestPlaying(true);
    
    // Test phrases in different languages
    const testPhrases: Record<string, string> = {
      en: "Hello! I'm your Misconception Mentor. Let's learn math together!",
      es: "¡Hola! Soy tu Mentor de Conceptos Erróneos. ¡Aprendamos matemáticas juntos!",
      fr: "Bonjour! Je suis ton Mentor des Erreurs. Apprenons les maths ensemble!",
      zh_hans: "你好！我是你的错误概念导师。让我们一起学习数学吧！",
      hi_latn: "Namaste! Main tumhara Misconception Mentor hoon. Chalo math seekhte hain!",
    };
    
    const testText = testPhrases[language] || testPhrases.en;
    
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: testText,
          language, // Pass current UI language
        }),
      });
      
      // Get model and language info from headers
      const modelUsed = response.headers.get("X-TTS-Model") || undefined;
      const languageCode = response.headers.get("X-TTS-Language") || undefined;
      const fallbackUsed = response.headers.get("X-TTS-Fallback") === "true";
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        setTtsTestResult({
          success: false,
          error: errorData.error,
          modelUsed,
          languageCode,
          fallbackUsed,
        });
        setTtsTestPlaying(false);
        return;
      }
      
      // Play the audio
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setTtsTestPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = () => {
        setTtsTestPlaying(false);
        URL.revokeObjectURL(audioUrl);
        setTtsTestResult({
          success: false,
          error: "Audio playback failed",
          modelUsed,
          languageCode,
          fallbackUsed,
        });
      };
      
      setTtsTestResult({
        success: true,
        modelUsed,
        languageCode,
        fallbackUsed,
      });
      
      await audio.play();
      
    } catch (error) {
      setTtsTestResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      setTtsTestPlaying(false);
    }
  };

  // Run translation coverage test
  const runTranslationTest = async () => {
    setTranslationLoading(true);
    
    // Get 10 sample UI keys with their translations
    const sampleKeys = [
      { key: "common.learn", value: t("common.learn") },
      { key: "common.practice", value: t("common.practice") },
      { key: "common.dashboard", value: t("common.dashboard") },
      { key: "common.settings", value: t("common.settings") },
      { key: "practice.yourAnswer", value: t("practice.yourAnswer") },
      { key: "practice.check", value: t("practice.check") },
      { key: "feedback.keyTakeaway", value: t("feedback.keyTakeaway") },
      { key: "coachNotes.title", value: t("coachNotes.title") },
      { key: "learn.readyToPractice", value: t("learn.readyToPractice") },
      { key: "dashboard.yourProgress", value: t("dashboard.yourProgress") },
    ];
    
    // Get example lesson block (fractions topic)
    let lessonBlock = null;
    try {
      const res = await fetch(`/api/lesson-preview?topic=fractions&language=${language}`);
      if (res.ok) {
        const data = await res.json();
        lessonBlock = {
          title: data.title || "—",
          overview: data.overview || "—",
          mascotCatchphrase: data.mascot?.catchphrase || "—",
        };
      }
    } catch (err) {
      console.error("Failed to load lesson preview:", err);
    }
    
    setTranslationResult({
      language,
      languageName: LANGUAGE_NAMES[language as keyof typeof LANGUAGE_NAMES] || language,
      uiKeys: sampleKeys,
      lessonBlock,
      evaluateResult: null,
      diagnoseResult: null,
      timestamp: new Date().toISOString(),
    });
    
    setTranslationLoading(false);
  };

  // Test evaluate API with language
  const runEvaluateLanguageTest = async () => {
    setEvaluateLanguageLoading(true);
    
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: "What is 1/2 + 1/4?",
          correct_answer: "3/4",
          student_answer: "2/6",
          student_explanation: "I added the tops and bottoms",
          language,
        }),
      });
      
      const data = await response.json();
      
      // Detect language from API response (extracts only string values, not keys)
      const detection = detectLanguageFromResponse(data);
      const isInTargetLanguage = isTargetLanguageMatch(detection, language);
      
      setTranslationResult(prev => prev ? {
        ...prev,
        evaluateResult: {
          shortFeedback: data.short_feedback || "",
          isInTargetLanguage,
          detection,
          timestamp: new Date().toISOString(),
        },
      } : null);
      
    } catch (error) {
      console.error("Evaluate language test failed:", error);
    } finally {
      setEvaluateLanguageLoading(false);
    }
  };

  // Test diagnose API with language
  const runDiagnoseLanguageTest = async () => {
    setDiagnoseLanguageLoading(true);
    
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: "What is 1/2 + 1/4?",
          correct_answer: "3/4",
          student_answer: "2/6",
          student_explanation: "I added the tops and bottoms",
          topic: "fractions",
          candidate_misconception_ids: ["FRAC-01", "FRAC-02", "FRAC-03"],
          language,
        }),
      });
      
      const data = await response.json();
      
      // Check for error response
      if (!response.ok || data.error) {
        setTranslationResult(prev => prev ? {
          ...prev,
          diagnoseResult: {
            keyTakeaway: "",
            remediation: "",
            teachBackPrompt: "",
            isInTargetLanguage: false,
            detection: { tag: "unknown", confidence: 0, label: "Error", notes: data.error || `HTTP ${response.status}` },
            status: "error",
            statusDetails: data.error || `HTTP ${response.status}`,
            timestamp: new Date().toISOString(),
          },
        } : null);
        return;
      }
      
      const keyTakeaway = data.key_takeaway || "";
      const remediation = data.top_3?.[0]?.remediation || "";
      const teachBackPrompt = data.teach_back_prompt || "";
      
      // Get status from _meta
      const meta = data._meta || {};
      let status: "ok" | "retried" | "fallback" | "error" = "ok";
      let statusDetails = "";
      
      if (meta.status === "fallback") {
        status = "fallback";
        statusDetails = meta.error || "AI failed, using fallback";
      } else if (meta.retried) {
        status = "retried";
        statusDetails = `Original language ${meta.originalLanguage} failed, succeeded with English`;
      } else if (meta.status === "demo") {
        status = "ok";
        statusDetails = "Demo mode";
      }
      
      // Detect language from API response (extracts only string values, not keys)
      const detection = detectLanguageFromResponse(data);
      const isInTargetLanguage = isTargetLanguageMatch(detection, language) || status === "fallback";
      
      setTranslationResult(prev => prev ? {
        ...prev,
        diagnoseResult: {
          keyTakeaway,
          remediation,
          teachBackPrompt,
          isInTargetLanguage,
          detection,
          status,
          statusDetails,
          timestamp: new Date().toISOString(),
        },
      } : null);
      
    } catch (error) {
      console.error("Diagnose language test failed:", error);
      setTranslationResult(prev => prev ? {
        ...prev,
        diagnoseResult: {
          keyTakeaway: "",
          remediation: "",
          teachBackPrompt: "",
          isInTargetLanguage: false,
          detection: { tag: "unknown", confidence: 0, label: "Error", notes: error instanceof Error ? error.message : "Network error" },
          status: "error",
          statusDetails: error instanceof Error ? error.message : "Network error",
          timestamp: new Date().toISOString(),
        },
      } : null);
    } finally {
      setDiagnoseLanguageLoading(false);
    }
  };

  // Test format typo detection (e.g., "5/")
  const runFormatTypoTest = async () => {
    setFormatTypoTestResult({ status: "loading" });
    
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: "What is 1/2 + 1/4?",
          correct_answer: "3/4",
          student_answer: "5/", // Malformed fraction
          student_explanation: "",
        }),
      });
      
      const data = await response.json();
      
      const isPass = data.error_class === "review_error" && data.review_error_type === "format_typo";
      
      setFormatTypoTestResult({
        status: isPass ? "pass" : "fail",
        errorClass: data.error_class,
        reviewErrorType: data.review_error_type,
        message: isPass 
          ? "✓ Correctly detected format_typo review error"
          : `✗ Expected review_error/format_typo but got ${data.error_class}/${data.review_error_type || "null"}`,
      });
      
      // Increment stat if pass
      if (isPass && user) {
        await incrementMisconceptionStat(user.id, "REVIEW:format_typo");
      }
    } catch (error) {
      setFormatTypoTestResult({
        status: "fail",
        message: `Error: ${error instanceof Error ? error.message : "Unknown"}`,
      });
    }
  };

  // Test fraction swap detection (e.g., 4/3 vs 3/4)
  const runFractionSwapTest = async () => {
    setFractionSwapTestResult({ status: "loading" });
    
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: "Simplify 3/4",
          correct_answer: "3/4",
          student_answer: "4/3", // Swapped numerator/denominator
          student_explanation: "I put the bigger number on top",
          topic: "fractions",
          candidate_misconception_ids: ["FRAC-01", "FRAC-02", "FRAC-03", "FRAC-SWAP"],
        }),
      });
      
      const data = await response.json();
      
      const topMisconception = data.top_3?.[0];
      const isPass = topMisconception?.id === "FRAC-SWAP" && topMisconception?.confidence >= 0.9;
      
      setFractionSwapTestResult({
        status: isPass ? "pass" : "fail",
        topMisconceptionId: topMisconception?.id,
        confidence: topMisconception?.confidence,
        message: isPass 
          ? `✓ FRAC-SWAP detected as top misconception with ${(topMisconception.confidence * 100).toFixed(0)}% confidence`
          : `✗ Expected FRAC-SWAP as top but got ${topMisconception?.id} (${((topMisconception?.confidence || 0) * 100).toFixed(0)}%)`,
      });
    } catch (error) {
      setFractionSwapTestResult({
        status: "fail",
        message: `Error: ${error instanceof Error ? error.message : "Unknown"}`,
      });
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (data: unknown, label: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopyFeedback(`${label} copied!`);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (error) {
      setCopyFeedback("Copy failed");
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-paper-bg p-6">
      <div className="max-w-4xl mx-auto">
        {/* Warning banner */}
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span className="text-amber-800 font-medium">Debug page (dev only)</span>
          </div>
        </div>

        {/* Header */}
        <h1 className="text-2xl font-bold text-ink mb-6">API Debug Console</h1>

        {/* Auth Status */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
          <h2 className="font-semibold text-ink mb-3">Auth Status</h2>
          {loading ? (
            <p className="text-ink-muted">Loading...</p>
          ) : user ? (
            <div className="space-y-1">
              <p className="text-green-700 font-medium">✓ Signed in</p>
              <p className="text-sm text-ink-muted">
                <strong>Email:</strong> {maskEmail(user.email)}
              </p>
              <p className="text-sm text-ink-muted font-mono text-xs">
                <strong>User ID:</strong> {maskUserId(user.id)}
              </p>
            </div>
          ) : (
            <p className="text-pink-700 font-medium">✗ Not signed in</p>
          )}
        </div>

        {/* Delight Mode Settings & SFX Test */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
          <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="text-lg">🎵</span>
            Delight Mode (Sound & Celebrations)
          </h2>
          
          {/* Current Settings Display */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className={`p-3 rounded-lg ${settings.soundEnabled ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`}>
              <p className="text-sm font-medium flex items-center gap-2">
                <span>🔊</span>
                Sound Effects
              </p>
              <p className={`text-lg font-bold ${settings.soundEnabled ? "text-green-700" : "text-gray-500"}`}>
                {settings.soundEnabled ? "ON" : "OFF"}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${settings.celebrationsEnabled ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`}>
              <p className="text-sm font-medium flex items-center gap-2">
                <span>🎉</span>
                Celebrations
              </p>
              <p className={`text-lg font-bold ${settings.celebrationsEnabled ? "text-green-700" : "text-gray-500"}`}>
                {settings.celebrationsEnabled ? "ON" : "OFF"}
              </p>
            </div>
          </div>

          {/* Quick Toggles */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                settings.soundEnabled 
                  ? "bg-green-100 text-green-800 hover:bg-green-200" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {settings.soundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF"}
            </button>
            <button
              onClick={() => updateSettings({ celebrationsEnabled: !settings.celebrationsEnabled })}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                settings.celebrationsEnabled 
                  ? "bg-green-100 text-green-800 hover:bg-green-200" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {settings.celebrationsEnabled ? "🎉 Celebrations ON" : "🚫 Celebrations OFF"}
            </button>
          </div>

          {/* SFX Test Buttons */}
          <div className="border-t border-paper-line pt-4">
            <p className="text-sm font-medium text-ink mb-3">Test Sound Effects:</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => playSuccess()}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-all"
              >
                ✅ Test Success SFX
              </button>
              <button
                onClick={() => playFail()}
                className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-lg transition-all"
              >
                ❌ Test Fail SFX
              </button>
              <button
                onClick={() => playPerfect()}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-all"
              >
                🏆 Test Perfect SFX
              </button>
              <button
                onClick={() => {
                  if (settings.celebrationsEnabled) {
                    fireConfetti();
                  } else {
                    alert("Celebrations are OFF. Enable them to see confetti!");
                  }
                }}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-all"
              >
                🎊 Test Confetti
              </button>
            </div>
            <p className="text-xs text-ink-muted mt-2">
              Note: Sounds only play when Sound Effects is ON. Confetti only shows when Celebrations is ON.
            </p>
          </div>
        </div>

        {/* Focus Mode Settings */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
          <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="text-lg">⏱️</span>
            Focus Mode (Timer + Efficiency)
          </h2>
          
          {/* Current State Display */}
          <div className={`p-4 rounded-lg mb-4 ${settings.focusModeEnabled ? "bg-blue-50 border border-blue-200" : "bg-gray-50 border border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${settings.focusModeEnabled ? "bg-blue-500 animate-pulse" : "bg-gray-400"}`} />
                  Focus Mode
                </p>
                <p className={`text-2xl font-bold ${settings.focusModeEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {settings.focusModeEnabled ? "ON" : "OFF"}
                </p>
              </div>
              <button
                onClick={() => updateSettings({ focusModeEnabled: !settings.focusModeEnabled })}
                className={`px-4 py-2 font-medium rounded-lg transition-all ${
                  settings.focusModeEnabled 
                    ? "bg-blue-500 text-white hover:bg-blue-600" 
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {settings.focusModeEnabled ? "Turn OFF" : "Turn ON"}
              </button>
            </div>
          </div>

          {/* localStorage Value */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <p className="text-xs font-medium text-ink-muted mb-1">localStorage key: <code className="bg-gray-200 px-1 rounded">mm_delight_settings</code></p>
            <pre className="text-xs font-mono text-ink overflow-x-auto">
              {JSON.stringify({ focusModeEnabled: settings.focusModeEnabled, soundEnabled: settings.soundEnabled, celebrationsEnabled: settings.celebrationsEnabled }, null, 2)}
            </pre>
          </div>

          {/* Explanation */}
          <div className="mt-3 text-xs text-ink-muted">
            <p>💡 Focus Mode tracks time spent on each question and calculates an efficiency score.</p>
            <p>Toggle visible in the header and on practice question pages.</p>
          </div>
        </div>

        {/* ElevenLabs Voice Test */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark mb-6">
          <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="text-lg">🎤</span>
            ElevenLabs Voice (TTS)
          </h2>
          
          {/* API Key + Model Status */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <button
                onClick={checkTtsConfig}
                disabled={ttsCheckLoading}
                className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
              >
                {ttsCheckLoading ? "Checking..." : "Check API Config"}
              </button>
              {ttsConfigured !== null && (
                <span className={`text-sm font-medium ${ttsConfigured ? "text-green-700" : "text-red-700"}`}>
                  API Key: {ttsConfigured ? "✓ Configured" : "✗ Not configured"}
                </span>
              )}
            </div>
            {ttsModelInfo && (
              <div className="text-xs text-ink-muted space-y-1 bg-gray-50 p-2 rounded-lg">
                <p><strong>Default Model:</strong> <code className="bg-gray-200 px-1 rounded">{ttsModelInfo.defaultModel}</code></p>
                <p><strong>Fallback Models:</strong> {ttsModelInfo.fallbackModels.join(" → ")}</p>
              </div>
            )}
          </div>

          {/* Voice Settings Display */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className={`p-3 rounded-lg text-center ${settings.voiceEnabled ? "bg-purple-50 border border-purple-200" : "bg-gray-50 border border-gray-200"}`}>
              <p className="text-xs font-medium text-ink-muted">Voice Narration</p>
              <p className={`text-sm font-bold ${settings.voiceEnabled ? "text-purple-700" : "text-gray-500"}`}>
                {settings.voiceEnabled ? "ON" : "OFF"}
              </p>
            </div>
            <div className={`p-3 rounded-lg text-center ${settings.autoReadFeedback ? "bg-purple-50 border border-purple-200" : "bg-gray-50 border border-gray-200"}`}>
              <p className="text-xs font-medium text-ink-muted">Auto-Read Feedback</p>
              <p className={`text-sm font-bold ${settings.autoReadFeedback ? "text-purple-700" : "text-gray-500"}`}>
                {settings.autoReadFeedback ? "ON" : "OFF"}
              </p>
            </div>
            <div className={`p-3 rounded-lg text-center ${settings.showReadAloudButtons ? "bg-purple-50 border border-purple-200" : "bg-gray-50 border border-gray-200"}`}>
              <p className="text-xs font-medium text-ink-muted">Read-Aloud Buttons</p>
              <p className={`text-sm font-bold ${settings.showReadAloudButtons ? "text-purple-700" : "text-gray-500"}`}>
                {settings.showReadAloudButtons ? "ON" : "OFF"}
              </p>
            </div>
          </div>

          {/* Quick Toggles */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => updateSettings({ voiceEnabled: !settings.voiceEnabled })}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                settings.voiceEnabled 
                  ? "bg-purple-500 text-white hover:bg-purple-600" 
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {settings.voiceEnabled ? "🔈 Voice ON" : "🔇 Voice OFF"}
            </button>
            <button
              onClick={() => updateSettings({ autoReadFeedback: !settings.autoReadFeedback })}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                settings.autoReadFeedback 
                  ? "bg-purple-400 text-white hover:bg-purple-500" 
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {settings.autoReadFeedback ? "🔊 Auto-Read ON" : "🔇 Auto-Read OFF"}
            </button>
            <button
              onClick={() => updateSettings({ showReadAloudButtons: !settings.showReadAloudButtons })}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                settings.showReadAloudButtons 
                  ? "bg-purple-400 text-white hover:bg-purple-500" 
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {settings.showReadAloudButtons ? "📖 Buttons ON" : "📖 Buttons OFF"}
            </button>
          </div>

          {/* Test Voice with Model Tracking */}
          <div className="border-t border-paper-line pt-4">
            <p className="text-sm font-medium text-ink mb-3">
              Test ElevenLabs Voice in Current Language: 
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                {LANGUAGE_NAMES[language as keyof typeof LANGUAGE_NAMES] || language}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <button
                onClick={testTtsWithModelTracking}
                disabled={ttsTestPlaying}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                  ttsTestPlaying
                    ? "bg-purple-300 text-purple-700 cursor-not-allowed"
                    : "bg-purple-500 hover:bg-purple-600 text-white"
                }`}
              >
                {ttsTestPlaying ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Playing...
                  </>
                ) : (
                  <>🔊 Test TTS in {language.toUpperCase()}</>
                )}
              </button>
              {ttsTestPlaying && (
                <button
                  onClick={() => {
                    stopGlobalAudio();
                    setTtsTestPlaying(false);
                  }}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-all"
                >
                  ⏹️ Stop
                </button>
              )}
            </div>
            
            {/* Test Result Display */}
            {ttsTestResult && (
              <div className={`p-3 rounded-lg text-sm ${
                ttsTestResult.success 
                  ? "bg-green-50 border border-green-200" 
                  : "bg-red-50 border border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`font-bold ${ttsTestResult.success ? "text-green-700" : "text-red-700"}`}>
                    {ttsTestResult.success ? "✓ SUCCESS" : "✗ FAILED"}
                  </span>
                  {/* Warn if using English-only model */}
                  {ttsTestResult.modelUsed === "eleven_flash_v2" && (
                    <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">
                      ⚠️ English-only model!
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {ttsTestResult.modelUsed && (
                    <div className="bg-white rounded p-2 border border-gray-200">
                      <p className="text-gray-500">Model</p>
                      <code className={`font-bold ${
                        ttsTestResult.modelUsed === "eleven_flash_v2" 
                          ? "text-red-600" 
                          : "text-green-600"
                      }`}>
                        {ttsTestResult.modelUsed}
                      </code>
                      {ttsTestResult.fallbackUsed && (
                        <span className="ml-1 text-amber-600">(fallback)</span>
                      )}
                    </div>
                  )}
                  {ttsTestResult.languageCode && (
                    <div className="bg-white rounded p-2 border border-gray-200">
                      <p className="text-gray-500">Language Code</p>
                      <code className="font-bold text-blue-600">{ttsTestResult.languageCode}</code>
                      <span className="ml-1 text-gray-500">(UI: {language})</span>
                    </div>
                  )}
                </div>
                {ttsTestResult.error && (
                  <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded">
                    <strong>Error:</strong> {ttsTestResult.error}
                  </p>
                )}
              </div>
            )}
            
            <p className="text-xs text-ink-muted mt-2">
              Uses multilingual models (eleven_flash_v2_5 or eleven_multilingual_v2). Falls back to browser TTS if ElevenLabs fails.
            </p>
          </div>
        </div>

        {/* Speech-to-Text (STT) Language Test */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-teal-300 mb-6">
          <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="text-lg">🎤</span>
            Speech-to-Text (STT) Language
          </h2>
          
          {/* Current STT Language */}
          <div className="bg-teal-50 rounded-lg p-4 border border-teal-200 mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-teal-600 font-medium">UI Language</p>
                <p className="text-lg font-bold text-teal-900">
                  {LANGUAGE_NAMES[language as keyof typeof LANGUAGE_NAMES] || language}
                </p>
                <code className="text-xs text-teal-700">{language}</code>
              </div>
              <div>
                <p className="text-xs text-teal-600 font-medium">SpeechRecognition.lang</p>
                <p className="text-lg font-bold text-teal-900 font-mono">
                  {STT_LANGUAGE_MAP[language as keyof typeof STT_LANGUAGE_MAP] || "en-US"}
                </p>
                <code className="text-xs text-teal-700">BCP-47</code>
              </div>
            </div>
          </div>

          {/* Language mapping table */}
          <div className="mb-4">
            <p className="text-sm font-medium text-ink mb-2">Language Code Mapping:</p>
            <div className="grid grid-cols-5 gap-2 text-xs">
              {Object.entries(STT_LANGUAGE_MAP).map(([ui, stt]) => (
                <div 
                  key={ui} 
                  className={`p-2 rounded border text-center ${
                    language === ui 
                      ? "bg-teal-100 border-teal-400" 
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <p className="font-bold">{ui}</p>
                  <p className="text-gray-600">→ {stt}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Browser support check */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">
                {typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition) 
                  ? "✅" 
                  : "❌"}
              </span>
              <span className="font-medium text-sm">
                SpeechRecognition API: {typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition) 
                  ? "Supported" 
                  : "Not Supported"}
              </span>
            </div>
            <p className="text-xs text-gray-600">
              {language === "hi_latn" && (
                <span className="text-amber-600">
                  ⚠️ Hindi (hi-IN) may output Devanagari script. Roman transliteration requires post-processing.
                </span>
              )}
              {language !== "hi_latn" && (
                "Speech recognition uses the browser's built-in engine. Results depend on browser support for each language."
              )}
            </p>
          </div>

          {/* Test instructions */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>To test:</strong> Go to Practice → answer a question → use "Speak" mode in the explanation field → speak in {LANGUAGE_NAMES[language as keyof typeof LANGUAGE_NAMES] || "selected language"}.
            </p>
          </div>
        </div>

        {/* Focus Mode Keyboard Flow Test */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-cyan-300 mb-6">
          <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="text-lg">⌨️</span>
            Focus Mode Keyboard Flow
          </h2>
          
          <p className="text-sm text-ink-muted mb-4">
            Manual checklist for keyboard navigation in Focus Mode.
          </p>
          
          <div className="space-y-3">
            {/* Checklist items */}
            <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-200">
              <p className="text-sm font-medium text-cyan-800 mb-3">Test Steps:</p>
              <ol className="text-sm text-cyan-700 space-y-2 list-decimal list-inside">
                <li>Go to Practice → any topic</li>
                <li>Enable Focus Mode (toggle in header)</li>
                <li>Answer a question (type answer, press Enter to submit)</li>
                <li>On feedback screen, verify "Next (Enter) →" button is visible</li>
                <li>Press Enter → should advance to next question</li>
                <li>If typing in "Explain your thinking" textarea, Enter should NOT advance</li>
              </ol>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm font-medium text-ink mb-2">Expected Behaviors:</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2">Scenario</th>
                    <th className="pb-2">Expected</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-t border-gray-100">
                    <td className="py-2">Focus Mode ON + Feedback + Enter</td>
                    <td>Advances to next question</td>
                    <td className="text-green-600 font-medium">✓ Implemented</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-2">Focus Mode OFF + Feedback + Enter</td>
                    <td>No action (must click)</td>
                    <td className="text-green-600 font-medium">✓ Implemented</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-2">Typing in textarea + Enter</td>
                    <td>New line (no advance)</td>
                    <td className="text-green-600 font-medium">✓ Implemented</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-2">Audio playing + Enter</td>
                    <td>Stops audio, then advances</td>
                    <td className="text-green-600 font-medium">✓ Implemented</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-2">Next button shows hint</td>
                    <td>"Next (Enter) →" in Focus Mode</td>
                    <td className="text-green-600 font-medium">✓ Implemented</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-2">Auto-focus Next button</td>
                    <td>Button focused on feedback render</td>
                    <td className="text-green-600 font-medium">✓ Implemented</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <p className="text-xs text-gray-500">
              Note: This is a manual test. Enable Focus Mode and go through the practice flow to verify.
            </p>
          </div>
        </div>

        {/* Answer Parsing Tests */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-orange-300 mb-6">
          <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="text-lg">🔤</span>
            Answer Parsing Tests
          </h2>
          
          <p className="text-sm text-ink-muted mb-4">
            Test format typo detection and fraction swap misconception heuristics.
          </p>
          
          {/* Test Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Format Typo Test */}
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <p className="text-sm font-medium text-orange-800 mb-2">Format Typo Test</p>
              <p className="text-xs text-orange-600 mb-3">
                Answer "5/" for a fraction question. Should detect as review_error/format_typo.
              </p>
              <button
                onClick={runFormatTypoTest}
                disabled={formatTypoTestResult.status === "loading"}
                className="w-full px-3 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all disabled:opacity-50"
              >
                {formatTypoTestResult.status === "loading" ? "Testing..." : "Test Format Typo (5/)"}
              </button>
              
              {/* Result */}
              {formatTypoTestResult.status !== "idle" && formatTypoTestResult.status !== "loading" && (
                <div className={`mt-3 p-2 rounded text-xs ${
                  formatTypoTestResult.status === "pass" 
                    ? "bg-green-100 text-green-800" 
                    : "bg-red-100 text-red-800"
                }`}>
                  <p className="font-medium">{formatTypoTestResult.status === "pass" ? "✓ PASS" : "✗ FAIL"}</p>
                  <p>{formatTypoTestResult.message}</p>
                  {formatTypoTestResult.errorClass && (
                    <p className="text-xs mt-1">
                      error_class: <code className="bg-white px-1 rounded">{formatTypoTestResult.errorClass}</code>
                      {formatTypoTestResult.reviewErrorType && (
                        <> / review_error_type: <code className="bg-white px-1 rounded">{formatTypoTestResult.reviewErrorType}</code></>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
            
            {/* Fraction Swap Test */}
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm font-medium text-purple-800 mb-2">Fraction Swap Test</p>
              <p className="text-xs text-purple-600 mb-3">
                Answer "4/3" when correct is "3/4". Should show FRAC-SWAP as top misconception.
              </p>
              <button
                onClick={runFractionSwapTest}
                disabled={fractionSwapTestResult.status === "loading"}
                className="w-full px-3 py-2 text-sm font-medium bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-all disabled:opacity-50"
              >
                {fractionSwapTestResult.status === "loading" ? "Testing..." : "Test Fraction Swap (4/3)"}
              </button>
              
              {/* Result */}
              {fractionSwapTestResult.status !== "idle" && fractionSwapTestResult.status !== "loading" && (
                <div className={`mt-3 p-2 rounded text-xs ${
                  fractionSwapTestResult.status === "pass" 
                    ? "bg-green-100 text-green-800" 
                    : "bg-red-100 text-red-800"
                }`}>
                  <p className="font-medium">{fractionSwapTestResult.status === "pass" ? "✓ PASS" : "✗ FAIL"}</p>
                  <p>{fractionSwapTestResult.message}</p>
                  {fractionSwapTestResult.topMisconceptionId && (
                    <p className="text-xs mt-1">
                      Top misconception: <code className="bg-white px-1 rounded">{fractionSwapTestResult.topMisconceptionId}</code>
                      {fractionSwapTestResult.confidence !== undefined && (
                        <> ({(fractionSwapTestResult.confidence * 100).toFixed(0)}% confidence)</>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <p className="text-xs text-ink-muted">
            These tests verify deterministic parsing rules run BEFORE LLM evaluation.
          </p>
        </div>

        {/* Thinking Autosave Test */}
        <ThinkingAutosaveTestSection userId={user?.id || null} />

        {/* Teacher Avatar Tests */}
        <AvatarTestSection settings={settings} updateSettings={updateSettings} />

        {/* Encouragement Engine Test */}
        <EncouragementTestSection settings={settings} updateSettings={updateSettings} />

        {/* Focus Mode UX Test */}
        <FocusModeUXTestSection settings={settings} updateSettings={updateSettings} />

        {/* Language (i18n) Test */}
        <LanguageTestSection />

        {/* Narration Blocks Preview */}
        <NarrationTestSection settings={settings} />

        {/* Test Request Info - Two test scenarios */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-pink-50 rounded-xl p-5 border border-pink-200">
            <h2 className="font-semibold text-pink-800 mb-3">Misconception Error Test</h2>
            <div className="space-y-1 text-sm text-pink-900">
              <p><strong>Question:</strong> {MISCONCEPTION_TEST.prompt}</p>
              <p><strong>Correct:</strong> {MISCONCEPTION_TEST.correct_answer}</p>
              <p><strong>Test answer:</strong> <span className="font-mono bg-pink-100 px-1 rounded">{MISCONCEPTION_TEST.wrong_answer}</span></p>
              <p className="text-xs text-pink-700">→ Should return error_class: "misconception_error"</p>
            </div>
          </div>
          
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
            <h2 className="font-semibold text-amber-800 mb-3">Review Error Test (Sign Slip)</h2>
            <div className="space-y-1 text-sm text-amber-900">
              <p><strong>Question:</strong> {REVIEW_ERROR_TEST.prompt}</p>
              <p><strong>Correct:</strong> {REVIEW_ERROR_TEST.correct_answer}</p>
              <p><strong>Test answer:</strong> <span className="font-mono bg-amber-100 px-1 rounded">{REVIEW_ERROR_TEST.wrong_answer}</span></p>
              <p className="text-xs text-amber-700">→ Should return error_class: "review_error", type: "sign_slip"</p>
            </div>
          </div>
        </div>

        {/* Coach Notes Test Info */}
        <div className="bg-teal-50 rounded-xl p-5 border border-teal-200 mb-6">
          <h2 className="font-semibold text-teal-800 mb-3">📝 Coach Notes Test</h2>
          <div className="space-y-1 text-sm text-teal-900">
            <p><strong>Question:</strong> {COACH_NOTES_TEST.prompt}</p>
            <p><strong>Correct:</strong> {COACH_NOTES_TEST.correct_answer}</p>
            <p><strong>Test answer:</strong> <span className="font-mono bg-teal-100 px-1 rounded">{COACH_NOTES_TEST.wrong_answer}</span></p>
            <p><strong>Explanation:</strong> <span className="text-xs italic">{COACH_NOTES_TEST.explanation.substring(0, 80)}...</span></p>
            <p className="text-xs text-teal-700 mt-2">→ Should return personalized coach_notes referencing the explanation, then persist to Supabase</p>
          </div>
        </div>

        {/* Focus Mode Efficiency Test Info */}
        <div className="bg-blue-50 rounded-xl p-5 border border-blue-200 mb-6">
          <h2 className="font-semibold text-blue-800 mb-3">⏱️ Focus Mode Efficiency Test</h2>
          <div className="space-y-1 text-sm text-blue-900">
            <p><strong>Question:</strong> {FOCUS_MODE_TEST.prompt}</p>
            <p><strong>Correct:</strong> {FOCUS_MODE_TEST.correct_answer}</p>
            <p><strong>Test answer:</strong> <span className="font-mono bg-blue-100 px-1 rounded">{FOCUS_MODE_TEST.answer}</span> (correct)</p>
            <p><strong>Simulated time:</strong> <span className="font-mono bg-blue-100 px-1 rounded">{(FOCUS_MODE_TEST.simulated_time_ms / 1000).toFixed(1)}s</span> (fast for negatives)</p>
            <p className="text-xs text-blue-700 mt-2">→ Should save focus metadata, then compute efficiency rating from all focus attempts</p>
          </div>
        </div>

        {/* Copy feedback toast */}
        {copyFeedback && (
          <div className="fixed top-4 right-4 bg-ink text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-fade-in">
            {copyFeedback}
          </div>
        )}

        {/* Test Buttons Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Evaluate Test */}
          <button
            onClick={runEvaluateTest}
            disabled={evaluateLoading}
            className="px-4 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark disabled:bg-gray-200 disabled:cursor-not-allowed text-ink font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {evaluateLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running...
              </>
            ) : (
              "Run Evaluate Test"
            )}
          </button>

          {/* Diagnose Test */}
          <button
            onClick={runDiagnoseTest}
            disabled={diagnoseLoading}
            className="px-4 py-3 bg-highlighter-pink hover:bg-pink-300 disabled:bg-gray-200 disabled:cursor-not-allowed text-ink font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {diagnoseLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running...
              </>
            ) : (
              "Run Diagnose Test"
            )}
          </button>

          {/* Review Error Test - FULL PIPELINE */}
          <button
            onClick={runReviewErrorTest}
            disabled={reviewErrorLoading || !user}
            className="px-4 py-3 bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 disabled:cursor-not-allowed text-ink font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 md:col-span-1"
          >
            {reviewErrorLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running Full Pipeline...
              </>
            ) : !user ? (
              "Sign in first"
            ) : (
              "🧪 Run Review Error Test (Full Pipeline)"
            )}
          </button>

          {/* Supabase Check */}
          <button
            onClick={checkSupabaseWrites}
            disabled={supabaseLoading || !user}
            className="px-4 py-3 bg-highlighter-green hover:bg-green-300 disabled:bg-gray-200 disabled:cursor-not-allowed text-ink font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {supabaseLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking...
              </>
            ) : !user ? (
              "Sign in first"
            ) : (
              "Check Supabase Writes"
            )}
          </button>

          {/* Stats Preview */}
          <button
            onClick={fetchStatsPreview}
            disabled={statsPreviewLoading || !user}
            className="px-4 py-3 bg-purple-400 hover:bg-purple-500 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {statsPreviewLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading Stats...
              </>
            ) : !user ? (
              "Sign in first"
            ) : (
              "📊 View Stats Preview"
            )}
          </button>

          {/* Coach Notes Test */}
          <button
            onClick={runCoachNotesTest}
            disabled={coachNotesLoading || !user}
            className="px-4 py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {coachNotesLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Testing Coach Notes...
              </>
            ) : !user ? (
              "Sign in first"
            ) : (
              "📝 Run Coach Notes Test"
            )}
          </button>

          {/* Focus Efficiency Test */}
          <button
            onClick={runFocusEfficiencyTest}
            disabled={focusEfficiencyLoading || !user}
            className="px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {focusEfficiencyLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Testing Focus Efficiency...
              </>
            ) : !user ? (
              "Sign in first"
            ) : (
              "⏱️ Run Focus Efficiency Test"
            )}
          </button>
        </div>

        {/* Results */}
        <div className="space-y-6">
          {/* Evaluate Result */}
          {evaluateResult && (
            <div className="bg-white rounded-xl shadow-sm border border-paper-lineDark overflow-hidden">
              <div className="bg-highlighter-yellow/30 px-5 py-3 flex items-center justify-between">
                <h3 className="font-semibold text-ink">/api/evaluate Response</h3>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-mono px-2 py-0.5 rounded ${
                    evaluateResult.status === 200 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {evaluateResult.status} {evaluateResult.statusText}
                  </span>
                  <button
                    onClick={() => copyToClipboard(evaluateResult.data, "Evaluate")}
                    className="text-xs px-2 py-1 bg-white border border-paper-lineDark rounded hover:bg-gray-50"
                  >
                    Copy JSON
                  </button>
                </div>
              </div>
              <div className="p-5">
                <p className="text-xs text-ink-muted mb-2">Timestamp: {evaluateResult.timestamp}</p>
                <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm font-mono text-ink">
                  {JSON.stringify(evaluateResult.data, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Diagnose Result */}
          {diagnoseResult && (
            <div className="bg-white rounded-xl shadow-sm border border-paper-lineDark overflow-hidden">
              <div className="bg-highlighter-pink/30 px-5 py-3 flex items-center justify-between">
                <h3 className="font-semibold text-ink">/api/diagnose Response</h3>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-mono px-2 py-0.5 rounded ${
                    diagnoseResult.status === 200 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {diagnoseResult.status} {diagnoseResult.statusText}
                  </span>
                  <button
                    onClick={() => copyToClipboard(diagnoseResult.data, "Diagnose")}
                    className="text-xs px-2 py-1 bg-white border border-paper-lineDark rounded hover:bg-gray-50"
                  >
                    Copy JSON
                  </button>
                </div>
              </div>
              <div className="p-5">
                <p className="text-xs text-ink-muted mb-2">Timestamp: {diagnoseResult.timestamp}</p>
                <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm font-mono text-ink max-h-96 overflow-y-auto">
                  {JSON.stringify(diagnoseResult.data, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Review Error Test Result - FULL PIPELINE */}
          {reviewErrorResult && (
            <div className="bg-white rounded-xl shadow-sm border border-amber-300 overflow-hidden">
              <div className="bg-amber-100 px-5 py-3">
                <h3 className="font-semibold text-amber-900">🧪 Review Error Test Results</h3>
                <p className="text-xs text-amber-700">Full pipeline: evaluate → save attempt → increment stats → verify</p>
              </div>
              <div className="p-5 space-y-4">
                {/* Pipeline Status Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className={`p-3 rounded-lg text-center ${
                    reviewErrorResult.evaluateResponse.status === 200 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-xs font-medium text-ink-muted">1. API Evaluate</p>
                    <p className={`text-sm font-bold ${reviewErrorResult.evaluateResponse.status === 200 ? "text-green-700" : "text-red-700"}`}>
                      {reviewErrorResult.evaluateResponse.status === 200 ? "✓ OK" : "✗ Failed"}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${
                    reviewErrorResult.attemptSaved ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-xs font-medium text-ink-muted">2. Save Attempt</p>
                    <p className={`text-sm font-bold ${reviewErrorResult.attemptSaved ? "text-green-700" : "text-red-700"}`}>
                      {reviewErrorResult.attemptSaved ? "✓ Saved" : "✗ Failed"}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${
                    reviewErrorResult.statIncremented ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-xs font-medium text-ink-muted">3. Increment Stat</p>
                    <p className={`text-sm font-bold ${reviewErrorResult.statIncremented ? "text-green-700" : "text-red-700"}`}>
                      {reviewErrorResult.statIncremented ? "✓ Updated" : "✗ Failed"}
                    </p>
                  </div>
                </div>

                {/* Stat Count Change */}
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                  <p className="font-medium text-amber-900 mb-2">📊 Stat Count for {reviewErrorResult.statId}</p>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-amber-700">Before</p>
                      <p className="text-2xl font-mono font-bold text-amber-800">{reviewErrorResult.statCountBefore}</p>
                    </div>
                    <span className="text-2xl text-amber-400">→</span>
                    <div>
                      <p className="text-xs text-amber-700">After</p>
                      <p className="text-2xl font-mono font-bold text-amber-800">{reviewErrorResult.statCountAfter}</p>
                    </div>
                    {reviewErrorResult.statCountAfter > reviewErrorResult.statCountBefore && (
                      <span className="ml-2 text-green-600 font-medium">+{reviewErrorResult.statCountAfter - reviewErrorResult.statCountBefore} ✓</span>
                    )}
                  </div>
                </div>

                {/* Saved Metadata */}
                {reviewErrorResult.savedMetadata && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="font-medium text-ink mb-2">💾 Saved Attempt Metadata</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p><strong>Attempt ID:</strong> <span className="font-mono text-xs">{reviewErrorResult.attemptId}</span></p>
                      <p><strong>error_class:</strong> <span className="font-mono bg-amber-100 px-1 rounded">{reviewErrorResult.savedMetadata.error_class}</span></p>
                      <p><strong>review_error_type:</strong> <span className="font-mono bg-amber-100 px-1 rounded">{reviewErrorResult.savedMetadata.review_error_type || "null"}</span></p>
                    </div>
                  </div>
                )}

                {/* API Response */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-ink">API Response</p>
                    <button
                      onClick={() => copyToClipboard(reviewErrorResult.evaluateResponse.data, "Review Error")}
                      className="text-xs px-2 py-1 bg-white border border-paper-lineDark rounded hover:bg-gray-50"
                    >
                      Copy JSON
                    </button>
                  </div>
                  <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs font-mono text-ink max-h-48 overflow-y-auto">
                    {JSON.stringify(reviewErrorResult.evaluateResponse.data, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Supabase Result */}
          {supabaseResult && (
            <div className="bg-white rounded-xl shadow-sm border border-paper-lineDark overflow-hidden">
              <div className="bg-highlighter-green/30 px-5 py-3 flex items-center justify-between">
                <h3 className="font-semibold text-ink">Supabase Attempts Check</h3>
                <span className="text-xs text-ink-muted">
                  Checked at: {new Date(supabaseResult.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="p-5 space-y-3">
                {supabaseResult.attemptCount === -1 ? (
                  <p className="text-red-600">❌ Error fetching attempts (check console)</p>
                ) : (
                  <>
                    <p className="text-ink">
                      <strong>Total attempts for this user:</strong>{" "}
                      <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                        {supabaseResult.attemptCount}
                      </span>
                    </p>
                    
                    {supabaseResult.newestAttempt ? (
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="font-medium text-ink mb-2">Newest Attempt:</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <p><strong>ID:</strong> <span className="font-mono text-xs">{supabaseResult.newestAttempt.id}</span></p>
                          <p><strong>Topic:</strong> {supabaseResult.newestAttempt.topic}</p>
                          <p>
                            <strong>Correct:</strong>{" "}
                            <span className={supabaseResult.newestAttempt.is_correct ? "text-green-600" : "text-red-600"}>
                              {supabaseResult.newestAttempt.is_correct ? "✓ Yes" : "✗ No"}
                            </span>
                          </p>
                          <p><strong>Created:</strong> {new Date(supabaseResult.newestAttempt.created_at).toLocaleString()}</p>
                          {/* Error classification from metadata */}
                          <p>
                            <strong>error_class:</strong>{" "}
                            <span className={`font-mono px-1 rounded ${
                              supabaseResult.newestAttempt.error_class === "review_error" 
                                ? "bg-amber-100 text-amber-800" 
                                : supabaseResult.newestAttempt.error_class === "misconception_error"
                                ? "bg-pink-100 text-pink-800"
                                : "bg-green-100 text-green-800"
                            }`}>
                              {supabaseResult.newestAttempt.error_class || "n/a"}
                            </span>
                          </p>
                          <p>
                            <strong>review_error_type:</strong>{" "}
                            <span className="font-mono bg-gray-200 px-1 rounded">
                              {supabaseResult.newestAttempt.review_error_type || "null"}
                            </span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-ink-muted italic">No attempts found for this user</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Coach Notes Test Result */}
          {coachNotesResult && (
            <div className="bg-white rounded-xl shadow-sm border border-teal-300 overflow-hidden">
              <div className="bg-teal-100 px-5 py-3">
                <h3 className="font-semibold text-teal-900">📝 Coach Notes Test Results</h3>
                <p className="text-xs text-teal-700">evaluate → save attempt → verify coach_notes persisted</p>
              </div>
              <div className="p-5 space-y-4">
                {/* PASS/FAIL Summary */}
                <div className={`p-4 rounded-lg text-center ${
                  coachNotesResult.isPersisted ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}>
                  <p className={`text-lg font-bold ${coachNotesResult.isPersisted ? "text-green-700" : "text-red-700"}`}>
                    {coachNotesResult.isPersisted ? "✓ PASS: Coach notes persisted!" : "✗ FAIL: Coach notes NOT persisted"}
                  </p>
                </div>

                {/* Pipeline Status */}
                <div className="grid grid-cols-3 gap-3">
                  <div className={`p-3 rounded-lg text-center ${
                    coachNotesResult.evaluateResponse.status === 200 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-xs font-medium text-ink-muted">1. API Evaluate</p>
                    <p className={`text-sm font-bold ${coachNotesResult.evaluateResponse.status === 200 ? "text-green-700" : "text-red-700"}`}>
                      {coachNotesResult.evaluateResponse.status === 200 ? "✓ OK" : "✗ Failed"}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${
                    coachNotesResult.attemptSaved ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-xs font-medium text-ink-muted">2. Save Attempt</p>
                    <p className={`text-sm font-bold ${coachNotesResult.attemptSaved ? "text-green-700" : "text-red-700"}`}>
                      {coachNotesResult.attemptSaved ? "✓ Saved" : "✗ Failed"}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${
                    coachNotesResult.isPersisted ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-xs font-medium text-ink-muted">3. Coach Notes Persisted</p>
                    <p className={`text-sm font-bold ${coachNotesResult.isPersisted ? "text-green-700" : "text-red-700"}`}>
                      {coachNotesResult.isPersisted ? "✓ YES" : "✗ NO"}
                    </p>
                  </div>
                </div>

                {/* Coach Notes Returned from API */}
                {coachNotesResult.coachNotesReturned && (
                  <div className="bg-teal-50 p-4 rounded-lg border border-teal-200">
                    <p className="font-medium text-teal-900 mb-2">📤 Coach Notes Returned from /api/evaluate</p>
                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="font-medium text-teal-800">What went well:</p>
                        <ul className="list-disc list-inside text-teal-700 ml-2">
                          {coachNotesResult.coachNotesReturned.what_went_well.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-teal-800">What to fix:</p>
                        <ul className="list-disc list-inside text-teal-700 ml-2">
                          {coachNotesResult.coachNotesReturned.what_to_fix.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-yellow-100 rounded p-2 mt-2">
                        <p className="font-medium text-yellow-800">💡 Remember: {coachNotesResult.coachNotesReturned.remember}</p>
                      </div>
                      <p><strong>Next step:</strong> {coachNotesResult.coachNotesReturned.next_step}</p>
                    </div>
                  </div>
                )}

                {/* Persisted Coach Notes */}
                {coachNotesResult.persistedCoachNotes && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="font-medium text-green-900 mb-2">💾 Coach Notes Persisted in Supabase</p>
                    <p className="text-xs text-green-700 mb-2">Attempt ID: <span className="font-mono">{coachNotesResult.attemptId}</span></p>
                    <div className="space-y-2 text-sm">
                      <div className="bg-yellow-100 rounded p-2">
                        <p className="font-medium text-yellow-800">💡 Remember: {coachNotesResult.persistedCoachNotes.remember}</p>
                      </div>
                      <p><strong>Next step:</strong> {coachNotesResult.persistedCoachNotes.next_step}</p>
                    </div>
                  </div>
                )}

                {/* Instructions for Learn page */}
                {coachNotesResult.isPersisted && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="font-medium text-blue-800">✅ Next step: Go to Learn tab</p>
                    <p className="text-sm text-blue-700">
                      "My Coach Notes" panel should now show this coach note with the "Remember" line highlighted.
                    </p>
                  </div>
                )}

                {/* API Response */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-ink">Full API Response</p>
                    <button
                      onClick={() => copyToClipboard(coachNotesResult.evaluateResponse.data, "Coach Notes")}
                      className="text-xs px-2 py-1 bg-white border border-paper-lineDark rounded hover:bg-gray-50"
                    >
                      Copy JSON
                    </button>
                  </div>
                  <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs font-mono text-ink max-h-48 overflow-y-auto">
                    {JSON.stringify(coachNotesResult.evaluateResponse.data, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Stats Preview */}
          {statsPreview && (
            <div className="bg-white rounded-xl shadow-sm border border-purple-300 overflow-hidden">
              <div className="bg-purple-100 px-5 py-3 flex items-center justify-between">
                <h3 className="font-semibold text-purple-900">📊 Stats Preview (misconception_stats table)</h3>
                <span className="text-xs text-purple-700">
                  {new Date(statsPreview.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Review Error Stats */}
                  <div>
                    <h4 className="font-medium text-amber-800 mb-3 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-400" />
                      REVIEW:* Stats (Top 5)
                    </h4>
                    {statsPreview.reviewErrorStats.length > 0 ? (
                      <ul className="space-y-2">
                        {statsPreview.reviewErrorStats.map((stat, i) => (
                          <li key={stat.id} className="flex items-center justify-between text-sm bg-amber-50 p-2 rounded">
                            <span className="font-mono text-amber-900">{stat.id}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-700">×{stat.count}</span>
                              <span className="text-xs text-amber-600">
                                {new Date(stat.last_seen_at).toLocaleDateString()}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-ink-muted italic text-sm">No REVIEW:* stats found</p>
                    )}
                  </div>

                  {/* Misconception Stats */}
                  <div>
                    <h4 className="font-medium text-pink-800 mb-3 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-highlighter-pink" />
                      Misconception Stats (Top 5)
                    </h4>
                    {statsPreview.misconceptionStats.length > 0 ? (
                      <ul className="space-y-2">
                        {statsPreview.misconceptionStats.map((stat, i) => (
                          <li key={stat.id} className="flex items-center justify-between text-sm bg-pink-50 p-2 rounded">
                            <span className="font-mono text-pink-900 truncate max-w-[150px]" title={stat.id}>{stat.id}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-pink-700">×{stat.count}</span>
                              <span className="text-xs text-pink-600">
                                {new Date(stat.last_seen_at).toLocaleDateString()}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-ink-muted italic text-sm">No misconception stats found</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Focus Efficiency Test Result */}
          {focusEfficiencyResult && (
            <div className="bg-white rounded-xl shadow-sm border border-blue-300 overflow-hidden">
              <div className="bg-blue-100 px-5 py-3">
                <h3 className="font-semibold text-blue-900">⏱️ Focus Efficiency Test Results</h3>
                <p className="text-xs text-blue-700">save focus attempt → compute efficiency rating</p>
              </div>
              <div className="p-5 space-y-4">
                {/* Pipeline Status */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-lg text-center ${
                    focusEfficiencyResult.attemptSaved ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-xs font-medium text-ink-muted">1. Save Focus Attempt</p>
                    <p className={`text-sm font-bold ${focusEfficiencyResult.attemptSaved ? "text-green-700" : "text-red-700"}`}>
                      {focusEfficiencyResult.attemptSaved ? "✓ Saved" : "✗ Failed"}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${
                    focusEfficiencyResult.focusMeta ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className="text-xs font-medium text-ink-muted">2. Focus Meta Persisted</p>
                    <p className={`text-sm font-bold ${focusEfficiencyResult.focusMeta ? "text-green-700" : "text-red-700"}`}>
                      {focusEfficiencyResult.focusMeta ? "✓ YES" : "✗ NO"}
                    </p>
                  </div>
                </div>

                {/* Focus Meta Details */}
                {focusEfficiencyResult.focusMeta && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="font-medium text-blue-900 mb-2">💾 Saved Focus Metadata</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p><strong>time_ms:</strong> <span className="font-mono">{focusEfficiencyResult.focusMeta.time_ms}</span></p>
                      <p><strong>pauses:</strong> <span className="font-mono">{focusEfficiencyResult.focusMeta.pauses}</span></p>
                      <p><strong>nudges:</strong> <span className="font-mono">{focusEfficiencyResult.focusMeta.nudges}</span></p>
                    </div>
                  </div>
                )}

                {/* Efficiency Rating */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                  <p className="font-medium text-blue-900 mb-3">📊 Computed Efficiency</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">{focusEfficiencyResult.emoji}</span>
                      <span className="font-bold text-lg text-blue-900">{focusEfficiencyResult.label}</span>
                    </div>
                    <span className="text-3xl font-mono font-bold text-blue-600">
                      {focusEfficiencyResult.rating}
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-3">
                    <div 
                      className={`h-full transition-all duration-500 rounded-full ${
                        focusEfficiencyResult.rating >= 90 ? "bg-gradient-to-r from-yellow-400 to-amber-500" :
                        focusEfficiencyResult.rating >= 70 ? "bg-gradient-to-r from-blue-400 to-blue-600" :
                        focusEfficiencyResult.rating >= 40 ? "bg-gradient-to-r from-green-400 to-green-600" :
                        "bg-gradient-to-r from-gray-400 to-gray-500"
                      }`}
                      style={{ width: `${focusEfficiencyResult.rating}%` }}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="text-center">
                      <p className="text-xs text-blue-600">Avg Time (last 10)</p>
                      <p className="font-mono font-bold text-blue-800">
                        {focusEfficiencyResult.avgTime !== null ? `${focusEfficiencyResult.avgTime}s` : "—"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-purple-600">Focus Attempts</p>
                      <p className="font-mono font-bold text-purple-800">
                        {focusEfficiencyResult.focusAttemptCount}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <p className="text-sm text-green-800">
                    ✅ <strong>Next step:</strong> Go to Learn tab to see the "Efficiency (Focus Mode)" panel with this rating.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Translation Coverage Test Section */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-indigo-300 mb-6">
          <h2 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="text-lg">🌍</span>
            Translation Coverage Test
          </h2>
          
          {/* Current Language Display */}
          <div className="bg-indigo-50 rounded-lg p-4 mb-4 border border-indigo-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-indigo-800">Current Language</p>
                <p className="text-2xl font-bold text-indigo-900">
                  {LANGUAGE_NAMES[language as keyof typeof LANGUAGE_NAMES] || language}
                </p>
                <p className="text-xs font-mono text-indigo-600">Code: {language}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang as any)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                      language === lang
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-50"
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Run Test Button */}
          <button
            onClick={runTranslationTest}
            disabled={translationLoading}
            className="w-full px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-all disabled:opacity-50 mb-4"
          >
            {translationLoading ? "Testing..." : "🔍 Run Translation Coverage Test"}
          </button>
          
          {/* Test Results */}
          {translationResult && (
            <div className="space-y-4">
              {/* PASS/FAIL Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className={`p-3 rounded-lg text-center ${
                  translationResult.uiKeys.some(k => k.value && k.value !== k.key)
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}>
                  <p className="text-xs font-medium text-ink-muted">UI Translated</p>
                  <p className={`text-lg font-bold ${
                    translationResult.uiKeys.some(k => k.value && k.value !== k.key)
                      ? "text-green-700"
                      : "text-red-700"
                  }`}>
                    {translationResult.uiKeys.some(k => k.value && k.value !== k.key) ? "✓ PASS" : "✗ FAIL"}
                  </p>
                </div>
                <div className={`p-3 rounded-lg text-center ${
                  translationResult.lessonBlock
                    ? "bg-green-50 border border-green-200"
                    : "bg-yellow-50 border border-yellow-200"
                }`}>
                  <p className="text-xs font-medium text-ink-muted">Lesson Translated</p>
                  <p className={`text-lg font-bold ${
                    translationResult.lessonBlock
                      ? "text-green-700"
                      : "text-yellow-700"
                  }`}>
                    {translationResult.lessonBlock ? "✓ PASS" : "⚠ N/A"}
                  </p>
                </div>
                <div className={`p-3 rounded-lg text-center ${
                  translationResult.diagnoseResult?.status === "error"
                    ? "bg-red-50 border border-red-200"
                    : (translationResult.evaluateResult?.isInTargetLanguage || 
                       (translationResult.diagnoseResult && translationResult.diagnoseResult.status !== "error"))
                    ? "bg-green-50 border border-green-200"
                    : "bg-gray-50 border border-gray-200"
                }`}>
                  <p className="text-xs font-medium text-ink-muted">AI Translated</p>
                  <p className={`text-lg font-bold ${
                    translationResult.diagnoseResult?.status === "error"
                      ? "text-red-700"
                      : (translationResult.evaluateResult?.isInTargetLanguage || 
                         (translationResult.diagnoseResult && translationResult.diagnoseResult.status !== "error"))
                      ? "text-green-700"
                      : "text-gray-500"
                  }`}>
                    {translationResult.diagnoseResult?.status === "error"
                      ? "✗ FAIL"
                      : (translationResult.evaluateResult?.isInTargetLanguage || 
                         (translationResult.diagnoseResult && translationResult.diagnoseResult.status !== "error"))
                      ? "✓ PASS"
                      : "— PENDING"}
                  </p>
                </div>
              </div>

              {/* 10 Translated UI Keys */}
              <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                <h4 className="font-medium text-indigo-900 mb-3">📝 10 Translated UI Keys</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {translationResult.uiKeys.map((item, i) => (
                    <div key={i} className="bg-white rounded p-2 border border-indigo-100">
                      <p className="text-xs text-indigo-600 font-mono">{item.key}</p>
                      <p className="font-medium text-indigo-900">{item.value || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Lesson Block Preview */}
              {translationResult.lessonBlock && (
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <h4 className="font-medium text-purple-900 mb-3">📖 Lesson Block (fractions)</h4>
                  <div className="space-y-2 text-sm">
                    <div className="bg-white rounded p-2 border border-purple-100">
                      <p className="text-xs text-purple-600">Title</p>
                      <p className="font-medium text-purple-900">{translationResult.lessonBlock.title}</p>
                    </div>
                    <div className="bg-white rounded p-2 border border-purple-100">
                      <p className="text-xs text-purple-600">Overview</p>
                      <p className="font-medium text-purple-900">{translationResult.lessonBlock.overview}</p>
                    </div>
                    <div className="bg-white rounded p-2 border border-purple-100">
                      <p className="text-xs text-purple-600">Mascot Catchphrase</p>
                      <p className="font-medium text-purple-900">{translationResult.lessonBlock.mascotCatchphrase}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* AI Language Test Buttons */}
              <div className="border-t border-indigo-200 pt-4">
                <h4 className="font-medium text-indigo-900 mb-3">🤖 Test AI Language Output</h4>
                <div className="flex gap-3">
                  <button
                    onClick={runEvaluateLanguageTest}
                    disabled={evaluateLanguageLoading}
                    className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                  >
                    {evaluateLanguageLoading ? "Testing..." : "Test Evaluate Language"}
                  </button>
                  <button
                    onClick={runDiagnoseLanguageTest}
                    disabled={diagnoseLanguageLoading}
                    className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                  >
                    {diagnoseLanguageLoading ? "Testing..." : "Test Diagnose Language"}
                  </button>
                </div>
              </div>
              
              {/* Evaluate Result */}
              {translationResult.evaluateResult && (
                <div className={`rounded-lg p-4 border ${
                  translationResult.evaluateResult.isInTargetLanguage
                    ? "bg-green-50 border-green-200"
                    : "bg-yellow-50 border-yellow-200"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-ink">📤 /api/evaluate Response</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      translationResult.evaluateResult.isInTargetLanguage
                        ? "bg-green-200 text-green-800"
                        : "bg-yellow-200 text-yellow-800"
                    }`}>
                      {translationResult.evaluateResult.isInTargetLanguage 
                        ? `✓ ${translationResult.evaluateResult.detection.label}` 
                        : `⚠ ${translationResult.evaluateResult.detection.label}`}
                    </span>
                  </div>
                  <div className="bg-white rounded p-3 border border-gray-200 mb-2">
                    <p className="text-xs text-gray-600 mb-1">short_feedback:</p>
                    <p className="text-sm font-medium">{translationResult.evaluateResult.shortFeedback}</p>
                  </div>
                  {/* Detection debug info */}
                  <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                    <p><strong>Detected:</strong> {translationResult.evaluateResult.detection.tag} ({(translationResult.evaluateResult.detection.confidence * 100).toFixed(0)}%)</p>
                    <p className="text-gray-500 truncate">{translationResult.evaluateResult.detection.notes}</p>
                  </div>
                </div>
              )}
              
              {/* Diagnose Result */}
              {translationResult.diagnoseResult && (
                <div className={`rounded-lg p-4 border ${
                  translationResult.diagnoseResult.status === "error"
                    ? "bg-red-50 border-red-200"
                    : translationResult.diagnoseResult.status === "fallback"
                    ? "bg-amber-50 border-amber-200"
                    : translationResult.diagnoseResult.isInTargetLanguage
                    ? "bg-green-50 border-green-200"
                    : "bg-yellow-50 border-yellow-200"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-ink">📤 /api/diagnose Response</h4>
                    <div className="flex items-center gap-2">
                      {/* Status badge */}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        translationResult.diagnoseResult.status === "ok"
                          ? "bg-green-200 text-green-800"
                          : translationResult.diagnoseResult.status === "retried"
                          ? "bg-blue-200 text-blue-800"
                          : translationResult.diagnoseResult.status === "fallback"
                          ? "bg-amber-200 text-amber-800"
                          : "bg-red-200 text-red-800"
                      }`}>
                        {translationResult.diagnoseResult.status === "ok" && "✓ OK"}
                        {translationResult.diagnoseResult.status === "retried" && "🔄 Retried (EN)"}
                        {translationResult.diagnoseResult.status === "fallback" && "⚠ Fallback"}
                        {translationResult.diagnoseResult.status === "error" && "✗ Error"}
                      </span>
                      {/* Language badge */}
                      {translationResult.diagnoseResult.status !== "error" && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          translationResult.diagnoseResult.isInTargetLanguage
                            ? "bg-green-200 text-green-800"
                            : "bg-yellow-200 text-yellow-800"
                        }`}>
                          {translationResult.diagnoseResult.isInTargetLanguage 
                            ? `✓ ${translationResult.diagnoseResult.detection.label}` 
                            : `⚠ ${translationResult.diagnoseResult.detection.label}`}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Status details */}
                  {translationResult.diagnoseResult.statusDetails && (
                    <div className={`text-xs mb-3 p-2 rounded ${
                      translationResult.diagnoseResult.status === "error"
                        ? "bg-red-100 text-red-700"
                        : translationResult.diagnoseResult.status === "fallback"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {translationResult.diagnoseResult.statusDetails}
                    </div>
                  )}
                  
                  {translationResult.diagnoseResult.status !== "error" && (
                    <div className="space-y-2">
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1">key_takeaway:</p>
                        <p className="text-sm font-medium">{translationResult.diagnoseResult.keyTakeaway || "—"}</p>
                      </div>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1">top_3[0].remediation:</p>
                        <p className="text-sm font-medium">{translationResult.diagnoseResult.remediation || "—"}</p>
                      </div>
                      <div className="bg-white rounded p-3 border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1">teach_back_prompt:</p>
                        <p className="text-sm font-medium">{translationResult.diagnoseResult.teachBackPrompt || "—"}</p>
                      </div>
                      {/* Detection debug info */}
                      {translationResult.diagnoseResult.status !== "error" && (
                        <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                          <p><strong>Detected:</strong> {translationResult.diagnoseResult.detection.tag} ({(translationResult.diagnoseResult.detection.confidence * 100).toFixed(0)}%)</p>
                          <p className="text-gray-500 truncate">{translationResult.diagnoseResult.detection.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer link */}
        <div className="mt-8 text-center">
          <a href="/" className="text-highlighter-yellowDark hover:underline text-sm">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
