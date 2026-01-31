"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { name: "Learn", href: "/learn" },
  { name: "Practice", href: "/practice" },
];

export function TabNavigation() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 bg-white/60 backdrop-blur-sm rounded-xl p-1 shadow-sm border border-paper-lineDark">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={`
              relative px-6 py-2.5 rounded-lg font-medium text-lg transition-all duration-200
              ${isActive 
                ? "text-ink bg-highlighter-yellow shadow-sm" 
                : "text-ink-muted hover:text-ink hover:bg-white/50"
              }
            `}
          >
            {tab.name}
            {isActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-highlighter-yellowDark rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
