"use client";

import { useState, useRef, useCallback } from "react";
import { useDelight } from "./DelightProvider";
import { useTranslation } from "./I18nProvider";
import type { LanguageCode } from "@/i18n";

interface ReadAloudButtonProps {
  text: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "inline" | "icon-only";
  className?: string;
  autoPlay?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

// Global audio element for managing playback across components
let globalAudio: HTMLAudioElement | null = null;
let globalAbortController: AbortController | null = null;
let globalSpeechUtterance: SpeechSynthesisUtterance | null = null;

// Stop any currently playing audio
export function stopGlobalAudio() {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.src = "";
    globalAudio = null;
  }
  if (globalAbortController) {
    globalAbortController.abort();
    globalAbortController = null;
  }
  if (globalSpeechUtterance) {
    window.speechSynthesis?.cancel();
    globalSpeechUtterance = null;
  }
}

// Map UI language to browser speechSynthesis locale
const SPEECH_LOCALE_MAP: Record<LanguageCode, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  zh_hans: "zh-CN",
  hi_latn: "hi-IN",
};

// Browser speechSynthesis fallback
async function speakWithBrowserFallback(
  text: string,
  language: LanguageCode,
  onEnd?: () => void,
  onError?: (error: string) => void
): Promise<boolean> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const locale = SPEECH_LOCALE_MAP[language] || "en-US";
      
      // Try to find a voice matching the locale
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(v => v.lang.startsWith(locale.split("-")[0]));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      utterance.lang = locale;
      utterance.rate = 0.9;
      utterance.pitch = 1.0;

      utterance.onend = () => {
        globalSpeechUtterance = null;
        onEnd?.();
        resolve(true);
      };

      utterance.onerror = (event) => {
        globalSpeechUtterance = null;
        onError?.(`Browser TTS error: ${event.error}`);
        resolve(false);
      };

      globalSpeechUtterance = utterance;
      window.speechSynthesis.speak(utterance);
      resolve(true);
    } catch (err) {
      onError?.("Browser TTS not available");
      resolve(false);
    }
  });
}

export function ReadAloudButton({
  text,
  label = "Read aloud",
  size = "md",
  variant = "default",
  className = "",
  autoPlay = false,
  onStart,
  onEnd,
  onError,
}: ReadAloudButtonProps) {
  const { settings } = useDelight();
  const { language } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasUserInteracted = useRef(false);

  const playAudio = useCallback(async () => {
    if (!text || text.trim().length === 0) {
      setError("No text to read");
      return;
    }

    // Stop any existing playback
    stopGlobalAudio();
    setError(null);
    setUsedFallback(false);
    setIsLoading(true);

    try {
      // Create abort controller for this request
      globalAbortController = new AbortController();

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: text.trim(),
          language, // Pass current UI language
        }),
        signal: globalAbortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Get the audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      globalAudio = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        globalAudio = null;
        onEnd?.();
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setError("Failed to play audio");
        URL.revokeObjectURL(audioUrl);
        globalAudio = null;
        onError?.("Failed to play audio");
      };

      setIsLoading(false);
      setIsPlaying(true);
      onStart?.();
      await audio.play();
    } catch (err) {
      setIsLoading(false);
      
      if (err instanceof Error && err.name === "AbortError") {
        // Aborted, not an error
        return;
      }
      
      const errorMsg = err instanceof Error ? err.message : "Failed to generate speech";
      console.error("[ReadAloud] ElevenLabs failed, trying browser fallback:", errorMsg);
      
      // Try browser fallback
      setUsedFallback(true);
      const fallbackSuccess = await speakWithBrowserFallback(
        text.trim(),
        language,
        () => {
          setIsPlaying(false);
          onEnd?.();
        },
        (fallbackError) => {
          setIsPlaying(false);
          setError(fallbackError);
          onError?.(fallbackError);
        }
      );
      
      if (fallbackSuccess) {
        setIsPlaying(true);
        onStart?.();
      } else {
        setError(errorMsg);
        onError?.(errorMsg);
      }
    }
  }, [text, language, onStart, onEnd, onError]);

  const stopAudio = useCallback(() => {
    stopGlobalAudio();
    setIsPlaying(false);
    setIsLoading(false);
    onEnd?.();
  }, [onEnd]);

  const handleClick = useCallback(() => {
    hasUserInteracted.current = true;

    if (isPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  }, [isPlaying, stopAudio, playAudio]);

  // Don't render if read-aloud buttons are disabled
  if (!settings.showReadAloudButtons) {
    return null;
  }

  // Size classes
  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-1.5",
    lg: "text-base px-4 py-2",
  };

  // Icon sizes
  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  // Variant styles
  const variantClasses = {
    default: `bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300 rounded-lg font-medium transition-all ${sizeClasses[size]}`,
    inline: `text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded px-1.5 py-0.5 transition-all ${size === "sm" ? "text-xs" : "text-sm"}`,
    "icon-only": `p-1.5 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-700 transition-all`,
  };

  // Render the icon
  const renderIcon = () => {
    if (isLoading) {
      return (
        <svg className={`animate-spin ${iconSizes[size]}`} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      );
    }

    if (isPlaying) {
      // Stop icon
      return (
        <svg className={iconSizes[size]} viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      );
    }

    // Speaker icon
    return (
      <svg className={iconSizes[size]} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    );
  };

  if (variant === "icon-only") {
    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`${variantClasses[variant]} ${className}`}
        title={isPlaying ? "Stop" : usedFallback ? `${label} (browser)` : label}
        aria-label={isPlaying ? "Stop reading" : label}
      >
        {renderIcon()}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`${variantClasses[variant]} flex items-center gap-1.5 ${className}`}
      title={error || (usedFallback ? "Using browser voice" : undefined)}
    >
      {renderIcon()}
      {variant !== "inline" && (
        <span>{isLoading ? "Loading..." : isPlaying ? "Stop" : label}</span>
      )}
      {variant === "inline" && !isLoading && !isPlaying && <span>🔊</span>}
      {error && variant === "default" && (
        <span className="text-xs text-red-500 ml-1">!</span>
      )}
      {usedFallback && isPlaying && variant === "default" && (
        <span className="text-xs text-amber-500 ml-1">📱</span>
      )}
    </button>
  );
}

// Hook for programmatic TTS (e.g., auto-read)
export function useTTS() {
  const { settings } = useDelight();
  const { language } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const speak = useCallback(async (text: string) => {
    if (!settings.voiceEnabled || !text || text.trim().length === 0) {
      return;
    }

    stopGlobalAudio();
    setIsLoading(true);

    try {
      globalAbortController = new AbortController();

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: text.trim(),
          language, // Pass current UI language
        }),
        signal: globalAbortController.signal,
      });

      if (!response.ok) {
        throw new Error("TTS request failed");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      globalAudio = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        globalAudio = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        globalAudio = null;
      };

      setIsLoading(false);
      setIsPlaying(true);
      await audio.play();
    } catch (err) {
      setIsLoading(false);
      
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      
      console.error("[TTS] ElevenLabs failed, trying browser fallback");
      
      // Try browser fallback
      const fallbackSuccess = await speakWithBrowserFallback(
        text.trim(),
        language,
        () => setIsPlaying(false),
        (error) => console.error("[TTS] Browser fallback also failed:", error)
      );
      
      if (fallbackSuccess) {
        setIsPlaying(true);
      }
    }
  }, [settings.voiceEnabled, language]);

  const stop = useCallback(() => {
    stopGlobalAudio();
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  return { speak, stop, isPlaying, isLoading, voiceEnabled: settings.voiceEnabled };
}
