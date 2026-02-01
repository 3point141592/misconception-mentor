"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTopicName } from "@/lib/content";
import { useDelight } from "@/components/DelightProvider";
import { useAuth } from "@/components/AuthProvider";
import { getAttemptsByTopic } from "@/lib/supabase/db";

export default function PracticeCompletePage({ params }: { params: { topicId: string } }) {
  const topicName = getTopicName(params.topicId);
  const { celebrate, getPhrase, playSuccess } = useDelight();
  const { user } = useAuth();
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [hasCelebrated, setHasCelebrated] = useState(false);
  const [perfectPhrase, setPerfectPhrase] = useState("");

  // Fetch accuracy and celebrate if perfect
  useEffect(() => {
    async function checkAccuracy() {
      if (!user) {
        // No user, just play a success sound on mount
        playSuccess();
        return;
      }

      try {
        const attempts = await getAttemptsByTopic(user.id, params.topicId);
        const recentAttempts = attempts.slice(0, 10);
        
        if (recentAttempts.length > 0) {
          const correctCount = recentAttempts.filter(a => a.is_correct).length;
          const acc = Math.round((correctCount / recentAttempts.length) * 100);
          setAccuracy(acc);

          // If 100% accuracy and haven't celebrated yet
          if (acc === 100 && !hasCelebrated) {
            setHasCelebrated(true);
            setPerfectPhrase(getPhrase("perfect"));
            // Celebrate with unique key based on topic
            celebrate(`practice_complete_${params.topicId}_100`);
          } else if (!hasCelebrated) {
            // Just play success sound for non-perfect completion
            playSuccess();
            setHasCelebrated(true);
          }
        } else {
          playSuccess();
        }
      } catch (error) {
        console.error("[PracticeComplete] Error fetching accuracy:", error);
        playSuccess();
      }
    }

    checkAccuracy();
  }, [user, params.topicId, celebrate, getPhrase, playSuccess, hasCelebrated]);

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-xl p-8 shadow-sm border border-paper-lineDark text-center">
        <span className="text-5xl mb-4 block">
          {accuracy === 100 ? "🏆" : "🎉"}
        </span>
        <h2 className="text-2xl font-bold text-ink mb-2 font-handwriting">
          Practice Complete!
        </h2>
        
        {/* Perfect score celebration */}
        {accuracy === 100 && perfectPhrase && (
          <p className="text-lg font-semibold text-highlighter-yellowDark mb-2 animate-bounce">
            {perfectPhrase}
          </p>
        )}
        
        <p className="text-ink-muted mb-4">
          You&apos;ve finished the {topicName} practice set.
        </p>

        {/* Accuracy display */}
        {accuracy !== null && (
          <div className={`rounded-xl p-4 mb-6 ${
            accuracy === 100 
              ? "bg-gradient-to-r from-highlighter-yellow/40 to-highlighter-green/40 border-2 border-green-300" 
              : accuracy >= 80 
                ? "bg-highlighter-green/20 border border-green-200"
                : "bg-highlighter-yellow/20 border border-highlighter-yellowDark/30"
          }`}>
            <p className="text-sm text-ink font-medium">
              Your accuracy: <span className={`text-lg font-bold ${
                accuracy === 100 ? "text-green-700" : accuracy >= 80 ? "text-green-600" : "text-ink"
              }`}>{accuracy}%</span>
            </p>
            {accuracy === 100 && (
              <p className="text-xs text-green-700 mt-1">Perfect score! 🌟</p>
            )}
          </div>
        )}

        {accuracy === null && (
          <div className="bg-highlighter-yellow/20 rounded-lg p-4 mb-6">
            <p className="text-sm text-ink">
              Sign in to track your progress and see your accuracy!
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/practice/${params.topicId}`}
            className="px-6 py-3 bg-white hover:bg-gray-50 text-ink font-medium rounded-xl border border-paper-lineDark transition-all"
          >
            Practice Again
          </Link>
          <Link
            href="/learn"
            className="px-6 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink font-semibold rounded-xl shadow-sm hover:shadow transition-all"
          >
            Back to Learn
          </Link>
        </div>
      </div>
    </div>
  );
}
