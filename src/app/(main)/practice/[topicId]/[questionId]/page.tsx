"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getQuestionById, getQuestionsByTopic, getTopicName, getMisconceptionsByIds } from "@/lib/content";
import { useAuth } from "@/components/AuthProvider";
import { saveAttempt, incrementMisconceptionStat, updateMastery, getAttemptsByTopic } from "@/lib/supabase/db";
import type { EvaluationResult, DiagnosisResult } from "@/lib/types";

// Mock diagnosis for now - will be replaced with API call in Chunk 6
function mockDiagnose(
  studentAnswer: string, 
  studentExplanation: string,
  candidateMisconceptionIds: string[]
): DiagnosisResult {
  const misconceptions = getMisconceptionsByIds(candidateMisconceptionIds);
  
  // Pick top 3 misconceptions (in real version, AI will rank these)
  const top3 = misconceptions.slice(0, 3).map((m, i) => ({
    id: m.id,
    name: m.name,
    confidence: 0.9 - i * 0.2,
    evidence: studentExplanation.length > 0 
      ? `"${studentExplanation.slice(0, 50)}..."` 
      : "none provided",
    diagnosis: m.description,
    remediation: m.remediation_template,
  }));

  return {
    top_3: top3,
    next_practice_question: {
      prompt: "Try this similar problem to practice",
      correct_answer: "TBD",
      why_this_targets: "This targets the same concept",
    },
    teach_back_prompt: "Can you explain in your own words why the correct method works?",
  };
}

type FeedbackState = {
  evaluation: EvaluationResult;
  diagnosis?: DiagnosisResult;
} | null;

export default function PracticeQuestionPage({ 
  params 
}: { 
  params: { topicId: string; questionId: string } 
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const question = getQuestionById(params.topicId, params.questionId);
  const questions = getQuestionsByTopic(params.topicId);
  const topicName = getTopicName(params.topicId);
  
  const currentIndex = questions.findIndex((q) => q.id === params.questionId);
  const nextQuestion = questions[currentIndex + 1];

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;

    setIsSubmitting(true);
    setApiError(null);
    
    try {
      // Call /api/evaluate
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_prompt: question.prompt,
          correct_answer: question.correct_answer,
          student_answer: answer,
          student_explanation: explanation || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to evaluate answer");
      }

      const evaluation: EvaluationResult = {
        is_correct: data.is_correct,
        solution_steps: data.solution_steps,
        short_feedback: data.short_feedback,
      };
      
      // Mock diagnosis if incorrect (Chunk 6 will replace this)
      let diagnosis: DiagnosisResult | undefined;
      if (!evaluation.is_correct) {
        diagnosis = mockDiagnose(answer, explanation, question.candidate_misconception_ids);
      }

      setFeedback({ evaluation, diagnosis });

      // Save attempt if user is logged in
      if (user) {
        setSaveStatus("saving");
        try {
          const { error } = await saveAttempt({
            user_id: user.id,
            question_id: question.id,
            topic: question.topic,
            answer_text: answer,
            explanation_text: explanation || null,
            is_correct: evaluation.is_correct,
            top_misconceptions: diagnosis?.top_3 || null,
          });

          if (error) {
            console.error("Failed to save attempt:", error);
            setSaveStatus("error");
          } else {
            setSaveStatus("saved");

            // Update misconception stats if incorrect
            if (!evaluation.is_correct && diagnosis?.top_3[0]) {
              await incrementMisconceptionStat(user.id, diagnosis.top_3[0].id);
            }

            // Update mastery for this topic
            const topicAttempts = await getAttemptsByTopic(user.id, question.topic);
            const recentAttempts = topicAttempts.slice(0, 10);
            if (recentAttempts.length > 0) {
              const correctCount = recentAttempts.filter((a) => a.is_correct).length;
              const accuracy = (correctCount / recentAttempts.length) * 100;
              await updateMastery(user.id, question.topic, accuracy);
            }
          }
        } catch (err) {
          console.error("Failed to save attempt:", err);
          setSaveStatus("error");
        }
      }

    } catch (error) {
      console.error("Evaluation error:", error);
      setApiError(error instanceof Error ? error.message : "Failed to evaluate answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (nextQuestion) {
      router.push(`/practice/${params.topicId}/${nextQuestion.id}`);
      // Reset state for next question
      setAnswer("");
      setExplanation("");
      setFeedback(null);
      setApiError(null);
      setSaveStatus("idle");
    } else {
      // End of practice set
      router.push(`/practice/${params.topicId}/complete`);
    }
  };

  const handleTryAgain = () => {
    setAnswer("");
    setExplanation("");
    setFeedback(null);
    setApiError(null);
    setSaveStatus("idle");
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link 
          href={`/practice/${params.topicId}`}
          className="inline-flex items-center text-ink-muted hover:text-ink transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <span className="text-sm text-ink-muted">
          {topicName} • Question {currentIndex + 1} of {questions.length}
        </span>
      </div>

      {!feedback ? (
        // Question form
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark mb-4">
            {/* Question */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-ink-muted mb-2">
                Question
              </label>
              <p className="text-2xl font-mono text-ink">
                {question.prompt}
              </p>
            </div>

            {/* Answer input */}
            <div className="mb-4">
              <label htmlFor="answer" className="block text-sm font-medium text-ink-muted mb-2">
                Your Answer
              </label>
              <input
                id="answer"
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter your answer..."
                className="w-full px-4 py-3 border border-paper-lineDark rounded-lg focus:outline-none focus:ring-2 focus:ring-highlighter-yellow focus:border-transparent text-lg font-mono"
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>

            {/* Explanation input */}
            <div>
              <label htmlFor="explanation" className="block text-sm font-medium text-ink-muted mb-2">
                Explain your thinking <span className="text-ink-muted">(optional but helpful!)</span>
              </label>
              <textarea
                id="explanation"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="How did you get your answer? What steps did you take?"
                rows={3}
                className="w-full px-4 py-3 border border-paper-lineDark rounded-lg focus:outline-none focus:ring-2 focus:ring-highlighter-yellow focus:border-transparent resize-none"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* API Error */}
          {apiError && (
            <div className="bg-highlighter-pink/20 border border-pink-300 rounded-lg p-3 mb-4">
              <p className="text-sm text-pink-800">
                <strong>Error:</strong> {apiError}
              </p>
              <p className="text-xs text-pink-600 mt-1">
                Check that OPENAI_API_KEY is set in .env.local and restart the server.
              </p>
            </div>
          )}

          {/* Sign in prompt if not logged in */}
          {!user && (
            <div className="bg-highlighter-yellow/20 border border-highlighter-yellowDark/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-ink">
                💡 <strong>Sign in</strong> to save your progress and track your improvement!
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!answer.trim() || isSubmitting}
            className="w-full px-6 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark disabled:bg-gray-200 disabled:cursor-not-allowed text-ink font-semibold rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking...
              </>
            ) : (
              "Check"
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
              : "bg-highlighter-pink/30 border border-pink-300"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {feedback.evaluation.is_correct ? (
                  <span className="text-3xl">🎉</span>
                ) : (
                  <span className="text-3xl">🤔</span>
                )}
                <div>
                  <h3 className="text-xl font-bold text-ink">
                    {feedback.evaluation.is_correct ? "Correct!" : "Not quite right"}
                  </h3>
                  <p className="text-ink-light text-sm">{feedback.evaluation.short_feedback}</p>
                </div>
              </div>
              {/* Save status indicator */}
              {user && (
                <div className="text-xs text-ink-muted">
                  {saveStatus === "saving" && "Saving..."}
                  {saveStatus === "saved" && "✓ Saved"}
                  {saveStatus === "error" && "⚠ Save failed"}
                </div>
              )}
            </div>
          </div>

          {/* Solution steps (for incorrect answers) */}
          {!feedback.evaluation.is_correct && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark">
              <h4 className="font-semibold text-ink mb-3">Correct Solution</h4>
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

          {/* Misconception analysis (for incorrect answers) */}
          {feedback.diagnosis && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark">
              <h4 className="font-semibold text-ink mb-4">What went wrong?</h4>
              
              {/* Top misconception */}
              <div className="bg-highlighter-pink/10 border-l-4 border-highlighter-pink p-4 rounded-r-lg mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-ink">{feedback.diagnosis.top_3[0]?.name}</span>
                  <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">
                    {Math.round((feedback.diagnosis.top_3[0]?.confidence || 0) * 100)}% likely
                  </span>
                </div>
                <p className="text-sm text-ink-muted mb-2">
                  <strong>Evidence:</strong> {feedback.diagnosis.top_3[0]?.evidence}
                </p>
                <p className="text-sm text-ink-light">
                  {feedback.diagnosis.top_3[0]?.diagnosis}
                </p>
              </div>

              {/* Remediation */}
              <div className="bg-highlighter-yellow/20 border-l-4 border-highlighter-yellowDark p-4 rounded-r-lg mb-4">
                <h5 className="font-medium text-ink mb-2">💡 Here&apos;s how to fix it:</h5>
                <p className="text-sm text-ink-light">
                  {feedback.diagnosis.top_3[0]?.remediation}
                </p>
              </div>

              {/* Other possible misconceptions */}
              {feedback.diagnosis.top_3.length > 1 && (
                <div className="mt-4">
                  <h5 className="text-sm font-medium text-ink-muted mb-2">Other possibilities:</h5>
                  <div className="space-y-1">
                    {feedback.diagnosis.top_3.slice(1).map((m) => (
                      <div key={m.id} className="text-sm text-ink-muted flex justify-between">
                        <span>{m.name}</span>
                        <span>{Math.round(m.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Teach-back prompt */}
              <div className="mt-4 pt-4 border-t border-paper-line">
                <p className="text-sm text-ink-muted italic">
                  {feedback.diagnosis.teach_back_prompt}
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {!feedback.evaluation.is_correct && (
              <button
                onClick={handleTryAgain}
                className="flex-1 px-6 py-3 bg-white hover:bg-gray-50 text-ink font-medium rounded-xl border border-paper-lineDark transition-all"
              >
                Try Again
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 px-6 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink font-semibold rounded-xl shadow-sm hover:shadow transition-all"
            >
              {nextQuestion ? "Next Question" : "Finish Practice"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
