import Link from "next/link";

// Topic content - will be enhanced in later chunks
const topicContent: Record<string, { title: string; explanation: string; example: string }> = {
  fractions: {
    title: "Fractions",
    explanation: "A fraction represents a part of a whole. When adding or subtracting fractions, you need a common denominator. Equivalent fractions have the same value but different numerators and denominators.",
    example: "To add 1/4 + 1/2, first find a common denominator (4). Convert 1/2 to 2/4. Then add: 1/4 + 2/4 = 3/4",
  },
  negatives: {
    title: "Negative Numbers",
    explanation: "Negative numbers are less than zero. Adding a negative is like subtracting. Multiplying two negatives gives a positive. The number line helps visualize operations.",
    example: "To calculate -3 + (-5), think of moving 3 left on the number line, then 5 more left. You end at -8.",
  },
  "linear-equations": {
    title: "Linear Equations",
    explanation: "To solve an equation, isolate the variable by doing the same operation to both sides. Undo addition/subtraction first, then multiplication/division.",
    example: "Solve 2x + 3 = 11: First subtract 3 from both sides → 2x = 8. Then divide by 2 → x = 4.",
  },
  "mixed-review": {
    title: "Mixed Review",
    explanation: "This section combines all topics to help you practice switching between different types of problems and reinforce your learning.",
    example: "Practice problems will include fractions, negative numbers, and linear equations in random order.",
  },
};

export default function LessonDetailPage({ params }: { params: { topicId: string } }) {
  const content = topicContent[params.topicId];

  if (!content) {
    return (
      <div className="animate-fade-in text-center py-12">
        <p className="text-ink-muted">Topic not found</p>
        <Link href="/learn" className="text-highlighter-yellowDark hover:underline mt-2 inline-block">
          ← Back to Learn
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Back link */}
      <Link 
        href="/learn" 
        className="inline-flex items-center text-ink-muted hover:text-ink mb-4 transition-colors"
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Learn
      </Link>

      {/* Lesson content card */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-paper-lineDark mb-6">
        <h2 className="text-2xl font-bold text-ink mb-4 font-handwriting">
          {content.title}
        </h2>
        
        <div className="prose prose-ink max-w-none">
          <h3 className="text-lg font-semibold text-ink mb-2">Key Concepts</h3>
          <p className="text-ink-light leading-relaxed mb-6">
            {content.explanation}
          </p>
          
          <h3 className="text-lg font-semibold text-ink mb-2">Worked Example</h3>
          <div className="bg-highlighter-yellow/20 border-l-4 border-highlighter-yellowDark p-4 rounded-r-lg">
            <p className="text-ink font-mono text-sm">
              {content.example}
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <Link
        href={`/practice/${params.topicId}`}
        className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3 bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink font-semibold rounded-xl shadow-sm hover:shadow transition-all"
      >
        Try Practice
        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
