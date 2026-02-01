"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  getNotesByTopicId,
  type NoteBlock,
  type NoteSection,
  type NoteTopic,
  type CalloutBlock,
  type BulletsBlock,
  type ExampleBlock,
  type MiniQuizBlock,
  type ImageBlock,
  type LinksBlock,
} from "@/lib/content";
import { NarrationBlock, NarrationSkip } from "@/components/NarrationBlock";
import { useTranslation } from "@/components/I18nProvider";
import { getLessonTranslation } from "@/i18n";

// ============================================
// Block Renderers (colorful, kid-friendly)
// ============================================

// Callout tone configurations
const calloutConfig: Record<string, { bg: string; border: string; icon: string; titleColor: string }> = {
  rule: {
    bg: "bg-purple-50",
    border: "border-purple-300",
    icon: "📜",
    titleColor: "text-purple-800",
  },
  tip: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    icon: "💡",
    titleColor: "text-blue-800",
  },
  warn: {
    bg: "bg-amber-50",
    border: "border-amber-400",
    icon: "⚠️",
    titleColor: "text-amber-800",
  },
  fun: {
    bg: "bg-green-50",
    border: "border-green-300",
    icon: "🌟",
    titleColor: "text-green-800",
  },
};

function CalloutRenderer({ block, blockId }: { block: CalloutBlock; blockId: string }) {
  const config = calloutConfig[block.tone] || calloutConfig.tip;
  
  // Build narration text: title + all lines
  const narrationText = `${block.title}. ${block.lines.join(" ")}`;
  
  return (
    <NarrationBlock
      id={blockId}
      narrationText={narrationText}
      showButton={true}
      buttonPosition="top-right"
      className={`${config.bg} ${config.border} border-2 rounded-2xl p-5 shadow-sm`}
    >
      <h4 className={`${config.titleColor} font-bold text-lg mb-3 flex items-center gap-2 pr-20`}>
        <span className="text-xl">{config.icon}</span>
        {block.title}
      </h4>
      <div className="space-y-2">
        {block.lines.map((line, i) => (
          <p key={i} className="text-gray-700 leading-relaxed">{line}</p>
        ))}
      </div>
    </NarrationBlock>
  );
}

function BulletsRenderer({ block, blockId }: { block: BulletsBlock; blockId: string }) {
  // Build narration text: title + all items
  const narrationText = `${block.title}. ${block.items.join(". ")}`;
  
  // Only add narration for "Key Takeaways" type blocks
  const isKeyTakeaway = block.title.toLowerCase().includes("takeaway") || 
                        block.title.toLowerCase().includes("remember");
  
  if (isKeyTakeaway) {
    return (
      <NarrationBlock
        id={blockId}
        narrationText={narrationText}
        showButton={true}
        buttonPosition="top-right"
        className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5"
      >
        <h4 className="text-slate-800 font-bold text-lg mb-3 flex items-center gap-2 pr-20">
          <span className="text-xl">📝</span>
          {block.title}
        </h4>
        <ul className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-gray-700">
              <span className="text-emerald-500 mt-1 text-lg">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </NarrationBlock>
    );
  }
  
  // Non-narratable bullets (just regular lists)
  return (
    <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5">
      <h4 className="text-slate-800 font-bold text-lg mb-3 flex items-center gap-2">
        <span className="text-xl">📝</span>
        {block.title}
      </h4>
      <ul className="space-y-2">
        {block.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-gray-700">
            <span className="text-emerald-500 mt-1 text-lg">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExampleRenderer({ block, blockId }: { block: ExampleBlock; blockId: string }) {
  // Build narration text: problem + first 2 steps + answer
  const stepsToNarrate = block.steps.slice(0, 2);
  const narrationText = `Worked Example: ${block.prompt}. ${stepsToNarrate.map((s, i) => `Step ${i + 1}: ${s}`).join(". ")}. The answer is ${block.answer}.`;
  
  return (
    <NarrationBlock
      id={blockId}
      narrationText={narrationText}
      showButton={true}
      buttonPosition="top-right"
      className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-2xl p-5 shadow-sm"
    >
      <h4 className="text-orange-700 font-bold text-lg mb-3 flex items-center gap-2 pr-20">
        <span className="text-xl">✨</span>
        Worked Example
      </h4>
      
      {/* Problem */}
      <div className="bg-white rounded-xl p-4 border border-yellow-200 mb-4 shadow-inner">
        <p className="font-mono text-lg text-gray-800 font-semibold">{block.prompt}</p>
      </div>
      
      {/* Steps */}
      <ol className="space-y-2 mb-4">
        {block.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-gray-700">
            <span className="bg-orange-400 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      
      {/* Answer */}
      <div className="bg-emerald-100 rounded-xl p-4 border-2 border-emerald-300">
        <p className="text-emerald-800 font-bold flex items-center gap-2">
          <span className="text-xl">✓</span>
          Answer: <span className="font-mono text-lg">{block.answer}</span>
        </p>
      </div>
    </NarrationBlock>
  );
}

function MiniQuizRenderer({ block }: { block: MiniQuizBlock }) {
  const [revealed, setRevealed] = useState(false);
  
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-2xl p-5 shadow-sm">
      <h4 className="text-indigo-700 font-bold text-lg mb-3 flex items-center gap-2">
        <span className="text-xl">🧠</span>
        Check Yourself!
      </h4>
      
      {/* Question */}
      <div className="bg-white rounded-xl p-4 border border-indigo-200 mb-4">
        <p className="text-gray-800 font-medium">{block.question}</p>
      </div>
      
      {/* Reveal button or answer */}
      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-md"
        >
          🎯 Reveal Answer
        </button>
      ) : (
        <div className="space-y-3 animate-fade-in">
          <div className="bg-emerald-100 rounded-xl p-4 border-2 border-emerald-300">
            <p className="text-emerald-800 font-bold flex items-center gap-2">
              <span className="text-xl">✓</span>
              Answer: <span className="font-mono text-lg">{block.answer}</span>
            </p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <p className="text-blue-800 text-sm">
              <span className="font-semibold">Why? </span>
              {block.explain}
            </p>
          </div>
          <button
            onClick={() => setRevealed(false)}
            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium underline"
          >
            Hide answer
          </button>
        </div>
      )}
    </div>
  );
}

function ImageRenderer({ block }: { block: ImageBlock }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm">
      <div className="relative w-full aspect-[16/10] bg-gray-50">
        {/* Using img tag for SVGs from public folder */}
        <img
          src={block.src}
          alt={block.alt}
          className="w-full h-full object-contain p-4"
        />
      </div>
      {block.caption && (
        <div className="bg-gray-50 px-5 py-3 border-t border-gray-200">
          <p className="text-gray-600 text-sm text-center italic">{block.caption}</p>
        </div>
      )}
    </div>
  );
}

function LinksRenderer({ block }: { block: LinksBlock }) {
  return (
    <div className="bg-gradient-to-br from-cyan-50 to-teal-50 border-2 border-teal-300 rounded-2xl p-5">
      <h4 className="text-teal-700 font-bold text-lg mb-4 flex items-center gap-2">
        <span className="text-xl">🔗</span>
        Extra Resources
      </h4>
      <div className="space-y-3">
        {block.items.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white hover:bg-teal-50 p-4 rounded-xl border border-teal-200 transition-all hover:shadow-md group"
          >
            <span className="text-2xl">📚</span>
            <span className="flex-1 text-gray-700 group-hover:text-teal-700 font-medium">
              {item.label}
            </span>
            <svg
              className="w-5 h-5 text-teal-400 group-hover:text-teal-600 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}

// Block type router
function BlockRenderer({ block, sectionId, blockIndex }: { block: NoteBlock; sectionId: string; blockIndex: number }) {
  const blockId = `${sectionId}-block-${blockIndex}`;
  
  switch (block.type) {
    case "callout":
      return <CalloutRenderer block={block} blockId={blockId} />;
    case "bullets":
      return <BulletsRenderer block={block} blockId={blockId} />;
    case "example":
      return <ExampleRenderer block={block} blockId={blockId} />;
    case "mini_quiz":
      return <MiniQuizRenderer block={block} />;
    case "image":
      return <ImageRenderer block={block} />;
    case "links":
      return <LinksRenderer block={block} />;
    default:
      return null;
  }
}

// ============================================
// Section Renderer
// ============================================

function SectionRenderer({ section, accentColor }: { section: NoteSection; accentColor: string }) {
  const levelColors: Record<number, string> = {
    1: "from-green-400 to-emerald-500",
    2: "from-blue-400 to-cyan-500",
    3: "from-purple-400 to-indigo-500",
    4: "from-orange-400 to-amber-500",
    5: "from-pink-400 to-rose-500",
    6: "from-teal-400 to-cyan-500",
    7: "from-red-400 to-orange-500",
    99: "from-gray-400 to-slate-500", // Extra practice
  };
  
  const gradientClass = levelColors[section.level] || levelColors[1];
  const isExtraPractice = section.level === 99;
  
  return (
    <div className="mb-8">
      {/* Section header */}
      <div className={`bg-gradient-to-r ${gradientClass} rounded-t-2xl px-5 py-3`}>
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          {!isExtraPractice && (
            <span className="bg-white/30 rounded-full w-8 h-8 flex items-center justify-center text-sm">
              {section.level}
            </span>
          )}
          {section.title}
        </h3>
      </div>
      
      {/* Section content */}
      <div className="bg-white border-2 border-t-0 border-gray-200 rounded-b-2xl p-5 space-y-5">
        {section.blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} sectionId={section.id} blockIndex={i} />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function LessonDetailPage({ params }: { params: { topicId: string } }) {
  const { t, language } = useTranslation();
  const notes = getNotesByTopicId(params.topicId);
  const lessonTranslation = getLessonTranslation(language, params.topicId);

  if (!notes) {
    return (
      <div className="animate-fade-in text-center py-12">
        <p className="text-ink-muted">{t("learn.topicNotFound")}</p>
        <Link href="/learn" className="text-highlighter-yellowDark hover:underline mt-2 inline-block">
          ← {t("learn.backToLearn")}
        </Link>
      </div>
    );
  }

  // Sort sections by level
  const sortedSections = [...notes.sections].sort((a, b) => a.level - b.level);

  // Accent color mapping
  const accentColors: Record<string, { bg: string; text: string; border: string }> = {
    purple: { bg: "bg-purple-500", text: "text-purple-700", border: "border-purple-300" },
    teal: { bg: "bg-teal-500", text: "text-teal-700", border: "border-teal-300" },
    orange: { bg: "bg-orange-500", text: "text-orange-700", border: "border-orange-300" },
  };
  const accent = accentColors[notes.accent] || accentColors.purple;

  return (
    <div className="animate-fade-in">
      {/* Back link - marked to skip narration */}
      <NarrationSkip>
        <Link
          href="/learn"
          className="inline-flex items-center text-ink-muted hover:text-ink mb-4 transition-colors"
          data-narration-skip="true"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("learn.backToLearn")}
        </Link>
      </NarrationSkip>

      {/* Hero header with narration */}
      <NarrationBlock
        id="lesson-hero"
        narrationText={`${notes.title}. ${notes.subtitle}. ${notes.mascot.name} says: ${notes.mascot.catchphrase}`}
        showButton={true}
        buttonPosition="top-right"
        className={`${accent.bg} rounded-2xl p-6 mb-6 text-white shadow-lg`}
      >
        <div className="flex items-center gap-4 mb-3 pr-20">
          <span className="text-5xl">{notes.mascot.emoji}</span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-handwriting">
              {notes.title}
            </h1>
            <p className="text-white/90 text-lg mt-1">{notes.subtitle}</p>
          </div>
        </div>
        <div className="bg-white/20 rounded-xl px-4 py-2 inline-flex items-center gap-2 mt-2">
          <span className="text-lg">{notes.mascot.emoji}</span>
          <span className="font-medium italic">"{notes.mascot.catchphrase}"</span>
          <span className="text-sm opacity-75">— {notes.mascot.name}</span>
        </div>
      </NarrationBlock>

      {/* Progress indicator */}
      <div className="bg-white rounded-xl p-4 mb-6 border-2 border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">📍</span>
          <span className="font-semibold text-gray-700">
            {sortedSections.filter(s => s.level !== 99).length} {t("learn.levelsToMaster")}
          </span>
        </div>
        <div className="flex gap-1">
          {sortedSections.filter(s => s.level !== 99).map((section, i) => (
            <div
              key={i}
              className="flex-1 h-2 rounded-full bg-gradient-to-r from-green-400 to-emerald-500"
              style={{ opacity: 0.3 + (i * 0.1) }}
            />
          ))}
        </div>
      </div>

      {/* Sections */}
      {sortedSections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          accentColor={notes.accent}
        />
      ))}

      {/* Practice CTA - navigation, skip narration */}
      <NarrationSkip className="bg-gradient-to-r from-highlighter-yellow/50 to-highlighter-green/50 rounded-2xl p-6 border-2 border-highlighter-yellowDark/30 mt-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{notes.mascot.emoji}</span>
            <div>
              <h3 className="text-xl font-bold text-gray-800">{t("learn.readyToPractice")}</h3>
              <p className="text-gray-600">
                {t("learn.applyWhatYouLearned")}
              </p>
            </div>
          </div>
          <Link
            href={`/practice/${params.topicId}`}
            className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
            data-narration-skip="true"
          >
            🎯 {t("learn.startPractice")}
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </NarrationSkip>
    </div>
  );
}
