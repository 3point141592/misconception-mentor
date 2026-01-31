import Link from "next/link";

export type MasteryStatus = "not_started" | "learning" | "solid";

interface LessonCardProps {
  id: string;
  title: string;
  description: string;
  status: MasteryStatus;
  lessonNumber: number;
}

const statusConfig: Record<MasteryStatus, { label: string; color: string; bg: string }> = {
  not_started: { 
    label: "Not started", 
    color: "text-ink-muted", 
    bg: "bg-gray-100" 
  },
  learning: { 
    label: "Learning", 
    color: "text-amber-700", 
    bg: "bg-highlighter-yellow/50" 
  },
  solid: { 
    label: "Solid!", 
    color: "text-green-700", 
    bg: "bg-highlighter-green/50" 
  },
};

export function LessonCard({ id, title, description, status, lessonNumber }: LessonCardProps) {
  const { label, color, bg } = statusConfig[status];

  return (
    <Link href={`/learn/${id}`} className="block group">
      <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark hover:shadow-md hover:border-highlighter-yellowDark transition-all duration-200 hover:-translate-y-0.5">
        <div className="flex items-start justify-between mb-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-paper-line text-ink font-handwriting text-lg">
            {lessonNumber}
          </span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${bg} ${color}`}>
            {label}
          </span>
        </div>
        
        <h3 className="font-semibold text-ink text-lg mb-1 group-hover:text-highlighter-yellowDark transition-colors">
          {title}
        </h3>
        <p className="text-ink-muted text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </Link>
  );
}
