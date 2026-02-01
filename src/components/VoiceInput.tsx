"use client";

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "./I18nProvider";
import type { LanguageCode } from "@/i18n";

// Exposed methods for parent components to control the voice input
export interface VoiceInputHandle {
  /** Stop recording and flush any pending transcript into the value */
  stopAndFlush: () => void;
  /** Check if currently listening */
  isListening: () => boolean;
  /** Get the current interim transcript (not yet committed) */
  getInterimTranscript: () => string;
}

interface VoiceInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  labelHint?: string;
  /** Callback when draft should be saved (debounced by parent) */
  onDraftChange?: (text: string) => void;
  /** Show draft saved indicator */
  showDraftStatus?: boolean;
  /** Draft saved status: "saved" | "saving" | null */
  draftStatus?: "saved" | "saving" | null;
}

// Type for browser SpeechRecognition API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

type InputMode = "type" | "speak";

// Map UI language codes to SpeechRecognition BCP-47 lang codes
export const STT_LANGUAGE_MAP: Record<LanguageCode, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  zh_hans: "zh-CN",
  hi_latn: "hi-IN", // Note: May output Devanagari script
};

export const VoiceInput = forwardRef<VoiceInputHandle, VoiceInputProps>(function VoiceInput({
  id,
  value,
  onChange,
  placeholder = "Enter your response...",
  rows = 3,
  disabled = false,
  className = "",
  label,
  labelHint,
  onDraftChange,
  showDraftStatus = false,
  draftStatus = null,
}, ref) {
  const { language } = useTranslation();
  const [mode, setMode] = useState<InputMode>("type");
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value); // Keep value in ref for callbacks
  const interimRef = useRef(interimTranscript);
  
  // Keep refs in sync
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  
  useEffect(() => {
    interimRef.current = interimTranscript;
  }, [interimTranscript]);

  // Get the SpeechRecognition lang code for current UI language
  const recognitionLang = STT_LANGUAGE_MAP[language] || "en-US";

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    stopAndFlush: () => {
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
      }
      // Flush any interim transcript
      if (interimRef.current) {
        const newValue = valueRef.current + (valueRef.current ? " " : "") + interimRef.current.trim();
        onChange(newValue);
        if (onDraftChange) {
          onDraftChange(newValue);
        }
        setInterimTranscript("");
      }
    },
    isListening: () => isListening,
    getInterimTranscript: () => interimTranscript,
  }), [isListening, interimTranscript, onChange, onDraftChange]);

  // Check for SpeechRecognition support on mount
  useEffect(() => {
    const SpeechRecognitionAPI = 
      window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
      console.warn("[VoiceInput] SpeechRecognition API not supported in this browser");
      return;
    }

    // Initialize recognition
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = recognitionLang; // Use current language

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalTranscript) {
        // Append final transcript to existing value
        const newValue = valueRef.current + (valueRef.current ? " " : "") + finalTranscript.trim();
        onChange(newValue);
        if (onDraftChange) {
          onDraftChange(newValue);
        }
        setInterimTranscript("");
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      console.error("[VoiceInput] Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow microphone access.");
      } else if (event.error === "no-speech") {
        setError("No speech detected. Try again.");
      } else if (event.error === "language-not-supported") {
        setError(`Language ${recognitionLang} not supported. Try English.`);
      } else {
        setError(`Speech error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Flush any remaining interim on end
      if (interimRef.current) {
        const newValue = valueRef.current + (valueRef.current ? " " : "") + interimRef.current.trim();
        onChange(newValue);
        if (onDraftChange) {
          onDraftChange(newValue);
        }
        setInterimTranscript("");
      }
    };

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [recognitionLang]); // Re-initialize when language changes

  // Update recognition's onChange when value changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        let interim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (finalTranscript) {
          const newValue = valueRef.current + (valueRef.current ? " " : "") + finalTranscript.trim();
          onChange(newValue);
          if (onDraftChange) {
            onDraftChange(newValue);
          }
          setInterimTranscript("");
        } else {
          setInterimTranscript(interim);
        }
      };
    }
  }, [onChange, onDraftChange]);

  // Update recognition lang when language changes (if already initialized)
  useEffect(() => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.lang = recognitionLang;
    }
  }, [recognitionLang, isListening]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setError(null);
      // Ensure lang is up to date before starting
      recognitionRef.current.lang = recognitionLang;
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("[VoiceInput] Failed to start recognition:", err);
        setError("Failed to start speech recognition");
      }
    }
  }, [isListening, recognitionLang]);

  const handleModeChange = (newMode: InputMode) => {
    if (newMode === "type" && isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setMode(newMode);
    setError(null);
    
    // Focus textarea when switching to type mode
    if (newMode === "type" && textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Handle text change with draft callback
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isListening) {
      const newValue = e.target.value;
      onChange(newValue);
      if (onDraftChange) {
        onDraftChange(newValue);
      }
    }
  };

  // Language display name for the recording indicator
  const langDisplayName = {
    "en-US": "English",
    "es-ES": "Spanish",
    "fr-FR": "French",
    "zh-CN": "Chinese",
    "hi-IN": "Hindi",
  }[recognitionLang] || recognitionLang;

  return (
    <div className={className}>
      {/* Label row with mode toggle and status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {label && (
            <label htmlFor={id} className="block text-sm font-medium text-ink-muted">
              {label}
              {labelHint && <span className="text-ink-muted"> {labelHint}</span>}
            </label>
          )}
          
          {/* Draft status indicator */}
          {showDraftStatus && draftStatus && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              draftStatus === "saved" 
                ? "bg-green-100 text-green-700" 
                : "bg-gray-100 text-gray-500"
            }`}>
              {draftStatus === "saved" ? "✓ Draft saved" : "Saving..."}
            </span>
          )}
          
          {/* Mic on indicator */}
          {isListening && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              Mic on
            </span>
          )}
        </div>
        
        {/* Type | Speak toggle */}
        {isSupported && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-full p-0.5">
            <button
              type="button"
              onClick={() => handleModeChange("type")}
              disabled={disabled}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                mode === "type"
                  ? "bg-white text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Type
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("speak")}
              disabled={disabled}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                mode === "speak"
                  ? "bg-white text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Speak
            </button>
          </div>
        )}

        {/* Not supported indicator */}
        {!isSupported && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
            🎤 Not supported
          </span>
        )}
      </div>

      {/* Textarea with optional mic button */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          id={id}
          value={value + (interimTranscript ? (value ? " " : "") + interimTranscript : "")}
          onChange={handleTextChange}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled || isListening}
          className={`w-full px-4 py-3 border border-paper-lineDark rounded-lg focus:outline-none focus:ring-2 focus:ring-highlighter-yellow focus:border-transparent resize-none ${
            isListening ? "bg-red-50 border-red-300" : ""
          } ${mode === "speak" && !isListening ? "pr-14" : ""}`}
        />
        
        {/* Mic button - only in speak mode */}
        {mode === "speak" && isSupported && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled}
            className={`absolute right-3 top-3 p-2 rounded-full transition-all ${
              isListening
                ? "bg-red-500 text-white animate-pulse"
                : "bg-highlighter-yellow hover:bg-highlighter-yellowDark text-ink"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            title={isListening ? "Stop recording" : `Start recording (${langDisplayName})`}
          >
            {isListening ? (
              // Stop icon
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              // Mic icon
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Recording indicator with language */}
      {isListening && (
        <div className="flex items-center gap-2 mt-2 text-red-600">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-xs font-medium">
            Recording in {langDisplayName}... speak now
          </span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}

      {/* Not supported message */}
      {!isSupported && mode === "speak" && (
        <p className="text-xs text-amber-600 mt-1">
          Speech recognition is not supported in this browser. Please type instead.
        </p>
      )}
    </div>
  );
});
