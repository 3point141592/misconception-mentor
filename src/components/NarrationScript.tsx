"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useDelight } from "./DelightProvider";
import { useTTS, stopGlobalAudio } from "./ReadAloudButton";
import { useAvatar, AnchorId } from "./AvatarProvider";

// ============================================
// Types
// ============================================

export interface NarrationSegment {
  id: string;
  anchorId: AnchorId | null; // null = don't move, just speak
  textToSpeak: string;
  highlightClass?: string; // CSS class to apply while speaking
}

export interface NarrationScript {
  segments: NarrationSegment[];
}

interface NarrationState {
  isRunning: boolean;
  currentSegmentIndex: number;
  currentSegmentId: string | null;
}

// ============================================
// Build Feedback Script (Incorrect Answer)
// ============================================

interface FeedbackScriptParams {
  keyTakeaway?: string;
  whatWentWrong: string; // misconception or review error summary
  solutionSteps: string[];
  coachRemember?: string;
}

export function buildIncorrectFeedbackScript(params: FeedbackScriptParams): NarrationScript {
  const segments: NarrationSegment[] = [];
  
  // 1) Key takeaway FIRST
  if (params.keyTakeaway) {
    segments.push({
      id: "key-takeaway",
      anchorId: "key-takeaway",
      textToSpeak: "Key takeaway: " + params.keyTakeaway,
    });
  }
  
  // 2) What went wrong (misconception or review error)
  segments.push({
    id: "what-went-wrong",
    anchorId: "misconception-section",
    textToSpeak: params.whatWentWrong,
  });
  
  // 3) Solution steps (ALL steps, in order)
  if (params.solutionSteps.length > 0) {
    const stepsText = params.solutionSteps
      .map((step, i) => `Step ${i + 1}: ${step}`)
      .join(". ");
    segments.push({
      id: "solution-steps",
      anchorId: "solution-steps",
      textToSpeak: "Here's how to solve it. " + stepsText,
    });
  }
  
  // 4) Coach remember line (optional, at end)
  if (params.coachRemember) {
    segments.push({
      id: "coach-remember",
      anchorId: "coach-notes",
      textToSpeak: "Remember: " + params.coachRemember,
    });
  }
  
  return { segments };
}

// ============================================
// Build Feedback Script (Correct Answer)
// ============================================

interface CorrectFeedbackScriptParams {
  shortFeedback: string;
  coachRemember?: string;
}

export function buildCorrectFeedbackScript(params: CorrectFeedbackScriptParams): NarrationScript {
  const segments: NarrationSegment[] = [];
  
  segments.push({
    id: "correct-feedback",
    anchorId: null, // Avatar celebrates in place
    textToSpeak: "Correct! " + params.shortFeedback,
  });
  
  if (params.coachRemember) {
    segments.push({
      id: "coach-remember",
      anchorId: "coach-notes",
      textToSpeak: "Remember: " + params.coachRemember,
    });
  }
  
  return { segments };
}

// ============================================
// Narration Queue Runner Hook
// ============================================

interface UseNarrationQueueOptions {
  script: NarrationScript | null;
  onSegmentStart?: (segment: NarrationSegment) => void;
  onSegmentEnd?: (segment: NarrationSegment) => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function useNarrationQueue({
  script,
  onSegmentStart,
  onSegmentEnd,
  onComplete,
  onCancel,
}: UseNarrationQueueOptions) {
  const { settings } = useDelight();
  const { speak, isPlaying, stopAudio } = useTTS();
  const avatar = useAvatar();
  
  const [state, setState] = useState<NarrationState>({
    isRunning: false,
    currentSegmentIndex: -1,
    currentSegmentId: null,
  });
  
  const isRunningRef = useRef(false);
  const cancelledRef = useRef(false);
  const audioEndResolveRef = useRef<(() => void) | null>(null);
  
  // Watch for audio ending to advance to next segment
  useEffect(() => {
    if (!isPlaying && audioEndResolveRef.current) {
      audioEndResolveRef.current();
      audioEndResolveRef.current = null;
    }
  }, [isPlaying]);
  
  // Wait for audio to finish
  const waitForAudioEnd = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (!isPlaying) {
        resolve();
        return;
      }
      audioEndResolveRef.current = resolve;
    });
  }, [isPlaying]);
  
  // Run a single segment
  const runSegment = useCallback(async (segment: NarrationSegment) => {
    if (cancelledRef.current) return;
    
    onSegmentStart?.(segment);
    
    // Move avatar to anchor if specified
    if (segment.anchorId) {
      avatar.moveToAnchor(segment.anchorId);
      // Wait for walking animation
      await new Promise(r => setTimeout(r, 1200));
    }
    
    if (cancelledRef.current) return;
    
    // Speak text (avatar or just TTS)
    if (settings.voiceEnabled) {
      if (settings.avatarSpeaks) {
        avatar.say(segment.textToSpeak, true);
      } else {
        speak(segment.textToSpeak);
      }
      
      // Wait for audio to finish
      await waitForAudioEnd();
      // Small delay between segments
      await new Promise(r => setTimeout(r, 300));
    } else {
      // No voice - just show bubble briefly
      avatar.say(segment.textToSpeak, false);
      await new Promise(r => setTimeout(r, 3000));
    }
    
    onSegmentEnd?.(segment);
  }, [avatar, settings.voiceEnabled, settings.avatarSpeaks, speak, waitForAudioEnd, onSegmentStart, onSegmentEnd]);
  
  // Run the full script
  const runScript = useCallback(async () => {
    if (!script || script.segments.length === 0) return;
    if (isRunningRef.current) return;
    
    isRunningRef.current = true;
    cancelledRef.current = false;
    
    setState({
      isRunning: true,
      currentSegmentIndex: 0,
      currentSegmentId: script.segments[0].id,
    });
    
    for (let i = 0; i < script.segments.length; i++) {
      if (cancelledRef.current) break;
      
      setState(prev => ({
        ...prev,
        currentSegmentIndex: i,
        currentSegmentId: script.segments[i].id,
      }));
      
      await runSegment(script.segments[i]);
    }
    
    // Return avatar to home position
    avatar.moveToDefault();
    
    isRunningRef.current = false;
    setState({
      isRunning: false,
      currentSegmentIndex: -1,
      currentSegmentId: null,
    });
    
    if (cancelledRef.current) {
      onCancel?.();
    } else {
      onComplete?.();
    }
  }, [script, runSegment, avatar, onComplete, onCancel]);
  
  // Cancel the current script
  const cancelScript = useCallback(() => {
    cancelledRef.current = true;
    stopAudio();
    stopGlobalAudio();
    avatar.hideBubble();
    avatar.moveToDefault();
    
    isRunningRef.current = false;
    setState({
      isRunning: false,
      currentSegmentIndex: -1,
      currentSegmentId: null,
    });
  }, [stopAudio, avatar]);
  
  return {
    state,
    runScript,
    cancelScript,
  };
}

// ============================================
// Highlight Manager (for sections during narration)
// ============================================

export function highlightAnchor(anchorId: AnchorId | string) {
  const element = document.querySelector(`[data-coach-anchor="${anchorId}"]`);
  if (element) {
    element.classList.add("narration-highlight");
  }
}

export function clearHighlight(anchorId: AnchorId | string) {
  const element = document.querySelector(`[data-coach-anchor="${anchorId}"]`);
  if (element) {
    element.classList.remove("narration-highlight");
  }
}

export function clearAllHighlights() {
  document.querySelectorAll(".narration-highlight").forEach(el => {
    el.classList.remove("narration-highlight");
  });
}
