"use client";

import { useDelight } from "./DelightProvider";

interface FocusModeToggleProps {
  /** Compact mode for inline use (e.g., on practice page) */
  compact?: boolean;
}

export function FocusModeToggle({ compact = false }: FocusModeToggleProps) {
  const { settings, updateSettings } = useDelight();
  const isOn = settings.focusModeEnabled;

  const handleToggle = () => {
    updateSettings({ focusModeEnabled: !isOn });
    console.log("[FocusMode] Toggled to:", !isOn);
  };

  if (compact) {
    // Compact chip-style toggle for practice pages
    return (
      <button
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          isOn
            ? "bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200"
            : "bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200"
        }`}
        title={isOn ? "Focus Mode ON - Click to disable" : "Focus Mode OFF - Click to enable timer & efficiency tracking"}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isOn ? "bg-blue-500 animate-pulse" : "bg-gray-400"}`} />
        <span>⏱️</span>
        <span>Focus {isOn ? "ON" : "OFF"}</span>
      </button>
    );
  }

  // Full header toggle with switch
  return (
    <div className="flex items-center gap-2" title="Track time + efficiency (optional)">
      <span className="text-lg">⏱️</span>
      <span className="text-sm text-ink hidden sm:inline">Focus</span>
      <button
        onClick={handleToggle}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          isOn ? "bg-blue-500" : "bg-gray-300"
        }`}
        role="switch"
        aria-checked={isOn}
        aria-label={`Focus Mode ${isOn ? "enabled" : "disabled"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            isOn ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      {isOn && (
        <span className="text-xs text-blue-600 font-medium hidden sm:inline">ON</span>
      )}
    </div>
  );
}
