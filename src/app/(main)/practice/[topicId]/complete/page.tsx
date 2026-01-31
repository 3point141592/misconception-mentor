import Link from "next/link";
import { getTopicName } from "@/lib/content";

export default function PracticeCompletePage({ params }: { params: { topicId: string } }) {
  const topicName = getTopicName(params.topicId);

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-xl p-8 shadow-sm border border-paper-lineDark text-center">
        <span className="text-5xl mb-4 block">🎉</span>
        <h2 className="text-2xl font-bold text-ink mb-2 font-handwriting">
          Practice Complete!
        </h2>
        <p className="text-ink-muted mb-6">
          You&apos;ve finished the {topicName} practice set.
        </p>

        <div className="bg-highlighter-yellow/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-ink">
            Your progress will be saved and shown in the Learn tab 
            once we connect to the database.
          </p>
        </div>

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
