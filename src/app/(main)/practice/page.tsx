import { PracticeSetCard } from "@/components/PracticeSetCard";

// Mock data - will be replaced with real data in later chunks
const practiceSets = [
  {
    id: "fractions",
    title: "Fractions Practice",
    questionsCompleted: 0,
    totalQuestions: 10,
    accuracy: null as number | null,
    setNumber: 1,
  },
  {
    id: "negatives",
    title: "Negative Numbers Practice",
    questionsCompleted: 0,
    totalQuestions: 10,
    accuracy: null as number | null,
    setNumber: 2,
  },
  {
    id: "linear-equations",
    title: "Linear Equations Practice",
    questionsCompleted: 0,
    totalQuestions: 10,
    accuracy: null as number | null,
    setNumber: 3,
  },
  {
    id: "mixed-review",
    title: "Mixed Review",
    questionsCompleted: 0,
    totalQuestions: 15,
    accuracy: null as number | null,
    setNumber: 4,
  },
];

export default function PracticePage() {
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-ink mb-1">Practice</h2>
        <p className="text-ink-muted">
          Choose a practice set and test your skills. We&apos;ll help you learn from your mistakes.
        </p>
      </div>

      {/* Practice set cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {practiceSets.map((set) => (
          <PracticeSetCard key={set.id} {...set} />
        ))}
      </div>

      {/* Tip box */}
      <div className="mt-8 bg-highlighter-yellow/30 border border-highlighter-yellowDark/30 rounded-xl p-4">
        <p className="text-sm text-ink">
          <strong className="text-ink">💡 Tip:</strong> When you get a question wrong, explain your thinking. 
          This helps us identify exactly what went wrong so we can help you improve!
        </p>
      </div>
    </div>
  );
}
