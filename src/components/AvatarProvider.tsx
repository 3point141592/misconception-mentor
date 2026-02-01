"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useDelight } from "./DelightProvider";
import { TeacherAvatar, AvatarState, AvatarPosition } from "./TeacherAvatar";
import { useTTS } from "./ReadAloudButton";
import { 
  playHeelFootsteps, 
  loadAvatarHomePosition, 
  saveAvatarHomePosition, 
  resetAvatarHomePosition,
  DEFAULT_AVATAR_HOME,
  type AvatarHomePosition 
} from "@/lib/delight";

// ============================================
// Types
// ============================================

export type AnchorId = 
  | "question" 
  | "answer-input" 
  | "explanation-box" 
  | "misconception-section" 
  | "coach-notes" 
  | "follow-up-question"
  | "key-takeaway"
  | "solution-steps";

// Home dock position (bottom-right corner)
const HOME_POSITION = { x: -1, y: -1 }; // -1 means "use default CSS position"

interface AvatarContextType {
  // State
  currentState: AvatarState;
  bubbleText: string;
  showBubble: boolean;
  position: AvatarPosition | null;
  isWalking: boolean;
  homePosition: AvatarHomePosition;
  
  // Actions
  setState: (state: AvatarState) => void;
  say: (text: string, speak?: boolean) => void;
  hideBubble: () => void;
  moveToAnchor: (anchorId: AnchorId | null) => Promise<void>;
  moveToDefault: () => Promise<void>;
  walkRightAngle: (targetX: number, targetY: number) => Promise<void>;
  celebrate: () => void;
  nudge: (message: string) => void;
  resetToHome: () => void;
  setHomePosition: (xPct: number, yPct: number) => void;
  resetHomePosition: () => void;
  
  // Nudge tracking
  nudgeCount: number;
  resetNudgeCount: () => void;
}

const AvatarContext = createContext<AvatarContextType | null>(null);

// ============================================
// Focus Mode Nudge Messages
// ============================================

const NUDGE_MESSAGES = {
  first: [
    "Still with me? Try the first step! 🤔",
    "Take your time! Start with what you know. 💭",
    "You've got this! What's the first thing to do? 🌟",
  ],
  second: [
    "Need a hint? Read the question again carefully. 📖",
    "Almost there! Focus on the main operation. 🎯",
    "You can do it! Break it into smaller pieces. 💪",
  ],
};

function getRandomNudgeMessage(isFirst: boolean): string {
  const messages = isFirst ? NUDGE_MESSAGES.first : NUDGE_MESSAGES.second;
  return messages[Math.floor(Math.random() * messages.length)];
}

// ============================================
// Avatar Provider Component
// ============================================

export function AvatarProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useDelight();
  const { speak: speakTTS, isPlaying: isSpeaking } = useTTS();
  const pathname = usePathname();
  
  // Avatar state
  const [currentState, setCurrentState] = useState<AvatarState>("idle");
  const [bubbleText, setBubbleText] = useState("");
  const [showBubble, setShowBubble] = useState(false);
  const [position, setPosition] = useState<AvatarPosition | null>(null);
  const [nudgeCount, setNudgeCount] = useState(0);
  const [isWalking, setIsWalking] = useState(false);
  const [homePosition, setHomePositionState] = useState<AvatarHomePosition>(DEFAULT_AVATAR_HOME);
  
  // Refs
  const bubbleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const footstepsStopRef = useRef<(() => void) | null>(null);
  const previousPathRef = useRef(pathname);
  const previousQuestionIdRef = useRef<string | null>(null);
  
  // Load home position from localStorage on mount
  useEffect(() => {
    const savedPosition = loadAvatarHomePosition();
    setHomePositionState(savedPosition);
  }, []);
  
  // Clear bubble timeout on unmount
  useEffect(() => {
    return () => {
      if (bubbleTimeoutRef.current) {
        clearTimeout(bubbleTimeoutRef.current);
      }
      if (footstepsStopRef.current) {
        footstepsStopRef.current();
      }
    };
  }, []);
  
  // Reset avatar to home when route changes
  useEffect(() => {
    if (pathname !== previousPathRef.current) {
      console.log("[Avatar] Route changed, resetting to home");
      previousPathRef.current = pathname;
      resetToHomeInternal();
    }
  }, [pathname]);
  
  // Internal reset function
  const resetToHomeInternal = useCallback(() => {
    // Stop any footsteps
    if (footstepsStopRef.current) {
      footstepsStopRef.current();
      footstepsStopRef.current = null;
    }
    
    // Clear bubble
    if (bubbleTimeoutRef.current) {
      clearTimeout(bubbleTimeoutRef.current);
    }
    setShowBubble(false);
    setBubbleText("");
    
    // Reset position and state
    setPosition(null);
    setCurrentState("idle");
    setIsWalking(false);
  }, []);
  
  // Set avatar state
  const setState = useCallback((state: AvatarState) => {
    setCurrentState(state);
  }, []);
  
  // Say something (show bubble, optionally speak)
  const say = useCallback((text: string, speak = false) => {
    // Clear any existing timeout
    if (bubbleTimeoutRef.current) {
      clearTimeout(bubbleTimeoutRef.current);
    }
    
    setBubbleText(text);
    setShowBubble(true);
    setCurrentState("speaking");
    
    // Speak if enabled
    if (speak && settings.voiceEnabled && settings.avatarSpeaks) {
      speakTTS(text);
    }
    
    // Auto-hide bubble after duration
    const duration = speak && settings.voiceEnabled && settings.avatarSpeaks ? 8000 : 5000;
    bubbleTimeoutRef.current = setTimeout(() => {
      setShowBubble(false);
      setCurrentState("idle");
    }, duration);
  }, [settings.voiceEnabled, settings.avatarSpeaks, speakTTS]);
  
  // Hide bubble
  const hideBubble = useCallback(() => {
    setShowBubble(false);
    setCurrentState("idle");
    if (bubbleTimeoutRef.current) {
      clearTimeout(bubbleTimeoutRef.current);
    }
  }, []);
  
  // Right-angle walk: horizontal first, then vertical
  const walkRightAngle = useCallback(async (targetX: number, targetY: number): Promise<void> => {
    return new Promise((resolve) => {
      setIsWalking(true);
      setCurrentState("walking");
      
      // Start footsteps if sound is enabled
      if (settings.soundEnabled) {
        footstepsStopRef.current = playHeelFootsteps(12, 150);
      }
      
      // Step 1: Move horizontally (along bottom edge)
      const midPosition: AvatarPosition = {
        x: targetX,
        y: position?.y ?? 20, // Stay at current Y or default bottom
      };
      
      setPosition(midPosition);
      
      // Step 2: After horizontal movement, move vertically
      setTimeout(() => {
        const finalPosition: AvatarPosition = {
          x: targetX,
          y: targetY,
        };
        setPosition(finalPosition);
        
        // End walking after vertical movement
        setTimeout(() => {
          // Stop footsteps
          if (footstepsStopRef.current) {
            footstepsStopRef.current();
            footstepsStopRef.current = null;
          }
          
          setIsWalking(false);
          setCurrentState("pointing");
          resolve();
        }, 500);
      }, 600);
    });
  }, [position, settings.soundEnabled]);
  
  // Move to anchor with right-angle path
  const moveToAnchor = useCallback(async (anchorId: AnchorId | null): Promise<void> => {
    if (!anchorId) {
      // No anchor specified - just stay in place
      return;
    }
    
    const element = document.querySelector(`[data-coach-anchor="${anchorId}"]`);
    if (!element) {
      console.log("[Avatar] Anchor not found:", anchorId);
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Calculate target position (to the left of the element)
    // X: position to the left of the element, but keep within viewport
    const targetX = Math.max(20, Math.min(rect.left - 120, viewportWidth - 200));
    // Y: bottom-relative positioning (CSS uses bottom: Npx)
    const targetY = Math.max(20, viewportHeight - rect.top - rect.height / 2 - 100);
    
    await walkRightAngle(targetX, targetY);
  }, [walkRightAngle]);
  
  // Move back to default (home) position
  const moveToDefault = useCallback(async (): Promise<void> => {
    return new Promise((resolve) => {
      setIsWalking(true);
      setCurrentState("walking");
      
      // Start footsteps if sound is enabled
      if (settings.soundEnabled) {
        footstepsStopRef.current = playHeelFootsteps(8, 150);
      }
      
      // First move horizontally to the right
      setTimeout(() => {
        // Then move to null (which uses CSS default position)
        setTimeout(() => {
          if (footstepsStopRef.current) {
            footstepsStopRef.current();
            footstepsStopRef.current = null;
          }
          
          setPosition(null);
          setIsWalking(false);
          setCurrentState("idle");
          resolve();
        }, 500);
      }, 600);
    });
  }, [settings.soundEnabled]);
  
  // Public reset to home
  const resetToHome = useCallback(() => {
    resetToHomeInternal();
  }, [resetToHomeInternal]);
  
  // Celebrate
  const celebrate = useCallback(() => {
    setCurrentState("celebrating");
    
    // Reset to idle after celebration
    setTimeout(() => {
      setCurrentState("idle");
    }, 2000);
  }, []);
  
  // Nudge (for Focus Mode)
  const nudge = useCallback((message: string) => {
    if (!settings.focusNudgesEnabled) return;
    
    setNudgeCount(prev => prev + 1);
    say(message, settings.avatarSpeaks);
  }, [settings.focusNudgesEnabled, settings.avatarSpeaks, say]);
  
  // Reset nudge count
  const resetNudgeCount = useCallback(() => {
    setNudgeCount(0);
  }, []);
  
  // Set home position (from drag)
  const setHomePosition = useCallback((xPct: number, yPct: number) => {
    const newPosition: AvatarHomePosition = { xPct, yPct };
    setHomePositionState(newPosition);
    saveAvatarHomePosition(newPosition);
  }, []);
  
  // Reset home position to default
  const resetHomePosition = useCallback(() => {
    setHomePositionState(DEFAULT_AVATAR_HOME);
    resetAvatarHomePosition();
  }, []);
  
  // Handle drag end from TeacherAvatar
  const handleDragEnd = useCallback((xPct: number, yPct: number) => {
    setHomePosition(xPct, yPct);
    // Clear any anchor position so avatar stays at new home
    setPosition(null);
  }, [setHomePosition]);
  
  return (
    <AvatarContext.Provider
      value={{
        currentState,
        bubbleText,
        showBubble,
        position,
        isWalking,
        homePosition,
        setState,
        say,
        hideBubble,
        moveToAnchor,
        moveToDefault,
        walkRightAngle,
        celebrate,
        nudge,
        resetToHome,
        setHomePosition,
        resetHomePosition,
        nudgeCount,
        resetNudgeCount,
      }}
    >
      {children}
      {/* Render the avatar globally */}
      {settings.avatarEnabled && (
        <TeacherAvatar
          state={currentState}
          bubbleText={bubbleText}
          showBubble={showBubble}
          position={position || undefined}
          homePosition={homePosition}
          onDragEnd={handleDragEnd}
          dragDisabled={isWalking}
        />
      )}
    </AvatarContext.Provider>
  );
}

// ============================================
// Hook to use Avatar
// ============================================

export function useAvatar() {
  const context = useContext(AvatarContext);
  if (!context) {
    throw new Error("useAvatar must be used within an AvatarProvider");
  }
  return context;
}

// ============================================
// Focus Mode Nudge Hook (legacy - fixed time)
// ============================================

interface UseFocusNudgesOptions {
  enabled: boolean;
  firstNudgeMs?: number;
  secondNudgeMs?: number;
  onNudge?: (count: number) => void;
}

export function useFocusNudges({
  enabled,
  firstNudgeMs = 25000,
  secondNudgeMs = 45000,
  onNudge,
}: UseFocusNudgesOptions) {
  const { settings } = useDelight();
  const avatar = useAvatar();
  
  const firstNudgeRef = useRef<NodeJS.Timeout | null>(null);
  const secondNudgeRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubmittedRef = useRef(false);
  
  const startNudgeTimers = useCallback(() => {
    if (!enabled || !settings.focusModeEnabled || !settings.focusNudgesEnabled) return;
    
    hasSubmittedRef.current = false;
    
    // First nudge at 25 seconds
    firstNudgeRef.current = setTimeout(() => {
      if (!hasSubmittedRef.current) {
        const message = getRandomNudgeMessage(true);
        avatar.nudge(message);
        onNudge?.(1);
      }
    }, firstNudgeMs);
    
    // Second nudge at 45 seconds
    secondNudgeRef.current = setTimeout(() => {
      if (!hasSubmittedRef.current) {
        const message = getRandomNudgeMessage(false);
        avatar.nudge(message);
        onNudge?.(2);
      }
    }, secondNudgeMs);
  }, [enabled, settings.focusModeEnabled, settings.focusNudgesEnabled, avatar, firstNudgeMs, secondNudgeMs, onNudge]);
  
  const stopNudgeTimers = useCallback(() => {
    hasSubmittedRef.current = true;
    
    if (firstNudgeRef.current) {
      clearTimeout(firstNudgeRef.current);
      firstNudgeRef.current = null;
    }
    if (secondNudgeRef.current) {
      clearTimeout(secondNudgeRef.current);
      secondNudgeRef.current = null;
    }
    
    avatar.resetNudgeCount();
    avatar.hideBubble();
  }, [avatar]);
  
  const resetNudgeTimers = useCallback(() => {
    stopNudgeTimers();
    startNudgeTimers();
  }, [stopNudgeTimers, startNudgeTimers]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (firstNudgeRef.current) clearTimeout(firstNudgeRef.current);
      if (secondNudgeRef.current) clearTimeout(secondNudgeRef.current);
    };
  }, []);
  
  return {
    startNudgeTimers,
    stopNudgeTimers,
    resetNudgeTimers,
    nudgeCount: avatar.nudgeCount,
  };
}

// ============================================
// Adaptive Focus Mode Nudge Hook (inactivity-based)
// ============================================

interface UseAdaptiveNudgesOptions {
  enabled: boolean;
  lastInteractionAt: number;
  baselineMs: number; // User's baseline time from recent submissions
  onNudge?: (count: number) => void;
}

export function useAdaptiveNudges({
  enabled,
  lastInteractionAt,
  baselineMs,
  onNudge,
}: UseAdaptiveNudgesOptions) {
  const { settings } = useDelight();
  const avatar = useAvatar();
  
  const nudgeCountRef = useRef(0);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubmittedRef = useRef(false);
  
  // Compute adaptive thresholds
  const firstNudgeMs = useMemo(() => {
    // 125% of baseline, clamped 6s - 90s
    return Math.max(6000, Math.min(90000, baselineMs * 1.25));
  }, [baselineMs]);
  
  const secondNudgeMs = useMemo(() => {
    // 175% of baseline, clamped (first + 6s) - 150s
    return Math.max(firstNudgeMs + 6000, Math.min(150000, baselineMs * 1.75));
  }, [baselineMs, firstNudgeMs]);
  
  const startNudgeMonitoring = useCallback(() => {
    if (!enabled || !settings.focusModeEnabled || !settings.focusNudgesEnabled) return;
    
    hasSubmittedRef.current = false;
    nudgeCountRef.current = 0;
    
    // Clear any existing interval
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }
    
    // Check for inactivity every 2 seconds
    checkIntervalRef.current = setInterval(() => {
      if (hasSubmittedRef.current || nudgeCountRef.current >= 2) {
        return;
      }
      
      const inactivityMs = Date.now() - lastInteractionAt;
      
      // First nudge check
      if (nudgeCountRef.current === 0 && inactivityMs >= firstNudgeMs) {
        const message = getRandomNudgeMessage(true);
        avatar.nudge(message);
        nudgeCountRef.current = 1;
        onNudge?.(1);
      }
      // Second nudge check
      else if (nudgeCountRef.current === 1 && inactivityMs >= secondNudgeMs) {
        const message = getRandomNudgeMessage(false);
        avatar.nudge(message);
        nudgeCountRef.current = 2;
        onNudge?.(2);
      }
    }, 2000);
  }, [enabled, settings.focusModeEnabled, settings.focusNudgesEnabled, avatar, firstNudgeMs, secondNudgeMs, lastInteractionAt, onNudge]);
  
  const stopNudgeMonitoring = useCallback(() => {
    hasSubmittedRef.current = true;
    
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    
    const count = nudgeCountRef.current;
    nudgeCountRef.current = 0;
    avatar.resetNudgeCount();
    avatar.hideBubble();
    
    return count;
  }, [avatar]);
  
  const resetOnInteraction = useCallback(() => {
    // When user interacts, reset nudge timers but don't stop monitoring
    nudgeCountRef.current = 0;
    avatar.hideBubble();
  }, [avatar]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);
  
  // Restart monitoring when lastInteractionAt changes significantly
  useEffect(() => {
    if (enabled && settings.focusModeEnabled && settings.focusNudgesEnabled) {
      startNudgeMonitoring();
    }
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [enabled, settings.focusModeEnabled, settings.focusNudgesEnabled, startNudgeMonitoring]);
  
  return {
    startNudgeMonitoring,
    stopNudgeMonitoring,
    resetOnInteraction,
    nudgeCount: nudgeCountRef.current,
    thresholds: { firstNudgeMs, secondNudgeMs, baselineMs },
  };
}

// Export for convenience
export { getRandomNudgeMessage };
