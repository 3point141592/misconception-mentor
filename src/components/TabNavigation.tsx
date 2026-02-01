"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "./I18nProvider";

const tabs = [
  { key: "common.learn", href: "/learn" },
  { key: "common.practice", href: "/practice" },
  { key: "common.dashboard", href: "/dashboard" },
];

export function TabNavigation() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav className="flex gap-1 bg-white/60 backdrop-blur-sm rounded-xl p-1 shadow-sm border border-paper-lineDark">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        const name = t(tab.key);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`
              relative px-6 py-2.5 rounded-lg font-medium text-lg transition-all duration-200
              ${isActive 
                ? "text-ink bg-highlighter-yellow shadow-sm" 
                : "text-ink-muted hover:text-ink hover:bg-white/50"
              }
            `}
          >
            {name}
            {isActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-highlighter-yellowDark rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
