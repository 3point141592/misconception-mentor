"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getQuestionsByTopic, getTopicName } from "@/lib/content";

export default function PracticeSetPage({ params }: { params: { topicId: string } }) {
  const router = useRouter();
  const questions = getQuestionsByTopic(params.topicId);
  const topicName = getTopicName(params.topicId);

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

  const startPractice = () => {
    // Start with the first question
    router.push(`/practice/${params.topicId}/${questions[0].id}`);
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
          {questions.length} questions to practice
        </p>

        <div className="bg-highlighter-yellow/20 border-l-4 border-highlighter-yellowDark p-4 rounded-r-lg mb-6">
          <p className="text-sm text-ink">
            <strong>Remember:</strong> If you get a question wrong, explain your thinking! 
            This helps us identify the exact misconception and give you targeted help.
          </p>
        </div>

        <button
          onClick={startPractice}
          className="inline-flex items-center justify-center w-full px-6 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink font-semibold rounded-xl shadow-sm hover:shadow transition-all"
        >
          Start Practice
          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Question preview list */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-ink-muted mb-2">Questions in this set:</h3>
        {questions.map((q, index) => (
          <div 
            key={q.id}
            className="bg-white/60 rounded-lg p-3 border border-paper-line text-sm"
          >
            <span className="text-ink-muted mr-2">{index + 1}.</span>
            <span className="text-ink font-mono">{q.prompt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
