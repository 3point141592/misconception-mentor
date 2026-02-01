"use client";

export function DemoModeBadge() {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  if (!isDemoMode) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full border border-amber-300">
      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
      Demo Mode
    </span>
  );
}
