import Link from "next/link";

interface PracticeSetCardProps {
  id: string;
  title: string;
  questionsCompleted: number;
  totalQuestions: number;
  accuracy: number | null; // null if no attempts yet
  setNumber: number;
}

export function PracticeSetCard({ 
  id, 
  title, 
  questionsCompleted, 
  totalQuestions, 
  accuracy,
  setNumber 
}: PracticeSetCardProps) {
  const progress = totalQuestions > 0 ? (questionsCompleted / totalQuestions) * 100 : 0;
  
  return (
    <Link href={`/practice/${id}`} className="block group">
      <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark hover:shadow-md hover:border-highlighter-yellowDark transition-all duration-200 hover:-translate-y-0.5">
        <div className="flex items-start justify-between mb-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-highlighter-yellow text-ink font-handwriting text-lg">
            {setNumber}
          </span>
          {accuracy !== null && (
            <span className={`text-sm font-medium ${accuracy >= 70 ? "text-green-600" : "text-amber-600"}`}>
              {accuracy}% accuracy
            </span>
          )}
        </div>
        
        <h3 className="font-semibold text-ink text-lg mb-3 group-hover:text-highlighter-yellowDark transition-colors">
          {title}
        </h3>
        
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-ink-muted">
            <span>{questionsCompleted} / {totalQuestions} questions</span>
          </div>
          <div className="h-2 bg-paper-line rounded-full overflow-hidden">
            <div 
              className="h-full bg-highlighter-yellowDark rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
