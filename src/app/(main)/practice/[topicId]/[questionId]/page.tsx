"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getQuestionById, getQuestionsByTopic, getTopicName, getMisconceptionIdsByTopic, getResourcesForMisconception, getDifficultyRank } from "@/lib/content";
import { useAuth } from "@/components/AuthProvider";
import { useDelight } from "@/components/DelightProvider";
import { VoiceInput, type VoiceInputHandle } from "@/components/VoiceInput";
import { 
  createDebouncedSave, 
  getThinkingLog, 
  clearAllDraftsForQuestion,
  type ThinkingFieldType 
} from "@/lib/thinking-drafts";
import { DifficultyMeter } from "@/components/DifficultyMeter";
import { FocusModeToggle } from "@/components/FocusModeToggle";
import { ReadAloudButton, useTTS, stopGlobalAudio } from "@/components/ReadAloudButton";
import { useAvatar, useAdaptiveNudges } from "@/components/AvatarProvider";
import { 
  useNarrationQueue, 
  buildIncorrectFeedbackScript, 
  buildCorrectFeedbackScript,
  highlightAnchor,
  clearHighlight,
  clearAllHighlights,
  type NarrationSegment 
} from "@/components/NarrationScript";
import { saveAttempt, incrementMisconceptionStat, updateMastery, getAttemptsByTopic } from "@/lib/supabase/db";
import type { EvaluationResult, DiagnosisResult, ErrorClass, ReviewErrorType, CoachNotes, FocusMeta } from "@/lib/types";
import type { AttemptInsert, AttemptMetadata, DiagnosedMisconceptionRecord } from "@/lib/supabase/database.types";
import { isFastAnswer } from "@/lib/delight";
import { 
  getEncouragementMessage, 
  getSessionStreaks, 
  updateSessionStreaks,
  isFastForTopic,
  type EncouragementContext,
} from "@/lib/encouragement";
import { computeAdaptiveNudgeThresholds } from "@/lib/delight";
import { useTranslation } from "@/components/I18nProvider";

// ============================================
// Recent Focus Times Storage (for adaptive nudges)
// ============================================
const RECENT_FOCUS_TIMES_KEY = "mm_recent_focus_times";

function getRecentFocusTimes(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_FOCUS_TIMES_KEY);
    if (stored) {
      const times = JSON.parse(stored);
      if (Array.isArray(times)) return times.slice(0, 10); // Keep last 10
    }
  } catch (e) {
    console.warn("[FocusMode] Failed to load recent times:", e);
  }
  return [];
}

function addRecentFocusTime(timeMs: number): void {
  if (typeof window === "undefined") return;
  try {
    const times = getRecentFocusTimes();
    const updated = [timeMs, ...times].slice(0, 10); // Keep last 10
    localStorage.setItem(RECENT_FOCUS_TIMES_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("[FocusMode] Failed to save recent time:", e);
  }
}

// Extended metadata that can include follow-up question info and teach-back response
interface ExtendedMetadata extends AttemptMetadata {
  followup_question?: {
    prompt: string;
    correct_answer: string;
    why_this_targets: string;
  };
  teach_back_response?: string;
}

type FeedbackState = {
  evaluation: EvaluationResult;
  diagnosis?: DiagnosisResult;
} | null;

type SaveErrorState = {
  message: string;
  code: string | null;
  attemptSaved: boolean; // true if attempt was saved but stats failed
  attemptData: AttemptInsert;
  errorClass: ErrorClass;
  reviewErrorType: ReviewErrorType | null;
  coachNotes?: CoachNotes;
} | null;

// Session storage key for session order (includes user id for uniqueness)
function getSessionKey(topicId: string, userId?: string) {
  return `practice_session_${topicId}${userId ? `_${userId.slice(0, 8)}` : ""}`;
}

export default function PracticeQuestionPage({ 
  params 
}: { 
  params: { topicId: string; questionId: string } 
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { settings, playSuccess, playFail, playSpeedBonus, getPhrase } = useDelight();
  const { speak: speakTTS } = useTTS();
  const avatar = useAvatar();
  const { t, language } = useTranslation();
  const [answer, setAnswer] = useState("");
  const autoReadTriggeredRef = useRef(false);
  const [explanation, setExplanation] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [encouragementPhrase, setEncouragementPhrase] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<SaveErrorState>(null);
  const [questionOrder, setQuestionOrder] = useState<string[]>([]);
  const [showSolution, setShowSolution] = useState(false);
  
  // Focus Mode timer state
  const [timerStartMs, setTimerStartMs] = useState<number | null>(null);
  const [timerElapsedMs, setTimerElapsedMs] = useState<number>(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [pauseCount, setPauseCount] = useState(0);
  const [finalTimeMs, setFinalTimeMs] = useState<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Follow-up question state
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [followUpExplanation, setFollowUpExplanation] = useState("");
  const [followUpFeedback, setFollowUpFeedback] = useState<{
    evaluation: EvaluationResult;
    diagnosis?: DiagnosisResult;
  } | null>(null);
  const [isFollowUpSubmitting, setIsFollowUpSubmitting] = useState(false);
  const [followUpSaveStatus, setFollowUpSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [followUpEncouragementPhrase, setFollowUpEncouragementPhrase] = useState<string>("");
  
  // Teach-back state
  const [teachBackResponse, setTeachBackResponse] = useState("");
  const [teachBackSaveStatus, setTeachBackSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  
  // Prevent double-submit
  const isSubmittingRef = useRef(false);
  const isFollowUpSubmittingRef = useRef(false);
  
  // Ref for answer input (auto-focus in Focus Mode)
  const answerInputRef = useRef<HTMLInputElement>(null);
  
  // Refs for VoiceInput components (to stop mic and flush transcript on navigation)
  const initialExplanationRef = useRef<VoiceInputHandle>(null);
  const followupExplanationRef = useRef<VoiceInputHandle>(null);
  const teachbackRef = useRef<VoiceInputHandle>(null);
  
  // Draft status for thinking fields
  const [initialDraftStatus, setInitialDraftStatus] = useState<"saved" | "saving" | null>(null);
  const [followupDraftStatus, setFollowupDraftStatus] = useState<"saved" | "saving" | null>(null);
  const [teachbackDraftStatus, setTeachbackDraftStatus] = useState<"saved" | "saving" | null>(null);
  
  // Debounced save functions for each thinking field
  const debouncedSavers = useRef({
    initial: createDebouncedSave(600),
    followup: createDebouncedSave(600),
    teachback: createDebouncedSave(600),
  });
  
  // Track last interaction for adaptive nudges
  const [lastInteractionAt, setLastInteractionAt] = useState<number>(Date.now());

  const question = getQuestionById(params.topicId, params.questionId);
  const allQuestions = getQuestionsByTopic(params.topicId);
  const topicName = getTopicName(params.topicId);

  // Load question order from sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(getSessionKey(params.topicId, user?.id));
      if (stored) {
        setQuestionOrder(stored.split(","));
      } else {
        setQuestionOrder(allQuestions.map((q) => q.id));
      }
    }
  }, [params.topicId, allQuestions, user?.id]);

  // Reset timer when question changes
  useEffect(() => {
    console.log("[FocusMode] Question changed, resetting timer state");
    setTimerStartMs(null);
    setTimerElapsedMs(0);
    setTimerPaused(false);
    setPauseCount(0);
    setFinalTimeMs(null);
    pausedAtRef.current = null;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [params.questionId]);

  // Focus Mode: Start timer when Focus Mode is ON and question is showing (no feedback)
  // This handles both: (1) Focus Mode already ON when question loads, (2) Focus Mode toggled ON mid-question
  useEffect(() => {
    if (settings.focusModeEnabled && !feedback && question) {
      // Only start timer if not already running
      if (timerStartMs === null) {
        console.log("[FocusMode] Starting timer (Focus Mode toggled ON or question loaded)");
        setTimerStartMs(Date.now());
        setTimerElapsedMs(0);
        setTimerPaused(false);
        setPauseCount(0);
        setFinalTimeMs(null);
        pausedAtRef.current = null;
      }
      
      // Start/continue updating elapsed time every 100ms
      if (!timerIntervalRef.current) {
        timerIntervalRef.current = setInterval(() => {
          setTimerElapsedMs((prev) => {
            if (pausedAtRef.current !== null) return prev; // Paused, don't update
            const start = timerStartMs || Date.now();
            return Date.now() - start;
          });
        }, 100);
      }
      
      return () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      };
    } else if (!settings.focusModeEnabled && timerIntervalRef.current) {
      // Focus Mode turned OFF mid-question - stop the timer
      console.log("[FocusMode] Stopping timer (Focus Mode toggled OFF)");
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      // Don't reset timerStartMs so we can resume if toggled back ON
    }
  }, [settings.focusModeEnabled, question?.id, feedback, timerStartMs]);

  // Focus Mode: Handle visibility changes (pause when tab is hidden)
  useEffect(() => {
    if (!settings.focusModeEnabled || feedback) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Tab hidden - pause the timer
        if (!timerPaused && timerStartMs !== null) {
          setTimerPaused(true);
          pausedAtRef.current = Date.now();
          setPauseCount((prev) => prev + 1);
          console.log("[FocusMode] Timer paused (tab hidden)");
        }
      } else {
        // Tab visible - resume the timer
        if (timerPaused && pausedAtRef.current !== null && timerStartMs !== null) {
          const pauseDuration = Date.now() - pausedAtRef.current;
          // Shift the start time forward by pause duration to maintain correct elapsed
          setTimerStartMs((prev) => (prev !== null ? prev + pauseDuration : null));
          setTimerPaused(false);
          pausedAtRef.current = null;
          console.log("[FocusMode] Timer resumed (tab visible), pause was", pauseDuration, "ms");
        }
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [settings.focusModeEnabled, feedback, timerPaused, timerStartMs]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);
  
  // Cleanup: Stop mic and flush drafts on unmount or navigation
  useEffect(() => {
    return () => {
      // Stop any active recordings and flush their transcripts
      if (initialExplanationRef.current?.isListening()) {
        initialExplanationRef.current.stopAndFlush();
      }
      if (followupExplanationRef.current?.isListening()) {
        followupExplanationRef.current.stopAndFlush();
      }
      if (teachbackRef.current?.isListening()) {
        teachbackRef.current.stopAndFlush();
      }
      
      // Flush all pending debounced saves
      debouncedSavers.current.initial.flush();
      debouncedSavers.current.followup.flush();
      debouncedSavers.current.teachback.flush();
    };
  }, []);
  
  // Compute adaptive nudge baseline from recent focus times
  const baselineMs = useMemo(() => {
    const recentTimes = getRecentFocusTimes();
    const { baselineMs } = computeAdaptiveNudgeThresholds(recentTimes);
    return baselineMs;
  }, [params.questionId]); // Recompute when question changes
  
  // Focus Mode: Adaptive nudge monitoring (based on inactivity)
  const { 
    startNudgeMonitoring, 
    stopNudgeMonitoring, 
    resetOnInteraction,
    nudgeCount, 
    thresholds 
  } = useAdaptiveNudges({
    enabled: settings.focusModeEnabled && !feedback && !!question,
    lastInteractionAt,
    baselineMs,
    onNudge: (count) => {
      console.log("[FocusMode] Adaptive nudge #", count, "thresholds:", thresholds);
    },
  });
  
  // Start nudge monitoring when question loads in Focus Mode
  useEffect(() => {
    if (settings.focusModeEnabled && !feedback && question) {
      startNudgeMonitoring();
    }
    return () => {
      stopNudgeMonitoring();
    };
  }, [settings.focusModeEnabled, question?.id, feedback, startNudgeMonitoring, stopNudgeMonitoring]);
  
  // Reset nudge timers when user types (interaction)
  useEffect(() => {
    resetOnInteraction();
  }, [lastInteractionAt, resetOnInteraction]);
  
  // Reset avatar to home dock when question changes
  useEffect(() => {
    avatar.resetToHome();
    clearAllHighlights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.questionId]);
  
  // Auto-focus answer input on question load (Focus Mode keyboard-first)
  useEffect(() => {
    if (!feedback && question) {
      // Small delay to ensure DOM is ready
      const focusTimer = setTimeout(() => {
        answerInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(focusTimer);
    }
  }, [params.questionId, feedback, question]);
  
  // Reset last interaction when question changes
  useEffect(() => {
    setLastInteractionAt(Date.now());
  }, [params.questionId]);
  
  // Track user interaction for adaptive nudges
  const updateLastInteraction = () => {
    setLastInteractionAt(Date.now());
  };
  
  // Ref for "Next Question" button (for keyboard navigation)
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  
  // Debug state for Enter key (dev only)
  const [enterDebugState, setEnterDebugState] = useState<"idle" | "enabled" | "advancing">("idle");
  
  // Global keyboard handler for Enter key navigation on FEEDBACK SCREEN
  // Works regardless of Focus Mode - Enter always advances when feedback is visible
  useEffect(() => {
    // Only attach handler when feedback is visible
    if (!feedback) {
      setEnterDebugState("idle");
      return;
    }
    
    setEnterDebugState("enabled");
    
    const handleEnterKey = (e: KeyboardEvent) => {
      // Only handle Enter key
      if (e.key !== "Enter") return;
      
      // Don't trigger if focused on a textarea or contentEditable
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;
      if (target.isContentEditable) return;
      // Don't trigger if focused on a text input (but allow for checkboxes/buttons)
      if (target.tagName === "INPUT") {
        const inputType = (target as HTMLInputElement).type;
        if (inputType === "text" || inputType === "number" || inputType === "email" || inputType === "password") {
          return;
        }
      }
      
      // Prevent default and stop propagation
      e.preventDefault();
      e.stopPropagation();
      
      // Stop any playing narration/audio first
      stopGlobalAudio();
      
      // Show debug state (dev only)
      if (process.env.NODE_ENV === "development") {
        setEnterDebugState("advancing");
      }
      
      // Trigger the Next Question button click
      if (nextButtonRef.current) {
        nextButtonRef.current.click();
      }
    };
    
    // Use capture phase to catch event before other handlers
    window.addEventListener("keydown", handleEnterKey, { capture: true });
    
    return () => {
      window.removeEventListener("keydown", handleEnterKey, { capture: true });
      setEnterDebugState("idle");
    };
  }, [feedback]);
  
  // Auto-focus "Next Question" button when feedback renders (for accessibility)
  useEffect(() => {
    if (feedback && nextButtonRef.current) {
      // Small delay to ensure DOM is ready
      const focusTimer = setTimeout(() => {
        nextButtonRef.current?.focus();
      }, 150);
      return () => clearTimeout(focusTimer);
    }
  }, [feedback]);
  
  // Handle Enter in answer input to submit
  const handleAnswerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    updateLastInteraction();
    if (e.key === "Enter" && settings.focusModeEnabled && answer.trim()) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };
  
  // Find current position in the shuffled order
  const currentIndex = questionOrder.indexOf(params.questionId);
  const nextQuestionId = currentIndex >= 0 && currentIndex < questionOrder.length - 1 
    ? questionOrder[currentIndex + 1] 
    : null;

  if (!question) {
    return (
      <div className="animate-fade-in text-center py-12">
        <p className="text-ink-muted">Question not found</p>
        <Link href="/practice" className="text-highlighter-yellowDark hover:underline mt-2 inline-block">
          ← Back to Practice
        </Link>
      </div>
    );
  }

  // Check if error is transient (429, 503, network)
  const isTransientError = (error: Error): boolean => {
    const msg = error.message.toLowerCase();
    return msg.includes("429") || msg.includes("503") || msg.includes("rate limit") ||
           msg.includes("network") || msg.includes("timeout") || msg.includes("fetch");
  };

  // Helper to save attempt with JSONB metadata and robust error handling
  const performSave = async (
    baseAttemptData: Omit<AttemptInsert, "top_misconceptions">,
    errorClass: ErrorClass,
    reviewErrorType: ReviewErrorType | null,
    diagnosis?: DiagnosisResult,
    retryStatsOnly: boolean = false, // If true, skip attempt insert (it succeeded already)
    coachNotes?: CoachNotes,
    focusMeta?: FocusMeta,
    skillTag?: string
  ) => {
    setSaveStatus("saving");
    setSaveError(null);
    
    // Collect thinking log from all fields (initial + followup + teachback)
    const thinkingLog = getThinkingLog(
      baseAttemptData.user_id,
      baseAttemptData.question_id,
      {
        initialExplanation: explanation,
        followupExplanation: followUpExplanation,
        teachback: teachBackResponse,
      }
    );
    
    // Build metadata to store in JSONB (including coach_notes, focus data, skill_tag, and thinking_log)
    const metadata: AttemptMetadata = {
      _metadata: true,
      error_class: errorClass,
      review_error_type: reviewErrorType,
      coach_notes: coachNotes,
      thinking_log: thinkingLog.length > 0 ? thinkingLog : undefined,
      focus: focusMeta,
      skill_tag: skillTag,
    };
    
    // Build the top_misconceptions JSONB payload:
    // - First item: metadata with error_class and review_error_type
    // - Rest: diagnosed misconceptions (if any)
    const misconceptions: DiagnosedMisconceptionRecord[] = diagnosis?.top_3 || [];
    const topMisconceptionsPayload = [metadata, ...misconceptions];
    
    // Build the full attempt data (ONLY columns that exist in DB)
    const attemptData: AttemptInsert = {
      user_id: baseAttemptData.user_id,
      question_id: baseAttemptData.question_id,
      topic: baseAttemptData.topic,
      answer_text: baseAttemptData.answer_text,
      explanation_text: baseAttemptData.explanation_text,
      is_correct: baseAttemptData.is_correct,
      top_misconceptions: topMisconceptionsPayload,
    };
    
    // Build the review error stat ID (e.g., REVIEW:extra_digit)
    const reviewStatId = reviewErrorType ? `REVIEW:${reviewErrorType}` : null;
    
    console.log("[PracticeQuestion] Saving attempt...", {
      question_id: attemptData.question_id,
      topic: attemptData.topic,
      is_correct: attemptData.is_correct,
      error_class: errorClass,
      review_error_type: reviewErrorType,
      retryStatsOnly,
    });
    
    let attemptSaved = retryStatsOnly; // If retrying stats only, attempt is already saved
    
    // STEP 1: Save the attempt (unless retrying stats only)
    if (!retryStatsOnly) {
      try {
        const { data, error } = await saveAttempt(attemptData);

        if (error) {
          // Check if transient error and auto-retry once
          if (isTransientError(error)) {
            console.log("[PracticeQuestion] Transient error, retrying once...");
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
            const { data: retryData, error: retryError } = await saveAttempt(attemptData);
            if (retryError) {
              console.error("[PracticeQuestion] Retry failed:", retryError);
              setSaveStatus("error");
              setSaveError({ 
                message: `Save failed: ${retryError.message}`,
                code: (retryError as any).code || null,
                attemptSaved: false,
                attemptData,
                errorClass,
                reviewErrorType,
                coachNotes,
              });
              return;
            }
            console.log("[PracticeQuestion] Retry succeeded:", retryData?.id);
            attemptSaved = true;
          } else {
            console.error("[PracticeQuestion] Failed to save attempt:", error);
            setSaveStatus("error");
            setSaveError({ 
              message: `Save failed: ${error.message}`,
              code: (error as any).code || null,
              attemptSaved: false,
              attemptData,
              errorClass,
              reviewErrorType,
              coachNotes,
            });
            return;
          }
        } else {
          console.log("[PracticeQuestion] Attempt saved successfully:", data?.id);
          attemptSaved = true;
        }
      } catch (err) {
        console.error("[PracticeQuestion] Unexpected error saving attempt:", err);
        setSaveStatus("error");
        setSaveError({ 
          message: `Unexpected error: ${err instanceof Error ? err.message : "Unknown"}`,
          code: null,
          attemptSaved: false,
          attemptData,
          errorClass,
          reviewErrorType,
          coachNotes,
        });
        return;
      }
    }

    // STEP 2: Update stats (only if attempt was saved successfully)
    let statsError: string | null = null;
    
    if (!attemptData.is_correct) {
      try {
        if (errorClass === "review_error" && reviewStatId) {
          // Track review error with REVIEW:* ID
          console.log("[PracticeQuestion] Updating review error stat for:", reviewStatId);
          const { error: miscError } = await incrementMisconceptionStat(attemptData.user_id, reviewStatId);
          if (miscError) {
            console.error("[PracticeQuestion] Failed to update review error stats:", miscError);
            statsError = `Stats update failed: ${miscError.message}`;
          }
        } else if (errorClass === "misconception_error" && diagnosis?.top_3[0]) {
          // Track misconception error with misconception ID
          console.log("[PracticeQuestion] Updating misconception stat for:", diagnosis.top_3[0].id);
          const { error: miscError } = await incrementMisconceptionStat(attemptData.user_id, diagnosis.top_3[0].id);
          if (miscError) {
            console.error("[PracticeQuestion] Failed to update misconception stats:", miscError);
            statsError = `Stats update failed: ${miscError.message}`;
          }
        }
      } catch (e) {
        console.error("[PracticeQuestion] Stats update exception:", e);
        statsError = `Stats update error: ${e instanceof Error ? e.message : "Unknown"}`;
      }
    }

    // STEP 3: Update mastery
    try {
      console.log("[PracticeQuestion] Updating mastery for topic:", attemptData.topic);
      const topicAttempts = await getAttemptsByTopic(attemptData.user_id, attemptData.topic);
      const recentAttempts = topicAttempts.slice(0, 10);
      if (recentAttempts.length > 0) {
        const correctCount = recentAttempts.filter((a) => a.is_correct).length;
        const accuracy = (correctCount / recentAttempts.length) * 100;
        console.log("[PracticeQuestion] Computed mastery:", accuracy.toFixed(0), "% from", recentAttempts.length, "attempts");
        const { error: masteryError } = await updateMastery(attemptData.user_id, attemptData.topic, accuracy);
        if (masteryError) {
          console.error("[PracticeQuestion] Failed to update mastery:", masteryError);
          if (!statsError) statsError = `Mastery update failed: ${masteryError.message}`;
        }
      }
    } catch (e) {
      console.error("[PracticeQuestion] Failed to update mastery:", e);
      // Don't overwrite existing stats error
    }

    // Final status
    if (statsError) {
      // Attempt saved but stats failed - partial success
      setSaveStatus("error");
      setSaveError({ 
        message: `Attempt saved, but: ${statsError}`,
        code: null,
        attemptSaved: true,
        attemptData,
        errorClass,
        reviewErrorType,
        coachNotes,
      });
    } else {
      setSaveStatus("saved");
      setSaveError(null);
    }
  };

  const handleRetrySave = async () => {
    if (!saveError || !feedback) return;
    
    // If attempt was already saved, only retry stats
    const retryStatsOnly = saveError.attemptSaved;
    
    const baseData = {
      user_id: saveError.attemptData.user_id,
      question_id: saveError.attemptData.question_id,
      topic: saveError.attemptData.topic,
      answer_text: saveError.attemptData.answer_text,
      explanation_text: saveError.attemptData.explanation_text,
      is_correct: saveError.attemptData.is_correct,
    };
    
    await performSave(
      baseData,
      saveError.errorClass,
      saveError.reviewErrorType,
      feedback.diagnosis,
      retryStatsOnly,
      saveError.coachNotes
    );
  };

  // Run misconception diagnosis
  const runDiagnosis = async (): Promise<DiagnosisResult | undefined> => {
    setIsDiagnosing(true);
    let diagnosis: DiagnosisResult | undefined;
    
    try {
      const diagResponse = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: question.prompt,
          correct_answer: question.correct_answer,
          student_answer: answer,
          student_explanation: explanation || undefined,
          topic: question.topic,
          candidate_misconception_ids: question.candidate_misconception_ids,
          language, // Pass current language for AI output
        }),
      });

      const diagData = await diagResponse.json();

      if (diagResponse.ok && diagData.top_3) {
        diagnosis = {
          top_3: diagData.top_3,
          next_practice_question: diagData.next_practice_question,
          teach_back_prompt: diagData.teach_back_prompt,
          key_takeaway: diagData.key_takeaway || "",
        };
      } else {
        console.error("Diagnosis failed:", diagData.error);
      }
    } catch (diagError) {
      console.error("Diagnosis error:", diagError);
    }
    
    setIsDiagnosing(false);
    return diagnosis;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    
    // Prevent double-submit
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    // Focus Mode: Stop timer and capture final time
    let capturedTimeMs: number | null = null;
    let capturedPauses = 0;
    if (settings.focusModeEnabled && timerStartMs !== null) {
      // Stop the interval
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      // Calculate final elapsed time
      capturedTimeMs = Date.now() - timerStartMs;
      capturedPauses = pauseCount;
      setFinalTimeMs(capturedTimeMs);
      // Save for adaptive nudge baseline
      addRecentFocusTime(capturedTimeMs);
      console.log("[FocusMode] Timer stopped:", capturedTimeMs, "ms, pauses:", capturedPauses);
    }

    setIsSubmitting(true);
    setApiError(null);
    setShowSolution(false);
    
    try {
      // Step 1: Call /api/evaluate
      const evalResponse = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: question.prompt,
          correct_answer: question.correct_answer,
          student_answer: answer,
          student_explanation: explanation || undefined,
          language, // Pass current language for AI output
        }),
      });

      const evalData = await evalResponse.json();

      if (!evalResponse.ok) {
        throw new Error(evalData.error || "Failed to evaluate answer");
      }

      const errorClass: ErrorClass = evalData.error_class || "misconception_error";
      const reviewErrorType: ReviewErrorType | null = evalData.review_error_type || null;
      
      const evaluation: EvaluationResult = {
        is_correct: evalData.is_correct,
        solution_steps: evalData.solution_steps || [],
        short_feedback: evalData.short_feedback || "",
        error_class: errorClass,
        review_error_type: reviewErrorType,
        review_error_message: evalData.review_error_message || null,
        coach_notes: evalData.coach_notes || {
          title: "Coach Notes",
          what_went_well: [],
          what_to_fix: [],
          remember: "Keep practicing!",
          next_step: "Try another question.",
        },
      };
      
      // Step 2: If misconception error, call /api/diagnose
      // For review errors, we still run diagnosis but show it differently
      let diagnosis: DiagnosisResult | undefined;
      if (!evaluation.is_correct) {
        setIsSubmitting(false);
        diagnosis = await runDiagnosis();
      }

      setFeedback({ evaluation, diagnosis });

      // Stop nudge monitoring since user has submitted
      stopNudgeMonitoring();

      // Play sound effect and set encouragement phrase
      if (evaluation.is_correct) {
        // Check for speed bonus in Focus Mode
        if (settings.focusModeEnabled && capturedTimeMs !== null) {
          const timeSeconds = capturedTimeMs / 1000;
          if (isFastAnswer(question.topic, timeSeconds)) {
            playSpeedBonus();
            setEncouragementPhrase("⚡ Speed bonus! " + getPhrase("correct"));
          } else {
            playSuccess();
            setEncouragementPhrase(getPhrase("correct"));
          }
        } else {
          playSuccess();
          setEncouragementPhrase(getPhrase("correct"));
        }
        // Avatar celebrates on correct answer
        avatar.celebrate();
        
        // Dynamic encouragement
        if (settings.encouragementEnabled && settings.avatarEnabled) {
          const streaks = getSessionStreaks();
          const encourageCtx: EncouragementContext = {
            isCorrect: true,
            correctStreak: streaks.correctStreak + 1, // Will be incremented
            incorrectStreak: 0,
            isComeback: streaks.incorrectStreak >= 2,
            isFastAnswer: settings.focusModeEnabled && finalTimeMs !== null 
              ? isFastForTopic(finalTimeMs, params.topicId) 
              : false,
          };
          const encouragement = getEncouragementMessage(encourageCtx);
          avatar.say(encouragement.text, settings.avatarSpeaks && settings.voiceEnabled);
        }
        
        // Update session streaks
        updateSessionStreaks(true);
      } else {
        playFail();
        setEncouragementPhrase(getPhrase("incorrect"));
        
        // Update session streaks first
        const prevStreaks = getSessionStreaks();
        updateSessionStreaks(false);
        
        // Dynamic encouragement for incorrect
        if (settings.encouragementEnabled && settings.avatarEnabled) {
          const encourageCtx: EncouragementContext = {
            isCorrect: false,
            correctStreak: 0,
            incorrectStreak: prevStreaks.incorrectStreak + 1,
            isReviewError: errorClass === "review_error",
            isMisconceptionError: errorClass === "misconception_error",
          };
          const encouragement = getEncouragementMessage(encourageCtx);
          
          // Show encouragement, then move to key takeaway if available
          avatar.say(encouragement.text, settings.avatarSpeaks && settings.voiceEnabled);
          
          if (diagnosis?.key_takeaway) {
            setTimeout(() => {
              avatar.moveToAnchor("key-takeaway");
              // Don't repeat - just point, the read-aloud button handles narration
            }, 2000);
          }
        } else if (diagnosis?.key_takeaway) {
          // If encouragement disabled but key takeaway exists, still point
          setTimeout(() => {
            avatar.moveToAnchor("key-takeaway");
          }, 1000);
        }
      }

      // Build focus metadata if Focus Mode was enabled
      let focusMeta: FocusMeta | undefined;
      if (settings.focusModeEnabled && capturedTimeMs !== null) {
        focusMeta = {
          enabled: true,
          time_ms: capturedTimeMs,
          pauses: capturedPauses,
          nudges: nudgeCount,
        };
      }

      // Step 3: Save attempt if user is logged in
      if (user) {
        const baseAttemptData = {
          user_id: user.id,
          question_id: question.id,
          topic: question.topic,
          answer_text: answer,
          explanation_text: explanation || null,
          is_correct: evaluation.is_correct,
        };
        await performSave(baseAttemptData, errorClass, reviewErrorType, diagnosis, false, evaluation.coach_notes, focusMeta, question.skill_tag);
      }

    } catch (error) {
      console.error("Evaluation error:", error);
      setApiError(error instanceof Error ? error.message : "Failed to evaluate answer");
    } finally {
      setIsSubmitting(false);
      setIsDiagnosing(false);
      isSubmittingRef.current = false;
    }
  };

  const handleRetryEvaluation = () => {
    setApiError(null);
  };

  // Handle follow-up question submission
  const handleFollowUpSubmit = async () => {
    if (!followUpAnswer.trim() || !feedback?.diagnosis?.next_practice_question) return;
    if (isFollowUpSubmittingRef.current) return;
    isFollowUpSubmittingRef.current = true;
    
    setIsFollowUpSubmitting(true);
    setFollowUpSaveStatus("idle");
    
    const followUpQuestion = feedback.diagnosis.next_practice_question;
    
    try {
      // Step 1: Evaluate the follow-up answer
      const evalResponse = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: followUpQuestion.prompt,
          correct_answer: followUpQuestion.correct_answer,
          student_answer: followUpAnswer,
          student_explanation: followUpExplanation || undefined,
          language, // Pass current language for AI output
        }),
      });

      const evalData = await evalResponse.json();

      if (!evalResponse.ok) {
        throw new Error(evalData.error || "Failed to evaluate follow-up answer");
      }

      const errorClass: ErrorClass = evalData.error_class || "misconception_error";
      const reviewErrorType: ReviewErrorType | null = evalData.review_error_type || null;
      
      const evaluation: EvaluationResult = {
        is_correct: evalData.is_correct,
        solution_steps: evalData.solution_steps || [],
        short_feedback: evalData.short_feedback || "",
        error_class: errorClass,
        review_error_type: reviewErrorType,
        review_error_message: evalData.review_error_message || null,
        coach_notes: evalData.coach_notes || {
          title: "Coach Notes",
          what_went_well: [],
          what_to_fix: [],
          remember: "Keep practicing!",
          next_step: "Try another question.",
        },
      };
      
      // Step 2: If incorrect, run diagnosis using topic-level misconception IDs
      let diagnosis: DiagnosisResult | undefined;
      if (!evaluation.is_correct && errorClass === "misconception_error") {
        try {
          const topicMisconceptionIds = getMisconceptionIdsByTopic(params.topicId);
          
          const diagResponse = await fetch("/api/diagnose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question_prompt: followUpQuestion.prompt,
              correct_answer: followUpQuestion.correct_answer,
              student_answer: followUpAnswer,
              student_explanation: followUpExplanation || undefined,
              topic: params.topicId,
              candidate_misconception_ids: topicMisconceptionIds,
              language, // Pass current language for AI output
            }),
          });

          const diagData = await diagResponse.json();

          if (diagResponse.ok && diagData.top_3) {
            diagnosis = {
              top_3: diagData.top_3,
              next_practice_question: diagData.next_practice_question,
              teach_back_prompt: diagData.teach_back_prompt,
              key_takeaway: diagData.key_takeaway || "",
            };
          }
        } catch (diagError) {
          console.error("Follow-up diagnosis error:", diagError);
        }
      }

      setFollowUpFeedback({ evaluation, diagnosis });

      // Play sound effect and set encouragement phrase for follow-up
      if (evaluation.is_correct) {
        playSuccess();
        setFollowUpEncouragementPhrase(getPhrase("correct"));
      } else {
        playFail();
        setFollowUpEncouragementPhrase(getPhrase("incorrect"));
      }

      // Step 3: Save follow-up attempt if user is logged in
      if (user) {
        setFollowUpSaveStatus("saving");
        
        // Generate unique question_id for follow-up
        const followUpQuestionId = `followup:${Date.now()}`;
        
        // Build metadata with follow-up question info
        const metadata: ExtendedMetadata = {
          _metadata: true,
          error_class: errorClass,
          review_error_type: reviewErrorType,
          followup_question: {
            prompt: followUpQuestion.prompt,
            correct_answer: followUpQuestion.correct_answer,
            why_this_targets: followUpQuestion.why_this_targets,
          },
        };
        
        const misconceptions: DiagnosedMisconceptionRecord[] = diagnosis?.top_3 || [];
        const topMisconceptionsPayload = [metadata, ...misconceptions];
        
        const attemptData: AttemptInsert = {
          user_id: user.id,
          question_id: followUpQuestionId,
          topic: params.topicId,
          answer_text: followUpAnswer,
          explanation_text: followUpExplanation || null,
          is_correct: evaluation.is_correct,
          top_misconceptions: topMisconceptionsPayload,
        };
        
        console.log("[PracticeQuestion] Saving follow-up attempt...", {
          question_id: followUpQuestionId,
          is_correct: evaluation.is_correct,
          error_class: errorClass,
        });
        
        try {
          const { error: saveError } = await saveAttempt(attemptData);
          
          if (saveError) {
            console.error("[PracticeQuestion] Failed to save follow-up attempt:", saveError);
            setFollowUpSaveStatus("error");
          } else {
            console.log("[PracticeQuestion] Follow-up attempt saved");
            
            // Update stats if incorrect
            if (!evaluation.is_correct) {
              if (errorClass === "review_error" && reviewErrorType) {
                await incrementMisconceptionStat(user.id, `REVIEW:${reviewErrorType}`);
              } else if (errorClass === "misconception_error" && diagnosis?.top_3[0]) {
                await incrementMisconceptionStat(user.id, diagnosis.top_3[0].id);
              }
            }
            
            // Update mastery
            try {
              const topicAttempts = await getAttemptsByTopic(user.id, params.topicId);
              const recentAttempts = topicAttempts.slice(0, 10);
              if (recentAttempts.length > 0) {
                const correctCount = recentAttempts.filter((a) => a.is_correct).length;
                const accuracy = (correctCount / recentAttempts.length) * 100;
                await updateMastery(user.id, params.topicId, accuracy);
              }
            } catch (e) {
              console.error("[PracticeQuestion] Failed to update mastery for follow-up:", e);
            }
            
            setFollowUpSaveStatus("saved");
          }
        } catch (err) {
          console.error("[PracticeQuestion] Unexpected error saving follow-up:", err);
          setFollowUpSaveStatus("error");
        }
      }

    } catch (error) {
      console.error("Follow-up evaluation error:", error);
      setFollowUpFeedback({
        evaluation: {
          is_correct: false,
          solution_steps: [],
          short_feedback: "Error evaluating answer",
          error_class: "misconception_error",
          review_error_type: null,
          review_error_message: null,
          coach_notes: {
            title: "Coach Notes",
            what_went_well: [],
            what_to_fix: [],
            remember: "Try again with the follow-up question.",
            next_step: "Review the solution steps above.",
          },
        },
      });
    } finally {
      setIsFollowUpSubmitting(false);
      isFollowUpSubmittingRef.current = false;
    }
  };

  // Save teach-back response
  const handleSaveTeachBack = async () => {
    if (!teachBackResponse.trim() || !user) return;
    
    setTeachBackSaveStatus("saving");
    
    // Create a special "teach-back" attempt record
    const teachBackQuestionId = `teachback:${Date.now()}`;
    
    const metadata: ExtendedMetadata = {
      _metadata: true,
      error_class: "correct", // Teach-back isn't graded
      review_error_type: null,
      teach_back_response: teachBackResponse,
    };
    
    const attemptData: AttemptInsert = {
      user_id: user.id,
      question_id: teachBackQuestionId,
      topic: params.topicId,
      answer_text: teachBackResponse,
      explanation_text: feedback?.diagnosis?.teach_back_prompt || null,
      is_correct: true, // Teach-back is always "correct" - it's for reflection
      top_misconceptions: [metadata],
    };
    
    console.log("[PracticeQuestion] Saving teach-back response...");
    
    try {
      const { error: saveError } = await saveAttempt(attemptData);
      
      if (saveError) {
        console.error("[PracticeQuestion] Failed to save teach-back:", saveError);
        setTeachBackSaveStatus("error");
      } else {
        console.log("[PracticeQuestion] Teach-back response saved");
        setTeachBackSaveStatus("saved");
      }
    } catch (err) {
      console.error("[PracticeQuestion] Unexpected error saving teach-back:", err);
      setTeachBackSaveStatus("error");
    }
  };

  // Draft change handlers for autosave
  const handleInitialDraftChange = useCallback((text: string) => {
    setInitialDraftStatus("saving");
    debouncedSavers.current.initial.save(
      user?.id || null,
      question?.id || params.questionId,
      "initial_explanation",
      text,
      () => setInitialDraftStatus("saved")
    );
  }, [user?.id, question?.id, params.questionId]);
  
  const handleFollowupDraftChange = useCallback((text: string) => {
    setFollowupDraftStatus("saving");
    debouncedSavers.current.followup.save(
      user?.id || null,
      question?.id || params.questionId,
      "followup_explanation",
      text,
      () => setFollowupDraftStatus("saved")
    );
  }, [user?.id, question?.id, params.questionId]);
  
  const handleTeachbackDraftChange = useCallback((text: string) => {
    setTeachbackDraftStatus("saving");
    debouncedSavers.current.teachback.save(
      user?.id || null,
      question?.id || params.questionId,
      "teachback",
      text,
      () => setTeachbackDraftStatus("saved")
    );
  }, [user?.id, question?.id, params.questionId]);
  
  // Stop all mics and flush drafts before navigation
  const prepareForNavigation = useCallback(() => {
    // Stop any active recordings and flush their transcripts
    if (initialExplanationRef.current?.isListening()) {
      initialExplanationRef.current.stopAndFlush();
    }
    if (followupExplanationRef.current?.isListening()) {
      followupExplanationRef.current.stopAndFlush();
    }
    if (teachbackRef.current?.isListening()) {
      teachbackRef.current.stopAndFlush();
    }
    
    // Flush all pending debounced saves immediately
    debouncedSavers.current.initial.flush();
    debouncedSavers.current.followup.flush();
    debouncedSavers.current.teachback.flush();
  }, []);

  const handleNext = () => {
    // Ensure all mic recordings are stopped and drafts saved before navigating
    prepareForNavigation();
    
    // Clear drafts for this question (they're saved in the attempt)
    if (question?.id) {
      clearAllDraftsForQuestion(user?.id || null, question.id);
    }
    
    if (nextQuestionId) {
      router.push(`/practice/${params.topicId}/${nextQuestionId}`);
      // Reset state for next question
      setAnswer("");
      setExplanation("");
      setFeedback(null);
      setApiError(null);
      setSaveStatus("idle");
      setSaveError(null);
      setShowSolution(false);
      // Reset draft status
      setInitialDraftStatus(null);
      setFollowupDraftStatus(null);
      setTeachbackDraftStatus(null);
    } else {
      // End of practice set - clear session
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(getSessionKey(params.topicId, user?.id));
      }
      router.push(`/practice/${params.topicId}/complete`);
    }
  };

  const handleTryAgain = () => {
    // Stop any active recordings
    prepareForNavigation();
    
    setAnswer("");
    setExplanation("");
    setFeedback(null);
    setApiError(null);
    setSaveStatus("idle");
    setSaveError(null);
    setShowSolution(false);
    // Reset follow-up state
    setFollowUpAnswer("");
    setFollowUpExplanation("");
    setFollowUpFeedback(null);
    setFollowUpSaveStatus("idle");
    // Reset teach-back state
    setTeachBackResponse("");
    setTeachBackSaveStatus("idle");
    // Reset timer state for Focus Mode
    setTimerStartMs(null);
    setTimerElapsedMs(0);
    setTimerPaused(false);
    setPauseCount(0);
    // Reset draft status
    setInitialDraftStatus(null);
    setFollowupDraftStatus(null);
    setTeachbackDraftStatus(null);
    setFinalTimeMs(null);
    pausedAtRef.current = null;
  };

  // Display position in shuffled order (1-indexed)
  const displayPosition = currentIndex >= 0 ? currentIndex + 1 : 1;
  const totalQuestions = questionOrder.length || allQuestions.length;
  
  // Get current question difficulty
  const currentDifficulty = question?.difficulty || 5;

  // Check if this was a review error
  const isReviewError = feedback?.evaluation.error_class === "review_error";

  // Build narration script for feedback (ordered segments with anchors)
  const buildFeedbackScript = () => {
    if (!feedback) return null;
    
    if (feedback.evaluation.is_correct) {
      return buildCorrectFeedbackScript({
        shortFeedback: feedback.evaluation.short_feedback,
        coachRemember: feedback.evaluation.coach_notes?.remember,
      });
    } else {
      // Build "what went wrong" text
      let whatWentWrong = isReviewError 
        ? "This looks like a review error. " + (feedback.evaluation.review_error_message || "Double-check your work!")
        : feedback.evaluation.short_feedback;
      
      // Add top misconception info if available
      if (feedback.diagnosis?.top_3[0]) {
        const topMisconception = feedback.diagnosis.top_3[0];
        whatWentWrong += ` The likely issue is: ${topMisconception.name}. ${topMisconception.diagnosis}`;
      }
      
      return buildIncorrectFeedbackScript({
        keyTakeaway: feedback.diagnosis?.key_takeaway,
        whatWentWrong,
        solutionSteps: feedback.evaluation.solution_steps,
        coachRemember: feedback.evaluation.coach_notes?.remember,
      });
    }
  };
  
  // Get current narration script
  const feedbackScript = buildFeedbackScript();
  
  // Narration queue runner with choreography
  const { 
    state: narrationState, 
    runScript, 
    cancelScript 
  } = useNarrationQueue({
    script: feedbackScript,
    onSegmentStart: (segment: NarrationSegment) => {
      // Highlight the current section
      clearAllHighlights();
      if (segment.anchorId) {
        highlightAnchor(segment.anchorId);
      }
    },
    onSegmentEnd: (segment: NarrationSegment) => {
      // Clear highlight when done with segment
      if (segment.anchorId) {
        clearHighlight(segment.anchorId);
      }
    },
    onComplete: () => {
      clearAllHighlights();
    },
    onCancel: () => {
      clearAllHighlights();
    },
  });
  
  // Handle "Read aloud" button click - runs the script with choreography
  const handleReadAloud = () => {
    if (narrationState.isRunning) {
      cancelScript();
    } else {
      runScript();
    }
  };
  
  // Legacy: Build simple text for backwards compatibility
  const buildFeedbackReadText = (): string => {
    if (!feedback) return "";
    
    const parts: string[] = [];
    
    if (feedback.evaluation.is_correct) {
      parts.push("Correct!");
      parts.push(feedback.evaluation.short_feedback);
      if (feedback.evaluation.coach_notes?.remember) {
        parts.push("Remember: " + feedback.evaluation.coach_notes.remember);
      }
    } else {
      // Order: Key takeaway → What went wrong → Solution steps (ALL)
      if (feedback.diagnosis?.key_takeaway) {
        parts.push("Key takeaway: " + feedback.diagnosis.key_takeaway);
      }
      parts.push(isReviewError ? "Review error detected." : "Not quite right.");
      parts.push(feedback.evaluation.review_error_message || feedback.evaluation.short_feedback);
      if (feedback.evaluation.solution_steps.length > 0) {
        parts.push("Solution: " + feedback.evaluation.solution_steps.join(". "));
      }
    }
    
    return parts.filter(Boolean).join(" ");
  };

  // Auto-read feedback when enabled
  useEffect(() => {
    if (
      feedback && 
      settings.voiceEnabled && 
      settings.autoReadFeedback && 
      !autoReadTriggeredRef.current
    ) {
      autoReadTriggeredRef.current = true;
      const textToRead = buildFeedbackReadText();
      if (textToRead) {
        // Small delay to let the UI render first
        setTimeout(() => speakTTS(textToRead), 500);
      }
    }
  }, [feedback, settings.voiceEnabled, settings.autoReadFeedback]);

  // Reset auto-read flag when question changes
  useEffect(() => {
    autoReadTriggeredRef.current = false;
  }, [params.questionId]);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Link 
          href={`/practice/${params.topicId}`}
          className="inline-flex items-center text-ink-muted hover:text-ink transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("common.back")}
        </Link>
        <span className="text-sm text-ink-muted">
          {topicName} • {t("practice.question")} {displayPosition} {t("practice.of")} {totalQuestions}
        </span>
      </div>
      
      {/* Difficulty Meter */}
      <div className="mb-6">
        <DifficultyMeter currentLevel={currentDifficulty} />
      </div>

      {/* Focus Mode toggle + timer (always visible when answering, timer only when ON) */}
      {!feedback && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FocusModeToggle compact />
            {settings.focusModeEnabled && timerPaused && (
              <span className="text-xs text-amber-600 font-medium">⏸️ {t("practice.paused")}</span>
            )}
          </div>
          {settings.focusModeEnabled && (
            <div className="flex items-center gap-2 text-lg font-mono text-ink">
              <span className={timerPaused ? "text-amber-600" : ""}>
                {Math.floor(timerElapsedMs / 1000)}s
              </span>
            </div>
          )}
        </div>
      )}

      {!feedback ? (
        // Question form
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark mb-4">
            {/* Question */}
            <div className="mb-6" data-coach-anchor="question">
              <label className="block text-sm font-medium text-ink-muted mb-2">
                {t("practice.question")}
              </label>
              <p className="text-2xl font-mono text-ink">
                {question.prompt}
              </p>
            </div>

            {/* Answer input */}
            <div className="mb-4" data-coach-anchor="answer-input">
              <label htmlFor="answer" className="block text-sm font-medium text-ink-muted mb-2">
                {t("practice.yourAnswer")}
              </label>
              <input
                ref={answerInputRef}
                id="answer"
                type="text"
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  updateLastInteraction();
                }}
                onKeyDown={handleAnswerKeyDown}
                placeholder={settings.focusModeEnabled ? t("practice.answerPlaceholderFocus") : t("practice.answerPlaceholder")}
                className="w-full px-4 py-3 border border-paper-lineDark rounded-lg focus:outline-none focus:ring-2 focus:ring-highlighter-yellow focus:border-transparent text-lg font-mono"
                autoComplete="off"
                disabled={isSubmitting || isDiagnosing}
              />
            </div>

            {/* Explanation input with voice option */}
            <div data-coach-anchor="explanation-box">
              <VoiceInput
                ref={initialExplanationRef}
                id="explanation"
                value={explanation}
                onChange={setExplanation}
                placeholder={t("practice.thinkingPlaceholder")}
                rows={3}
                disabled={isSubmitting || isDiagnosing}
                label={t("practice.explainYourThinking")}
                labelHint={t("practice.explainYourThinkingHint")}
                onDraftChange={handleInitialDraftChange}
                showDraftStatus={true}
                draftStatus={initialDraftStatus}
              />
            </div>
          </div>

          {/* API Error with Retry */}
          {apiError && (
            <div className="bg-highlighter-pink/20 border border-pink-300 rounded-lg p-4 mb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-pink-800 font-medium">⚠️ {apiError}</p>
                  <p className="text-xs text-pink-600 mt-1">{t("practice.connectionError")}</p>
                </div>
                <button
                  type="button"
                  onClick={handleRetryEvaluation}
                  className="px-3 py-1.5 text-xs font-medium bg-pink-100 hover:bg-pink-200 text-pink-800 rounded-lg transition-colors"
                >
                  {t("practice.dismiss")}
                </button>
              </div>
            </div>
          )}

          {/* Sign in prompt if not logged in */}
          {!user && (
            <div className="bg-highlighter-yellow/20 border border-highlighter-yellowDark/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-ink">
                💡 <strong>{t("common.signIn")}</strong> {t("practice.signInPrompt")}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!answer.trim() || isSubmitting || isDiagnosing}
            className="w-full px-6 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark disabled:bg-gray-200 disabled:cursor-not-allowed text-ink font-semibold rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t("practice.checking")}
              </>
            ) : isDiagnosing ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t("practice.diagnosing")}
              </>
            ) : (
              t("practice.check")
            )}
          </button>
        </form>
      ) : (
        // Feedback view
        <div className="space-y-4">
          {/* Result banner */}
          <div className={`rounded-xl p-6 ${
            feedback.evaluation.is_correct 
              ? "bg-highlighter-green/30 border border-green-300" 
              : isReviewError
                ? "bg-amber-50 border border-amber-300"
                : "bg-highlighter-pink/30 border border-pink-300"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {feedback.evaluation.is_correct ? (
                  <span className="text-3xl">🎉</span>
                ) : isReviewError ? (
                  <span className="text-3xl">✏️</span>
                ) : (
                  <span className="text-3xl">🤔</span>
                )}
                <div>
                  <h3 className="text-xl font-bold text-ink flex items-center gap-2">
                    {feedback.evaluation.is_correct 
                      ? t("practice.correctAnswer") 
                      : isReviewError 
                        ? t("practice.reviewErrorDetected") 
                        : t("practice.notQuiteRight")}
                    {encouragementPhrase && (
                      <span className="text-base font-medium text-highlighter-yellowDark animate-fade-in">
                        {encouragementPhrase}
                      </span>
                    )}
                  </h3>
                  <p className={`text-sm ${isReviewError ? "text-amber-800" : "text-ink-light"}`}>
                    {feedback.evaluation.review_error_message || feedback.evaluation.short_feedback}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {/* Focus Mode: Time taken */}
                {settings.focusModeEnabled && finalTimeMs !== null && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">
                    <span>⏱️</span>
                    <span>{t("practice.time")}: {(finalTimeMs / 1000).toFixed(1)}s</span>
                    {pauseCount > 0 && (
                      <span className="text-xs text-blue-600">({pauseCount} {pauseCount > 1 ? t("practice.pauses") : t("practice.pause")})</span>
                    )}
                  </div>
                )}
                
                {/* Narrated Read Aloud button with choreography */}
                {settings.showReadAloudButtons && (
                  <button
                    onClick={handleReadAloud}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                      narrationState.isRunning
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                    }`}
                  >
                    {narrationState.isRunning ? (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                        {t("feedback.stop")}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                        {t("feedback.readAloud")}
                      </>
                    )}
                  </button>
                )}
                
                {/* Save status indicator with retry */}
                {user && (
                  <div className="text-xs">
                    {saveStatus === "saving" && (
                      <span className="text-ink-muted">{t("practice.saving")}</span>
                    )}
                    {saveStatus === "saved" && (
                      <span className="text-green-600">✓ {t("practice.saved")}</span>
                    )}
                    {saveStatus === "error" && saveError && (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={handleRetrySave}
                          className="text-pink-600 hover:text-pink-800 underline text-left"
                        >
                          {saveError.attemptSaved 
                            ? `⚠ ${t("practice.statsUpdateFailed")}` 
                            : `⚠ ${t("practice.saveFailedRetry")}`}
                        </button>
                        <span className="text-ink-muted text-[10px] max-w-xs truncate" title={saveError.message}>
                          {saveError.code && `[${saveError.code}] `}{saveError.message.slice(0, 50)}
                          {saveError.message.length > 50 && "..."}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Review error info card */}
          {isReviewError && feedback.evaluation.review_error_type && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-medium rounded-full">
                  {feedback.evaluation.review_error_type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-sm text-amber-800">
                {t("practice.reviewSlip")}
              </p>
            </div>
          )}

          {/* Solution steps - collapsible for review errors */}
          {!feedback.evaluation.is_correct && feedback.evaluation.solution_steps.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-paper-lineDark overflow-hidden" data-coach-anchor="solution-steps">
              {isReviewError ? (
                <>
                  <button
                    onClick={() => setShowSolution(!showSolution)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-semibold text-ink">{t("common.showSolution")}</span>
                    <svg 
                      className={`w-5 h-5 text-ink-muted transition-transform ${showSolution ? "rotate-180" : ""}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showSolution && (
                    <div className="px-6 pb-6 pt-2 border-t border-paper-line">
                      <ol className="space-y-2">
                        {feedback.evaluation.solution_steps.map((step, i) => (
                          <li key={i} className="flex gap-2 text-ink-light">
                            <span className="text-highlighter-yellowDark font-medium">{i + 1}.</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-6">
                  <h4 className="font-semibold text-ink mb-3">{t("practice.correctSolution")}</h4>
                  <ol className="space-y-2">
                    {feedback.evaluation.solution_steps.map((step, i) => (
                      <li key={i} className="flex gap-2 text-ink-light">
                        <span className="text-highlighter-yellowDark font-medium">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Misconception analysis */}
          {feedback.diagnosis && feedback.diagnosis.top_3.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark" data-coach-anchor="misconception-section">
              <h4 className="font-semibold text-ink mb-4">
                {isReviewError 
                  ? `🔍 ${t("feedback.misconceptionAnalysisReview")}` 
                  : `🔍 ${t("feedback.misconceptionAnalysis")}`}
              </h4>
              
              {/* All 3 misconceptions as ranked cards */}
              <div className="space-y-3 mb-4">
                {feedback.diagnosis.top_3.map((m, i) => (
                  <div 
                    key={m.id + i} 
                    className={`p-4 rounded-lg border ${
                      i === 0 
                        ? "bg-highlighter-pink/10 border-highlighter-pink" 
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? "bg-highlighter-pink text-white" : "bg-gray-200 text-ink-muted"
                        }`}>
                          {i + 1}
                        </span>
                        <span className={`font-medium ${i === 0 ? "text-ink" : "text-ink-muted"}`}>
                          {m.name}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        i === 0 ? "bg-pink-100 text-pink-700" : "bg-gray-200 text-gray-600"
                      }`}>
                        {Math.round(m.confidence * 100)}% {t("feedback.confident")}
                      </span>
                    </div>
                    
                    {i === 0 && (
                      <>
                        <p className="text-sm text-ink-muted mb-2">
                          <strong>{t("feedback.evidence")}:</strong> {m.evidence}
                        </p>
                        <p className="text-sm text-ink-light mb-3">
                          {m.diagnosis}
                        </p>
                        
                        {/* Remediation for top misconception */}
                        <div className="bg-highlighter-yellow/20 border-l-4 border-highlighter-yellowDark p-3 rounded-r-lg">
                          <h5 className="font-medium text-ink text-sm mb-1">💡 How to fix it:</h5>
                          <p className="text-sm text-ink-light">
                            {m.remediation}
                          </p>
                        </div>
                        
                        {/* Key Takeaway highlight - only for top misconception */}
                        {feedback.diagnosis?.key_takeaway && (
                          <div className="mt-3 bg-highlighter-green/30 border-2 border-dashed border-green-400 rounded-lg p-3" data-coach-anchor="key-takeaway">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🎯</span>
                              <span className="font-bold text-green-800 text-sm">Key Takeaway:</span>
                            </div>
                            <p className="text-green-900 font-medium mt-1">
                              {feedback.diagnosis.key_takeaway}
                            </p>
                          </div>
                        )}
                        
                        {/* Learn More resources - only for top misconception */}
                        {(() => {
                          const resources = getResourcesForMisconception(m.id, params.topicId);
                          if (resources.length === 0) return null;
                          return (
                            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">📚</span>
                                <span className="font-medium text-blue-900 text-sm">Learn More</span>
                              </div>
                              <ul className="space-y-1">
                                {resources.map((r, idx) => (
                                  <li key={idx}>
                                    <a
                                      href={r.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 hover:underline"
                                    >
                                      <span className="text-xs">
                                        {r.type === "video" ? "🎬" : r.type === "article" ? "📄" : "✏️"}
                                      </span>
                                      {r.title}
                                      <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Follow-up practice question - only for misconception errors */}
              {!isReviewError && feedback.diagnosis.next_practice_question && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4" data-coach-anchor="follow-up-question">
                  <h5 className="font-medium text-blue-900 mb-2">📝 Try this follow-up question:</h5>
                  <p className="text-lg font-mono text-blue-800 mb-3">
                    {feedback.diagnosis.next_practice_question.prompt}
                  </p>
                  <p className="text-xs text-blue-600 mb-4">
                    {feedback.diagnosis.next_practice_question.why_this_targets}
                  </p>
                  
                  {/* Follow-up answer input */}
                  {!followUpFeedback && (
                    <div className="space-y-3 mt-4 pt-4 border-t border-blue-200">
                      <div>
                        <label htmlFor="followup-answer" className="block text-sm font-medium text-blue-800 mb-1">
                          Your Answer
                        </label>
                        <input
                          id="followup-answer"
                          type="text"
                          value={followUpAnswer}
                          onChange={(e) => setFollowUpAnswer(e.target.value)}
                          placeholder="Enter your answer..."
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono bg-white"
                          disabled={isFollowUpSubmitting}
                        />
                      </div>
                      <VoiceInput
                        ref={followupExplanationRef}
                        id="followup-explanation"
                        value={followUpExplanation}
                        onChange={setFollowUpExplanation}
                        placeholder="How did you solve this?"
                        rows={2}
                        disabled={isFollowUpSubmitting}
                        label="Show your thinking"
                        labelHint="(optional)"
                        className="[&_label]:text-blue-800 [&_label_span]:text-blue-500"
                        onDraftChange={handleFollowupDraftChange}
                        showDraftStatus={true}
                        draftStatus={followupDraftStatus}
                      />
                      <button
                        onClick={handleFollowUpSubmit}
                        disabled={!followUpAnswer.trim() || isFollowUpSubmitting}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {isFollowUpSubmitting ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Checking...
                          </>
                        ) : (
                          "Check Follow-up"
                        )}
                      </button>
                    </div>
                  )}
                  
                  {/* Follow-up result card */}
                  {followUpFeedback && (
                    <div className={`mt-4 pt-4 border-t border-blue-200 rounded-lg p-3 ${
                      followUpFeedback.evaluation.is_correct 
                        ? "bg-green-50 border border-green-200" 
                        : "bg-pink-50 border border-pink-200"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {followUpFeedback.evaluation.is_correct ? (
                            <span className="text-xl">🎉</span>
                          ) : (
                            <span className="text-xl">🤔</span>
                          )}
                          <span className={`font-medium ${
                            followUpFeedback.evaluation.is_correct ? "text-green-800" : "text-pink-800"
                          }`}>
                            {followUpFeedback.evaluation.is_correct ? "Correct!" : "Not quite right"}
                          </span>
                          {followUpEncouragementPhrase && (
                            <span className="text-sm text-highlighter-yellowDark animate-fade-in ml-1">
                              {followUpEncouragementPhrase}
                            </span>
                          )}
                        </div>
                        {user && (
                          <span className={`text-xs ${
                            followUpSaveStatus === "saved" ? "text-green-600" :
                            followUpSaveStatus === "saving" ? "text-blue-600" :
                            followUpSaveStatus === "error" ? "text-red-600" : ""
                          }`}>
                            {followUpSaveStatus === "saved" && "✓ Saved"}
                            {followUpSaveStatus === "saving" && "Saving..."}
                            {followUpSaveStatus === "error" && "⚠ Save failed"}
                          </span>
                        )}
                      </div>
                      
                      {/* Show solution steps if incorrect */}
                      {!followUpFeedback.evaluation.is_correct && followUpFeedback.evaluation.solution_steps.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-pink-200">
                          <p className="text-xs font-medium text-pink-800 mb-1">Solution:</p>
                          <ol className="space-y-1 text-xs text-pink-700">
                            {followUpFeedback.evaluation.solution_steps.map((step, i) => (
                              <li key={i} className="flex gap-1">
                                <span className="font-medium">{i + 1}.</span>
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      
                      {/* Show top misconception if diagnosed */}
                      {followUpFeedback.diagnosis?.top_3[0] && !followUpFeedback.evaluation.is_correct && (
                        <div className="mt-2 pt-2 border-t border-pink-200">
                          <p className="text-xs font-medium text-pink-800 mb-1">
                            Likely issue: {followUpFeedback.diagnosis.top_3[0].name}
                          </p>
                          <p className="text-xs text-pink-700">
                            {followUpFeedback.diagnosis.top_3[0].diagnosis}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Teach-back prompt - only for misconception errors */}
              {!isReviewError && feedback.diagnosis.teach_back_prompt && (
                <div className="pt-4 border-t border-paper-line">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-sm text-purple-800 italic mb-3">
                      🤔 {feedback.diagnosis.teach_back_prompt}
                    </p>
                    
                    {teachBackSaveStatus !== "saved" && (
                      <div className="space-y-3">
                        <VoiceInput
                          ref={teachbackRef}
                          id="teachback-response"
                          value={teachBackResponse}
                          onChange={setTeachBackResponse}
                          placeholder="Type or speak your explanation..."
                          rows={3}
                          disabled={teachBackSaveStatus === "saving"}
                          className="[&_label]:text-purple-800 [&_textarea]:text-sm"
                          onDraftChange={handleTeachbackDraftChange}
                          showDraftStatus={true}
                          draftStatus={teachbackDraftStatus}
                        />
                        <button
                          onClick={handleSaveTeachBack}
                          disabled={!teachBackResponse.trim() || teachBackSaveStatus === "saving" || !user}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors flex items-center gap-2"
                        >
                          {teachBackSaveStatus === "saving" ? (
                            <>
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Saving...
                            </>
                          ) : (
                            "Save Response"
                          )}
                        </button>
                        {!user && (
                          <p className="text-xs text-purple-600">Sign in to save your response</p>
                        )}
                      </div>
                    )}
                    
                    {teachBackSaveStatus === "saved" && (
                      <div className="bg-purple-100 rounded-lg p-3 mt-2">
                        <div className="flex items-center gap-2 text-purple-800">
                          <span className="text-green-600">✓</span>
                          <span className="text-sm font-medium">Response saved!</span>
                        </div>
                        <p className="text-xs text-purple-700 mt-1 italic">
                          "{teachBackResponse}"
                        </p>
                      </div>
                    )}
                    
                    {teachBackSaveStatus === "error" && (
                      <p className="text-xs text-red-600 mt-2">Failed to save. Please try again.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Coach Notes Section */}
          {feedback.evaluation.coach_notes && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark" data-coach-anchor="coach-notes">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📝</span>
                <h4 className="font-semibold text-ink">{feedback.evaluation.coach_notes.title}</h4>
              </div>
              
              <div className="space-y-3">
                {/* What went well */}
                {feedback.evaluation.coach_notes.what_went_well.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-green-700 mb-1">✓ What went well:</p>
                    <ul className="space-y-1">
                      {feedback.evaluation.coach_notes.what_went_well.map((item, i) => (
                        <li key={i} className="text-sm text-ink-light pl-4">• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* What to fix */}
                {feedback.evaluation.coach_notes.what_to_fix.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-amber-700 mb-1">🔧 What to work on:</p>
                    <ul className="space-y-1">
                      {feedback.evaluation.coach_notes.what_to_fix.map((item, i) => (
                        <li key={i} className="text-sm text-ink-light pl-4">• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Remember - highlighted */}
                {feedback.evaluation.coach_notes.remember && (
                  <div className="bg-highlighter-yellow/40 border-l-4 border-highlighter-yellowDark p-3 rounded-r-lg">
                    <p className="text-sm font-bold text-ink">
                      💡 Remember: {feedback.evaluation.coach_notes.remember}
                    </p>
                  </div>
                )}
                
                {/* Next step */}
                {feedback.evaluation.coach_notes.next_step && (
                  <div className="pt-2 border-t border-paper-line">
                    <p className="text-sm text-ink-muted">
                      <span className="font-medium">Next step:</span> {feedback.evaluation.coach_notes.next_step}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 relative">
            {!feedback.evaluation.is_correct && (
              <button
                onClick={handleTryAgain}
                className="flex-1 px-6 py-3 bg-white hover:bg-gray-50 text-ink font-medium rounded-xl border border-paper-lineDark transition-all"
              >
                Try Again
              </button>
            )}
            <button
              ref={nextButtonRef}
              onClick={handleNext}
              className="flex-1 px-6 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink font-semibold rounded-xl shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-highlighter-yellowDark"
            >
              {nextQuestionId ? "Next Question" : "Finish Practice"}
              <span className="ml-1 text-sm opacity-70">(Enter)</span>
            </button>
            {/* Dev-only debug indicator */}
            {process.env.NODE_ENV === "development" && (
              <div className="absolute -bottom-6 right-0 text-xs">
                {enterDebugState === "enabled" && (
                  <span className="text-green-600">Enter → Next enabled</span>
                )}
                {enterDebugState === "advancing" && (
                  <span className="text-blue-600 animate-pulse">Advancing…</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
