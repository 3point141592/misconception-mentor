"use client";

import { useState, useRef, useEffect } from "react";
import { useDelight } from "./DelightProvider";
import { useAvatar } from "./AvatarProvider";

export function SettingsPopover() {
  const { settings, updateSettings, playSuccess } = useDelight();
  const avatar = useAvatar();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleSound = () => {
    const newValue = !settings.soundEnabled;
    updateSettings({ soundEnabled: newValue });
    // Play a test sound when enabling
    if (newValue) {
      setTimeout(() => playSuccess(), 100);
    }
  };

  const handleToggleCelebrations = () => {
    updateSettings({ celebrationsEnabled: !settings.celebrationsEnabled });
  };

  const handleToggleFocusMode = () => {
    updateSettings({ focusModeEnabled: !settings.focusModeEnabled });
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Settings button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-ink-muted hover:text-ink hover:bg-white/50 rounded-lg transition-colors"
        aria-label="Settings"
        title="Settings"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-paper-lineDark z-50 animate-fade-in">
          <div className="p-4">
            <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
              <span className="text-lg">⚙️</span>
              Settings
            </h3>

            <div className="space-y-4">
              {/* Sound effects toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔊</span>
                  <span className="text-sm text-ink">Sound effects</span>
                </div>
                <button
                  onClick={handleToggleSound}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.soundEnabled ? "bg-green-500" : "bg-gray-300"
                  }`}
                  role="switch"
                  aria-checked={settings.soundEnabled}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      settings.soundEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {/* Celebrations toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎉</span>
                  <span className="text-sm text-ink">Celebrations</span>
                </div>
                <button
                  onClick={handleToggleCelebrations}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.celebrationsEnabled ? "bg-green-500" : "bg-gray-300"
                  }`}
                  role="switch"
                  aria-checked={settings.celebrationsEnabled}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      settings.celebrationsEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {/* Focus Mode toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⏱️</span>
                  <span className="text-sm text-ink">Focus Mode</span>
                </div>
                <button
                  onClick={handleToggleFocusMode}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.focusModeEnabled ? "bg-blue-500" : "bg-gray-300"
                  }`}
                  role="switch"
                  aria-checked={settings.focusModeEnabled}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      settings.focusModeEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {/* Voice section divider */}
              <div className="pt-3 mt-3 border-t border-paper-line">
                <p className="text-xs text-ink-muted mb-3 font-medium">🎤 Voice (ElevenLabs)</p>
              </div>

              {/* Voice narration toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔈</span>
                  <span className="text-sm text-ink">Voice narration</span>
                </div>
                <button
                  onClick={() => updateSettings({ voiceEnabled: !settings.voiceEnabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.voiceEnabled ? "bg-purple-500" : "bg-gray-300"
                  }`}
                  role="switch"
                  aria-checked={settings.voiceEnabled}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      settings.voiceEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {/* Auto-read feedback toggle (only visible when voice is enabled) */}
              {settings.voiceEnabled && (
                <label className="flex items-center justify-between cursor-pointer ml-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted">Auto-read feedback</span>
                  </div>
                  <button
                    onClick={() => updateSettings({ autoReadFeedback: !settings.autoReadFeedback })}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      settings.autoReadFeedback ? "bg-purple-400" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={settings.autoReadFeedback}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        settings.autoReadFeedback ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              )}

              {/* Show read-aloud buttons toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📖</span>
                  <span className="text-sm text-ink">Read-aloud buttons</span>
                </div>
                <button
                  onClick={() => updateSettings({ showReadAloudButtons: !settings.showReadAloudButtons })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.showReadAloudButtons ? "bg-purple-500" : "bg-gray-300"
                  }`}
                  role="switch"
                  aria-checked={settings.showReadAloudButtons}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      settings.showReadAloudButtons ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {/* Avatar section divider */}
              <div className="pt-3 mt-3 border-t border-paper-line">
                <p className="text-xs text-ink-muted mb-3 font-medium">👩‍🏫 Teacher Avatar</p>
              </div>

              {/* Teacher Avatar toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👩‍🏫</span>
                  <span className="text-sm text-ink">Teacher Avatar</span>
                </div>
                <button
                  onClick={() => updateSettings({ avatarEnabled: !settings.avatarEnabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.avatarEnabled ? "bg-amber-500" : "bg-gray-300"
                  }`}
                  role="switch"
                  aria-checked={settings.avatarEnabled}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      settings.avatarEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              {/* Avatar style selector (only visible when avatar is enabled) */}
              {settings.avatarEnabled && (
                <div className="ml-4 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-ink-muted">Style:</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateSettings({ avatarStyle: "teacher" })}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                        settings.avatarStyle === "teacher"
                          ? "bg-purple-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      👩‍🏫 Teacher
                    </button>
                    <button
                      onClick={() => updateSettings({ avatarStyle: "owl" })}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-all flex items-center gap-1 ${
                        settings.avatarStyle === "owl"
                          ? "bg-purple-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      🦉 Owl
                    </button>
                  </div>
                </div>
              )}

              {/* Avatar size selector (only visible when avatar is enabled) */}
              {settings.avatarEnabled && (
                <div className="ml-4 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-ink-muted">Size:</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(["small", "medium", "large", "xl"] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => updateSettings({ avatarSize: size })}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                          settings.avatarSize === size
                            ? "bg-amber-500 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {size === "xl" ? "XL" : size.charAt(0).toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Avatar speaks toggle (only visible when avatar and voice are enabled) */}
              {settings.avatarEnabled && settings.voiceEnabled && (
                <label className="flex items-center justify-between cursor-pointer ml-4 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted">Avatar speaks</span>
                  </div>
                  <button
                    onClick={() => updateSettings({ avatarSpeaks: !settings.avatarSpeaks })}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      settings.avatarSpeaks ? "bg-amber-400" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={settings.avatarSpeaks}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        settings.avatarSpeaks ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              )}

              {/* Focus nudges toggle (only visible when avatar is enabled) */}
              {settings.avatarEnabled && (
                <label className="flex items-center justify-between cursor-pointer ml-4 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted">Focus nudges</span>
                  </div>
                  <button
                    onClick={() => updateSettings({ focusNudgesEnabled: !settings.focusNudgesEnabled })}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      settings.focusNudgesEnabled ? "bg-amber-400" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={settings.focusNudgesEnabled}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        settings.focusNudgesEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              )}
              
              {/* Encouragement toggle (only visible when avatar is enabled) */}
              {settings.avatarEnabled && (
                <label className="flex items-center justify-between cursor-pointer ml-4 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted">Encouragement</span>
                  </div>
                  <button
                    onClick={() => updateSettings({ encouragementEnabled: !settings.encouragementEnabled })}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      settings.encouragementEnabled ? "bg-amber-400" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={settings.encouragementEnabled}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        settings.encouragementEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              )}
              
              {/* Reset avatar position (only visible when avatar is enabled) */}
              {settings.avatarEnabled && (
                <div className="ml-4 mt-3 pt-2 border-t border-paper-line/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-muted">Position</span>
                      <span className="text-xs text-ink-muted/70">
                        (drag to move)
                      </span>
                    </div>
                    <button
                      onClick={() => avatar.resetHomePosition()}
                      className="px-2 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="text-xs text-ink-muted mt-4 pt-3 border-t border-paper-line space-y-1">
              <p>💡 Celebrations auto-disable if you prefer reduced motion.</p>
              <p>⏱️ Focus Mode adds a timer and tracks your efficiency score.</p>
              <p>🎤 Voice uses ElevenLabs for high-quality read-aloud.</p>
              <p>👩‍🏫 Drag avatar to move. Encouragement gives varied, context-aware messages.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
