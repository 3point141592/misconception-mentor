"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  LanguageCode,
  DEFAULT_LANGUAGE,
  loadLanguage,
  saveLanguage,
  getTranslation,
  LANGUAGE_NAMES,
  LANGUAGE_FLAGS,
  AVAILABLE_LANGUAGES,
} from "@/i18n";

interface I18nContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
  languageName: string;
  languageFlag: string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load language on mount
  useEffect(() => {
    const loaded = loadLanguage();
    setLanguageState(loaded);
    setIsLoaded(true);
  }, []);

  // Update language
  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    saveLanguage(lang);
  }, []);

  // Translation function
  const t = useCallback(
    (key: string): string => {
      return getTranslation(language, key);
    },
    [language]
  );

  const value: I18nContextType = {
    language,
    setLanguage,
    t,
    languageName: LANGUAGE_NAMES[language],
    languageFlag: LANGUAGE_FLAGS[language],
  };

  // Render with default language until loaded to avoid hydration mismatch
  if (!isLoaded) {
    return (
      <I18nContext.Provider
        value={{
          language: DEFAULT_LANGUAGE,
          setLanguage: () => {},
          t: (key: string) => getTranslation(DEFAULT_LANGUAGE, key),
          languageName: LANGUAGE_NAMES[DEFAULT_LANGUAGE],
          languageFlag: LANGUAGE_FLAGS[DEFAULT_LANGUAGE],
        }}
      >
        {children}
      </I18nContext.Provider>
    );
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}

// Export language constants for use in components
export { LANGUAGE_NAMES, LANGUAGE_FLAGS, AVAILABLE_LANGUAGES };
export type { LanguageCode };
