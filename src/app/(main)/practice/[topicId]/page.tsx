"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getQuestionsByTopic, getTopicName, buildDifficultySessionOrder, DIFFICULTY_RANKS } from "@/lib/content";
import { useAuth } from "@/components/AuthProvider";

// Session storage key for session order (includes user id for uniqueness)
function getSessionKey(topicId: string, userId?: string) {
  return `practice_session_${topicId}${userId ? `_${userId.slice(0, 8)}` : ""}`;
}

export default function PracticeSetPage({ params }: { params: { topicId: string } }) {
  const router = useRouter();
  const { user } = useAuth();
  const questions = getQuestionsByTopic(params.topicId);
  const topicName = getTopicName(params.topicId);
  const [hasExistingSession, setHasExistingSession] = useState(false);

  // Check if there's an existing session order on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(getSessionKey(params.topicId, user?.id));
      setHasExistingSession(!!stored);
    }
  }, [params.topicId, user?.id]);

  if (questions.length === 0) {
    return (
      <div className="animate-fade-in text-center py-12">
        <p className="text-ink-muted">No questions found for this topic</p>
        <Link href="/practice" className="text-highlighter-yellowDark hover:underline mt-2 inline-block">
          ← Back to Practice
        </Link>
      </div>
    );
  }

  // Count questions by difficulty for preview
  const difficultyBreakdown = questions.reduce((acc, q) => {
    const d = q.difficulty || 5;
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  const minDifficulty = Math.min(...Object.keys(difficultyBreakdown).map(Number));
  const maxDifficulty = Math.max(...Object.keys(difficultyBreakdown).map(Number));

  const startSession = (forceNew: boolean = false) => {
    const sessionKey = getSessionKey(params.topicId, user?.id);
    let order: string[];
    
    // Check for existing session order (unless forcing new)
    if (!forceNew && typeof window !== "undefined") {
      const stored = sessionStorage.getItem(sessionKey);
      if (stored) {
        order = stored.split(",");
        // Validate stored order
        const validIds = new Set(questions.map(q => q.id));
        if (order.every(id => validIds.has(id)) && order.length === questions.length) {
          router.push(`/practice/${params.topicId}/${order[0]}`);
          return;
        }
      }
    }
    
    // Generate new difficulty-based session order
    const seed = Date.now();
    order = buildDifficultySessionOrder(questions, seed);
    
    // Store in sessionStorage
    if (typeof window !== "undefined") {
      sessionStorage.setItem(sessionKey, order.join(","));
    }
    
    // Navigate to the first question
    router.push(`/practice/${params.topicId}/${order[0]}`);
  };

  const handleStartPractice = () => {
    startSession(false);
  };

  const handleNewSession = () => {
    // Clear and start fresh
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(getSessionKey(params.topicId, user?.id));
    }
    startSession(true);
  };

  return (
    <div className="animate-fade-in">
      {/* Back link */}
      <Link 
        href="/practice" 
        className="inline-flex items-center text-ink-muted hover:text-ink mb-4 transition-colors"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Practice
      </Link>

      {/* Practice set info */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark mb-6">
        <h2 className="text-2xl font-bold text-ink mb-2 font-handwriting">
          {topicName} Practice
        </h2>
        <p className="text-ink-muted mb-4">
          {questions.length} questions • Level {minDifficulty} → {maxDifficulty}
        </p>

        {/* Difficulty preview */}
        <div className="bg-gradient-to-r from-green-50 via-yellow-50 to-red-50 rounded-lg p-4 mb-4 border border-paper-line">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-ink-muted">Difficulty Ladder</span>
            <span className="text-xs text-ink-muted">
              {DIFFICULTY_RANKS[minDifficulty]} → {DIFFICULTY_RANKS[maxDifficulty]}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((level) => {
              const count = difficultyBreakdown[level] || 0;
              const hasQuestions = count > 0;
              return (
                <div
                  key={level}
                  className={`flex-1 h-8 rounded flex items-center justify-center text-xs font-bold transition-all ${
                    hasQuestions
                      ? level <= 3
                        ? "bg-green-200 text-green-800"
                        : level <= 6
                        ? "bg-yellow-200 text-yellow-800"
                        : level <= 8
                        ? "bg-orange-200 text-orange-800"
                        : "bg-red-200 text-red-800"
                      : "bg-gray-100 text-gray-400"
                  }`}
                  title={`Level ${level}: ${count} questions`}
                >
                  {hasQuestions ? count : ""}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-ink-muted">
            <span>Easy</span>
            <span>Hard</span>
          </div>
        </div>

        <div className="bg-highlighter-yellow/20 border-l-4 border-highlighter-yellowDark p-4 rounded-r-lg mb-6">
          <p className="text-sm text-ink">
            <strong>Level up!</strong> Questions start easy and get harder as you progress.
            Explain your thinking for better coaching!
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStartPractice}
            className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink font-semibold rounded-xl shadow-sm hover:shadow transition-all"
          >
            {hasExistingSession ? "Continue Practice" : "Start Practice"}
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          
          <button
            onClick={handleNewSession}
            className="inline-flex items-center justify-center px-4 py-3 bg-white hover:bg-gray-50 text-ink-muted hover:text-ink border border-paper-lineDark rounded-xl transition-all"
            title="Start a new session with fresh shuffle"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        
        {hasExistingSession && (
          <p className="text-xs text-ink-muted mt-2 text-center">
            Session in progress • Click 🔄 to start fresh
          </p>
        )}
      </div>
    </div>
  );
}
