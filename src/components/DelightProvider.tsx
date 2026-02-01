"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  DelightSettings,
  loadDelightSettings,
  saveDelightSettings,
  playSuccessSound,
  playFailSound,
  playPerfectSound,
  playSpeedBonusSound,
  fireConfetti,
  shouldCelebrateMilestone,
  markMilestoneCelebrated,
  getRandomPhrase,
} from "@/lib/delight";

interface DelightContextType {
  settings: DelightSettings;
  updateSettings: (settings: Partial<DelightSettings>) => void;
  // Sound functions (respect settings)
  playSuccess: () => void;
  playFail: () => void;
  playPerfect: () => void;
  playSpeedBonus: () => void;
  // Celebration function (respects settings + milestone tracking)
  celebrate: (milestoneKey: string) => void;
  // Encouragement phrases
  getPhrase: (type: "correct" | "incorrect" | "perfect") => string;
}

const DelightContext = createContext<DelightContextType | null>(null);

export function DelightProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<DelightSettings>({
    soundEnabled: true,
    celebrationsEnabled: true,
    focusModeEnabled: false,
    voiceEnabled: false,
    autoReadFeedback: false,
    showReadAloudButtons: true,
    avatarEnabled: true,
    avatarStyle: "teacher",
    avatarSize: "large", // Default to large for better visibility
    avatarSpeaks: false,
    focusNudgesEnabled: true,
    encouragementEnabled: true, // Default ON
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loaded = loadDelightSettings();
    setSettings(loaded);
    setIsLoaded(true);
  }, []);

  // Update settings
  const updateSettings = useCallback((newSettings: Partial<DelightSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveDelightSettings(updated);
      return updated;
    });
  }, []);

  // Sound functions that respect settings
  const playSuccess = useCallback(() => {
    if (settings.soundEnabled) {
      playSuccessSound();
    }
  }, [settings.soundEnabled]);

  const playFail = useCallback(() => {
    if (settings.soundEnabled) {
      playFailSound();
    }
  }, [settings.soundEnabled]);

  const playPerfect = useCallback(() => {
    if (settings.soundEnabled) {
      playPerfectSound();
    }
  }, [settings.soundEnabled]);

  const playSpeedBonus = useCallback(() => {
    if (settings.soundEnabled) {
      playSpeedBonusSound();
    }
  }, [settings.soundEnabled]);

  // Celebration function (confetti + perfect sound)
  const celebrate = useCallback((milestoneKey: string) => {
    // Check if we should celebrate (not already celebrated this milestone)
    if (!shouldCelebrateMilestone(milestoneKey)) {
      console.log("[Delight] Milestone already celebrated:", milestoneKey);
      return;
    }

    // Mark as celebrated
    markMilestoneCelebrated(milestoneKey);

    // Play sound if enabled
    if (settings.soundEnabled) {
      playPerfectSound();
    }

    // Fire confetti if enabled
    if (settings.celebrationsEnabled) {
      fireConfetti();
    }
  }, [settings.soundEnabled, settings.celebrationsEnabled]);

  // Get random encouragement phrase
  const getPhrase = useCallback((type: "correct" | "incorrect" | "perfect") => {
    return getRandomPhrase(type);
  }, []);

  return (
    <DelightContext.Provider
      value={{
        settings,
        updateSettings,
        playSuccess,
        playFail,
        playPerfect,
        playSpeedBonus,
        celebrate,
        getPhrase,
      }}
    >
      {children}
    </DelightContext.Provider>
  );
}

export function useDelight() {
  const context = useContext(DelightContext);
  if (!context) {
    throw new Error("useDelight must be used within a DelightProvider");
  }
  return context;
}
