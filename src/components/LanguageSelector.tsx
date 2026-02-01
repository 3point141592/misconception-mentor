"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation, LANGUAGE_NAMES, LANGUAGE_FLAGS, AVAILABLE_LANGUAGES, LanguageCode } from "./I18nProvider";

export function LanguageSelector() {
  const { language, setLanguage, languageFlag, languageName } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (lang: LanguageCode) => {
    setLanguage(lang);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-paper-lineDark rounded-lg transition-colors text-sm"
        title="Select language"
      >
        <span className="text-base">{languageFlag}</span>
        <span className="hidden sm:inline text-ink-muted">{languageName}</span>
        <svg 
          className={`w-3.5 h-3.5 text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-paper-lineDark z-50 py-1 animate-fade-in">
          {AVAILABLE_LANGUAGES.map((lang) => (
            <button
              key={lang}
              onClick={() => handleSelect(lang)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                lang === language ? "bg-highlighter-yellow/20 font-medium" : ""
              }`}
            >
              <span className="text-base">{LANGUAGE_FLAGS[lang]}</span>
              <span className="text-ink">{LANGUAGE_NAMES[lang]}</span>
              {lang === language && (
                <svg className="w-4 h-4 ml-auto text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
