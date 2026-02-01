"use client";

import { useState, useCallback, useRef, useEffect, createContext, useContext } from "react";
import { useDelight } from "./DelightProvider";
import { stopGlobalAudio } from "./ReadAloudButton";

// ============================================
// Types
// ============================================

interface NarrationBlockProps {
  /** The explicit text to be narrated (do NOT scrape DOM) */
  narrationText: string;
  /** Unique ID for this narration block */
  id: string;
  /** Children to render (the visual content) */
  children: React.ReactNode;
  /** Whether to show the Listen button inline */
  showButton?: boolean;
  /** Position of the Listen button */
  buttonPosition?: "top-right" | "bottom-right" | "inline";
  /** Additional class names */
  className?: string;
}

interface NarrationRegistryEntry {
  id: string;
  text: string;
  element: HTMLElement | null;
}

interface NarrationContextType {
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
  registerBlock: (entry: NarrationRegistryEntry) => void;
  unregisterBlock: (id: string) => void;
  getRegisteredBlocks: () => NarrationRegistryEntry[];
}

// ============================================
// Narration Context (for tracking active block)
// ============================================

const NarrationContext = createContext<NarrationContextType | null>(null);

export function NarrationProvider({ children }: { children: React.ReactNode }) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const registryRef = useRef<Map<string, NarrationRegistryEntry>>(new Map());

  const registerBlock = useCallback((entry: NarrationRegistryEntry) => {
    registryRef.current.set(entry.id, entry);
  }, []);

  const unregisterBlock = useCallback((id: string) => {
    registryRef.current.delete(id);
  }, []);

  const getRegisteredBlocks = useCallback(() => {
    return Array.from(registryRef.current.values());
  }, []);

  return (
    <NarrationContext.Provider
      value={{
        activeBlockId,
        setActiveBlockId,
        registerBlock,
        unregisterBlock,
        getRegisteredBlocks,
      }}
    >
      {children}
    </NarrationContext.Provider>
  );
}

export function useNarration() {
  const context = useContext(NarrationContext);
  if (!context) {
    // Return a no-op context if not wrapped (graceful degradation)
    return {
      activeBlockId: null,
      setActiveBlockId: () => {},
      registerBlock: () => {},
      unregisterBlock: () => {},
      getRegisteredBlocks: () => [],
    };
  }
  return context;
}

// ============================================
// Global audio management for narration
// ============================================

let narrationAudio: HTMLAudioElement | null = null;
let narrationAbortController: AbortController | null = null;

function stopNarrationAudio() {
  stopGlobalAudio(); // Stop any global audio first
  if (narrationAudio) {
    narrationAudio.pause();
    narrationAudio.src = "";
    narrationAudio = null;
  }
  if (narrationAbortController) {
    narrationAbortController.abort();
    narrationAbortController = null;
  }
}

// ============================================
// NarrationBlock Component
// ============================================

export function NarrationBlock({
  narrationText,
  id,
  children,
  showButton = true,
  buttonPosition = "top-right",
  className = "",
}: NarrationBlockProps) {
  const { settings } = useDelight();
  const { activeBlockId, setActiveBlockId, registerBlock, unregisterBlock } = useNarration();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  const isActive = activeBlockId === id;

  // Register this block on mount
  useEffect(() => {
    registerBlock({
      id,
      text: narrationText,
      element: blockRef.current,
    });
    return () => {
      unregisterBlock(id);
    };
  }, [id, narrationText, registerBlock, unregisterBlock]);

  // Stop playing if we're no longer the active block
  useEffect(() => {
    if (!isActive && isPlaying) {
      setIsPlaying(false);
    }
  }, [isActive, isPlaying]);

  const playNarration = useCallback(async () => {
    if (!narrationText || narrationText.trim().length === 0) {
      return;
    }

    // Stop any existing narration
    stopNarrationAudio();
    setIsLoading(true);
    setActiveBlockId(id);

    try {
      narrationAbortController = new AbortController();

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: narrationText.trim() }),
        signal: narrationAbortController.signal,
      });

      if (!response.ok) {
        throw new Error("TTS request failed");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      narrationAudio = audio;

      audio.onended = () => {
        setIsPlaying(false);
        setActiveBlockId(null);
        URL.revokeObjectURL(audioUrl);
        narrationAudio = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setActiveBlockId(null);
        URL.revokeObjectURL(audioUrl);
        narrationAudio = null;
      };

      setIsLoading(false);
      setIsPlaying(true);
      await audio.play();
    } catch (err) {
      setIsLoading(false);
      setIsPlaying(false);
      setActiveBlockId(null);
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("[NarrationBlock] Error:", err);
      }
    }
  }, [narrationText, id, setActiveBlockId]);

  const stopNarration = useCallback(() => {
    stopNarrationAudio();
    setIsPlaying(false);
    setActiveBlockId(null);
  }, [setActiveBlockId]);

  const handleClick = useCallback(() => {
    if (isPlaying) {
      stopNarration();
    } else {
      playNarration();
    }
  }, [isPlaying, stopNarration, playNarration]);

  // Don't show button if read-aloud is disabled
  const shouldShowButton = showButton && settings.showReadAloudButtons;

  // Determine highlight class based on active state
  // Use ONLY ring/shadow for highlight - DO NOT change background color
  // This prevents readability issues when content has white text on colored backgrounds
  const highlightClass = isActive
    ? "ring-4 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] transition-all duration-300"
    : "";

  // Button position classes
  const buttonPositionClasses = {
    "top-right": "absolute top-2 right-2",
    "bottom-right": "absolute bottom-2 right-2",
    inline: "ml-2 inline-flex",
  };

  return (
    <div
      ref={blockRef}
      className={`relative ${highlightClass} ${className}`}
      data-narration-block={id}
    >
      {children}
      
      {shouldShowButton && (
        <button
          onClick={handleClick}
          disabled={isLoading}
          className={`${buttonPositionClasses[buttonPosition]} flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-all ${
            isPlaying
              ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-500"
              : "bg-purple-100 hover:bg-purple-200 text-purple-800"
          } ${buttonPosition === "inline" ? "" : "z-10"}`}
          title={isPlaying ? "Stop" : "Listen"}
          aria-label={isPlaying ? "Stop narration" : "Listen to this content"}
        >
          {isLoading ? (
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : isPlaying ? (
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
          <span>{isLoading ? "..." : isPlaying ? "Stop" : "Listen"}</span>
        </button>
      )}
    </div>
  );
}

// ============================================
// Utility: Get all registered narration blocks
// ============================================

export function useNarrationRegistry() {
  const { getRegisteredBlocks, activeBlockId } = useNarration();
  return { getRegisteredBlocks, activeBlockId };
}

// ============================================
// Skip narration marker (for navigation, buttons, etc.)
// ============================================

export function NarrationSkip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-narration-skip="true" className={className}>
      {children}
    </div>
  );
}
