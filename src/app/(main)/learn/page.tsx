import { LessonCard, MasteryStatus } from "@/components/LessonCard";
import { ProgressStats } from "@/components/ProgressStats";

// Mock data - will be replaced with real data in later chunks
const lessons = [
  {
    id: "fractions",
    title: "Fractions",
    description: "Add, subtract, and find equivalent fractions with confidence.",
    status: "not_started" as MasteryStatus,
    lessonNumber: 1,
  },
  {
    id: "negatives",
    title: "Negative Numbers",
    description: "Master adding, subtracting, and multiplying with negatives.",
    status: "not_started" as MasteryStatus,
    lessonNumber: 2,
  },
  {
    id: "linear-equations",
    title: "Linear Equations",
    description: "Solve one-step and two-step equations like a pro.",
    status: "not_started" as MasteryStatus,
    lessonNumber: 3,
  },
  {
    id: "mixed-review",
    title: "Mixed Review",
    description: "Practice all topics together to strengthen your skills.",
    status: "not_started" as MasteryStatus,
    lessonNumber: 4,
  },
];

// Mock progress data
const mockProgress = {
  accuracy: null as number | null,
  topMisconceptions: [] as { id: string; name: string; count: number }[],
};

export default function LearnPage() {
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-ink mb-1">Learn</h2>
        <p className="text-ink-muted">
          Start with a lesson, then practice to build mastery.
        </p>
      </div>

      {/* Lesson cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {lessons.map((lesson) => (
          <LessonCard key={lesson.id} {...lesson} />
        ))}
      </div>

      {/* Progress section */}
      <ProgressStats 
        accuracy={mockProgress.accuracy} 
        topMisconceptions={mockProgress.topMisconceptions} 
      />
    </div>
  );
}
