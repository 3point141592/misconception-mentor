import Link from "next/link";

export type MasteryStatus = "not_started" | "learning" | "solid";

// Skill coverage data for mastery bar
interface SkillCoverageData {
  skillTag: string;
  skillName: string;
  attemptCount: number;
  coverageFactor: number;
  accuracy: number;
  skillScore: number;
}

// Topic mastery data
interface TopicMasteryData {
  percent: number;
  skills: SkillCoverageData[];
  lowestSkill: SkillCoverageData | null;
}

interface LessonCardProps {
  id: string;
  title: string;
  description: string;
  status: MasteryStatus;
  lessonNumber: number;
  masteryData?: TopicMasteryData | null;
}

// Get the health bar color based on percentage
function getMasteryColor(percent: number): { bar: string; text: string; bg: string } {
  if (percent >= 80) {
    return { bar: "bg-green-500", text: "text-green-700", bg: "bg-green-50" };
  } else if (percent >= 50) {
    return { bar: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" };
  } else if (percent > 0) {
    return { bar: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" };
  }
  return { bar: "bg-gray-300", text: "text-gray-500", bg: "bg-gray-50" };
}

// Get emoji for mastery level
function getMasteryEmoji(percent: number): string {
  if (percent >= 90) return "🏆";
  if (percent >= 80) return "⭐";
  if (percent >= 60) return "📈";
  if (percent >= 40) return "🎯";
  if (percent > 0) return "🌱";
  return "📚";
}

export function LessonCard({ id, title, description, status, lessonNumber, masteryData }: LessonCardProps) {
  const percent = masteryData?.percent ?? 0;
  const { bar, text, bg } = getMasteryColor(percent);
  const emoji = getMasteryEmoji(percent);
  const lowestSkill = masteryData?.lowestSkill;

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-paper-lineDark hover:shadow-md hover:border-highlighter-yellowDark transition-all duration-200 group">
      <div className="flex items-start justify-between mb-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-paper-line text-ink font-handwriting text-lg">
          {lessonNumber}
        </span>
        
        {/* Mastery badge with percentage */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bg}`}>
          <span className="text-sm">{emoji}</span>
          <span className={`text-xs font-bold ${text}`}>
            {percent}%
          </span>
        </div>
      </div>
      
      <h3 className="font-semibold text-ink text-lg mb-1">
        {title}
      </h3>
      <p className="text-ink-muted text-sm leading-relaxed mb-3">
        {description}
      </p>
      
      {/* Mastery Health Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-muted">Mastery</span>
          <span className={`text-xs font-medium ${text}`}>
            {percent >= 80 ? "Solid!" : percent >= 40 ? "Learning" : percent > 0 ? "Getting started" : "Not started"}
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className={`h-full ${bar} rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      
      {/* Subskill hint - shows next area to focus on */}
      {lowestSkill && (
        <div className="mb-3 px-2.5 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-700">
            <span className="font-medium">Next up:</span> {lowestSkill.skillName}
            {lowestSkill.attemptCount === 0 && " (not practiced yet)"}
          </p>
        </div>
      )}
      
      {/* Action buttons */}
      <div className="flex gap-2">
        <Link 
          href={`/learn/${id}`}
          className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-paper-bg hover:bg-paper-line text-ink text-sm font-medium rounded-lg border border-paper-lineDark transition-colors"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Read
        </Link>
        <Link 
          href={`/practice/${id}`}
          className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Practice
        </Link>
      </div>
    </div>
  );
}
