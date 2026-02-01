"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { LessonCard, MasteryStatus } from "@/components/LessonCard";
import { useAuth } from "@/components/AuthProvider";
import { useDelight } from "@/components/DelightProvider";
import { getRecentAttempts, getMastery } from "@/lib/supabase/db";
import { REQUIRED_SKILLS_BY_TOPIC, SKILL_TAG_NAMES, REQUIRED_ATTEMPTS_PER_SKILL } from "@/lib/content";
import type { Attempt, Mastery } from "@/lib/supabase/database.types";
import { extractAttemptMetadata } from "@/lib/supabase/database.types";
import { useTranslation } from "@/components/I18nProvider";

// Lesson definitions (static content)
const lessonDefinitions = [
  {
    id: "fractions",
    title: "Fractions",
    description: "Add, subtract, and find equivalent fractions with confidence.",
    lessonNumber: 1,
  },
  {
    id: "negatives",
    title: "Negative Numbers",
    description: "Master adding, subtracting, and multiplying with negatives.",
    lessonNumber: 2,
  },
  {
    id: "linear-equations",
    title: "Linear Equations",
    description: "Solve one-step and two-step equations like a pro.",
    lessonNumber: 3,
  },
  {
    id: "mixed-review",
    title: "Mixed Review",
    description: "Practice all topics together to strengthen your skills.",
    lessonNumber: 4,
  },
];

// Main topics (excluding mixed-review for mastery calculation)
const MAIN_TOPICS = ["fractions", "negatives", "linear-equations"];

// Skill coverage data for mastery calculation
interface SkillCoverageData {
  skillTag: string;
  skillName: string;
  attemptCount: number;
  coverageFactor: number; // 0-1, based on attempts vs required
  accuracy: number; // 0-100, based on recent correct answers
  skillScore: number; // coverage * accuracy
}

// Topic mastery data (coverage + accuracy based)
interface TopicMasteryData {
  percent: number; // 0-100 overall mastery
  skills: SkillCoverageData[];
  lowestSkill: SkillCoverageData | null; // The skill that needs most work
}

// Dashboard data for Learn page - simplified for lesson cards only
// Full analytics moved to /dashboard
interface DashboardData {
  accuracy: number | null; // Keep for celebration check
  masteryByTopic: Record<string, MasteryStatus>;
  masteryPercentByTopic: Record<string, TopicMasteryData>;
}

function computeMasteryStatus(mastery: Mastery | undefined): MasteryStatus {
  if (!mastery) return "not_started";
  if (mastery.accuracy >= 80) return "solid";
  return "learning";
}

function computeMixedReviewStatus(
  masteryByTopic: Record<string, MasteryStatus>
): MasteryStatus {
  const mainStatuses = MAIN_TOPICS.map((t) => masteryByTopic[t] || "not_started");
  
  if (mainStatuses.every((s) => s === "solid")) return "solid";
  if (mainStatuses.some((s) => s !== "not_started")) return "learning";
  return "not_started";
}

// ============================================
// Coverage-Based Mastery Calculation
// ============================================

/**
 * Compute mastery percentage for a topic based on:
 * - Coverage across all required subskills
 * - Accuracy within each subskill
 * 
 * Formula per skill:
 *   coverage_factor = clamp(0, 1, attempts / REQUIRED_ATTEMPTS_PER_SKILL)
 *   skill_score = coverage_factor * accuracy (0-1)
 * 
 * Topic mastery = average(skill_score across all required skills) * 100
 */
function computeTopicMastery(
  topicId: string,
  attempts: Attempt[]
): TopicMasteryData {
  const requiredSkills = REQUIRED_SKILLS_BY_TOPIC[topicId] || [];
  
  if (requiredSkills.length === 0) {
    return {
      percent: 0,
      skills: [],
      lowestSkill: null,
    };
  }
  
  // Group attempts by skill_tag
  const attemptsBySkill = new Map<string, Attempt[]>();
  for (const skill of requiredSkills) {
    attemptsBySkill.set(skill, []);
  }
  
  for (const attempt of attempts) {
    const metadata = extractAttemptMetadata(attempt.top_misconceptions);
    const skillTag = metadata?.skill_tag;
    
    if (skillTag && attemptsBySkill.has(skillTag)) {
      attemptsBySkill.get(skillTag)!.push(attempt);
    }
  }
  
  // Compute coverage and accuracy for each skill
  const skillData: SkillCoverageData[] = requiredSkills.map(skillTag => {
    const skillAttempts = attemptsBySkill.get(skillTag) || [];
    const attemptCount = skillAttempts.length;
    
    // Coverage factor: 0-1 based on how many attempts vs required
    const coverageFactor = Math.min(1, attemptCount / REQUIRED_ATTEMPTS_PER_SKILL);
    
    // Accuracy: compute from recent attempts (up to 10)
    const recentAttempts = skillAttempts.slice(0, 10);
    const correctCount = recentAttempts.filter(a => a.is_correct).length;
    const accuracy = recentAttempts.length > 0 
      ? (correctCount / recentAttempts.length) * 100 
      : 0;
    
    // Skill score combines coverage and accuracy
    const skillScore = coverageFactor * (accuracy / 100);
    
    return {
      skillTag,
      skillName: SKILL_TAG_NAMES[skillTag] || skillTag,
      attemptCount,
      coverageFactor,
      accuracy,
      skillScore,
    };
  });
  
  // Overall mastery is average of skill scores
  const totalScore = skillData.reduce((sum, s) => sum + s.skillScore, 0);
  const percent = Math.round((totalScore / requiredSkills.length) * 100);
  
  // Find the lowest skill (most needs work)
  const lowestSkill = skillData.length > 0
    ? skillData.reduce((lowest, s) => s.skillScore < lowest.skillScore ? s : lowest)
    : null;
  
  return {
    percent,
    skills: skillData,
    lowestSkill: lowestSkill && lowestSkill.skillScore < 0.8 ? lowestSkill : null,
  };
}

export default function LearnPage() {
  const { user, loading: authLoading } = useAuth();
  const { celebrate, getPhrase } = useDelight();
  const { t } = useTranslation();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [perfectMessage, setPerfectMessage] = useState<string | null>(null);
  const hasCelebratedRef = useRef(false);

  const fetchDashboardData = useCallback(async () => {
    if (!user) {
      setDashboardData(null);
      setIsLoading(false);
      setFetchError(null);
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    try {
      console.log("[LearnPage] Fetching data for lesson cards...");
      
      // Fetch only what's needed for lesson cards (mastery bars)
      const [recentAttempts, masteryData] = await Promise.all([
        getRecentAttempts(user.id, 30),
        getMastery(user.id),
      ]);

      console.log("[LearnPage] Fetched:", {
        recentAttemptsCount: recentAttempts.length,
        masteryCount: masteryData.length,
      });

      // Compute accuracy from last 10 attempts (for celebration check only)
      const last10Attempts = recentAttempts.slice(0, 10);
      let accuracy: number | null = null;
      if (last10Attempts.length > 0) {
        const correctCount = last10Attempts.filter((a) => a.is_correct).length;
        accuracy = Math.round((correctCount / last10Attempts.length) * 100);
      }

      // Build mastery by topic (old status-based)
      const masteryByTopic: Record<string, MasteryStatus> = {};
      for (const topic of MAIN_TOPICS) {
        const topicMastery = masteryData.find((m) => m.topic === topic);
        masteryByTopic[topic] = computeMasteryStatus(topicMastery);
      }
      masteryByTopic["mixed-review"] = computeMixedReviewStatus(masteryByTopic);
      
      // Compute coverage-based mastery percentages
      const masteryPercentByTopic: Record<string, TopicMasteryData> = {};
      for (const topic of MAIN_TOPICS) {
        const topicAttempts = recentAttempts.filter(a => a.topic === topic);
        masteryPercentByTopic[topic] = computeTopicMastery(topic, topicAttempts);
      }
      masteryPercentByTopic["mixed-review"] = computeTopicMastery("mixed-review", recentAttempts);

      setDashboardData({
        accuracy,
        masteryByTopic,
        masteryPercentByTopic,
      });
      setLastRefresh(new Date());
    } catch (error) {
      console.error("[LearnPage] Failed to fetch data:", error);
      setFetchError("Failed to load your progress.");
      setDashboardData(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch on mount and when user changes
  useEffect(() => {
    if (!authLoading) {
      fetchDashboardData();
    }
  }, [authLoading, fetchDashboardData]);

  // Also refresh when page becomes visible (e.g., returning from Practice)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user && !authLoading) {
        console.log("[LearnPage] Page visible, refreshing data...");
        fetchDashboardData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user, authLoading, fetchDashboardData]);

  const handleRefresh = () => {
    fetchDashboardData();
  };

  // Celebrate 100% accuracy milestone (once per session)
  useEffect(() => {
    if (
      dashboardData?.accuracy === 100 && 
      !hasCelebratedRef.current && 
      !isLoading
    ) {
      hasCelebratedRef.current = true;
      setPerfectMessage(getPhrase("perfect"));
      celebrate("learn_accuracy_100");
    }
  }, [dashboardData?.accuracy, isLoading, celebrate, getPhrase]);

  // Loading state
  if (authLoading || isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-ink mb-1">{t("common.learn")}</h2>
          <p className="text-ink-muted">
            {t("learn.startWithLesson")}
          </p>
        </div>

        {/* Skeleton lesson cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark animate-pulse">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-full bg-paper-line" />
                <div className="w-20 h-6 rounded-full bg-paper-line" />
              </div>
              <div className="h-5 bg-paper-line rounded w-3/4 mb-2" />
              <div className="h-4 bg-paper-line rounded w-full" />
            </div>
          ))}
        </div>

        {/* Skeleton progress stats */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-5 shadow-sm border border-paper-lineDark animate-pulse">
          <div className="h-5 bg-paper-line rounded w-32 mb-4" />
          <div className="h-2.5 bg-paper-line rounded-full mb-5" />
          <div className="space-y-2">
            <div className="h-4 bg-paper-line rounded w-full" />
            <div className="h-4 bg-paper-line rounded w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  // Build lesson data with mastery status and percentage
  const lessons = lessonDefinitions.map((lesson) => ({
    ...lesson,
    status: dashboardData?.masteryByTopic[lesson.id] || ("not_started" as MasteryStatus),
    masteryData: dashboardData?.masteryPercentByTopic[lesson.id] || null,
  }));

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-ink mb-1">{t("common.learn")}</h2>
          <p className="text-ink-muted">
            {t("learn.startWithLesson")}
          </p>
        </div>
        
        {/* Refresh button for logged-in users */}
        {user && (
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-ink-muted hover:text-ink bg-white hover:bg-gray-50 border border-paper-lineDark rounded-lg transition-colors disabled:opacity-50"
            title={lastRefresh ? `Last updated: ${lastRefresh.toLocaleTimeString()}` : t("common.refresh")}
          >
            <svg 
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t("common.refresh")}
          </button>
        )}
      </div>

      {/* Error message */}
      {fetchError && (
        <div className="bg-highlighter-pink/20 border border-pink-300 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-pink-800">{fetchError}</p>
            <button
              onClick={handleRefresh}
              className="text-sm text-pink-700 hover:text-pink-900 underline"
            >
              {t("common.tryAgain")}
            </button>
          </div>
        </div>
      )}

      {/* Sign in prompt if not logged in */}
      {!user && (
        <div className="bg-highlighter-yellow/20 border border-highlighter-yellowDark/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-ink">
            💡 <strong>{t("common.signIn")}</strong> {t("practice.signInPrompt")}
          </p>
        </div>
      )}

      {/* Lesson cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {lessons.map((lesson) => (
          <LessonCard key={lesson.id} {...lesson} />
        ))}
      </div>

      {/* Perfect score celebration banner */}
      {perfectMessage && dashboardData?.accuracy === 100 && (
        <div className="mb-6 bg-gradient-to-r from-highlighter-yellow/50 to-highlighter-green/50 rounded-xl p-4 border-2 border-green-300 animate-fade-in">
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">🏆</span>
            <p className="text-lg font-bold text-green-800">{perfectMessage}</p>
            <span className="text-3xl">🏆</span>
          </div>
        </div>
      )}

      {/* Dashboard link - prompt users to see detailed analytics */}
      {user && (
        <div className="mt-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📊</span>
              <div>
                <p className="font-medium text-purple-800">{t("dashboard.trackYourProgress")}</p>
                <p className="text-sm text-purple-600">
                  {t("dashboard.viewAnalytics")}
                </p>
              </div>
            </div>
            <a 
              href="/dashboard"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
            >
              {t("common.dashboard")} →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
