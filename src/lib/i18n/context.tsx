/**
 * Language Context Provider
 * Provides global language state and translation functions
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { type Language, t as translate } from "./translations";
import { getUserLanguagePreference, updateUserLanguagePreference } from "@/lib/server-functions/user-settings";

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  saveAsDefault: (lang?: Language) => Promise<void>;
  t: (path: string) => string;
  isLoading: boolean;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

const LANGUAGE_STORAGE_KEY = "hikma-preferred-language";

/**
 * Get initial language from:
 * 1. User profile default language (metadata) - loaded asynchronously
 * 2. localStorage (current session language)
 * 3. Browser language (if supported)
 * 4. Default to English
 */
function getInitialLanguage(): Language {
  if (typeof window === "undefined") {
    return "en";
  }

  // Check localStorage for current session language
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && (stored === "en" || stored === "ar")) {
    return stored as Language;
  }

  // Check browser language
  const browserLang = navigator.language.split("-")[0];
  if (browserLang === "ar") {
    return "ar";
  }

  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const [isLoading, setIsLoading] = useState(true);

  // Load user default language preference from server on mount
  // Only use it if localStorage doesn't have a current session language
  useEffect(() => {
    let mounted = true;

    const loadUserLanguage = async () => {
      try {
        const userDefaultLang = await getUserLanguagePreference();
        if (mounted) {
          // Only use user profile default if localStorage doesn't have a current session language
          const currentSessionLang = typeof window !== "undefined"
            ? localStorage.getItem(LANGUAGE_STORAGE_KEY)
            : null;
          
          if (!currentSessionLang && userDefaultLang) {
            // No current session language, use user's default preference
            setLanguageState(userDefaultLang);
            if (typeof window !== "undefined") {
              localStorage.setItem(LANGUAGE_STORAGE_KEY, userDefaultLang);
              document.documentElement.lang = userDefaultLang;
              document.documentElement.dir = userDefaultLang === "ar" ? "rtl" : "ltr";
            }
          } else {
            // Use current session language (already set from getInitialLanguage)
            const lang = currentSessionLang as Language || getInitialLanguage();
            if (typeof window !== "undefined") {
              document.documentElement.lang = lang;
              document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
            }
          }
        }
      } catch (error) {
        console.error("Failed to load user language preference:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadUserLanguage();

    return () => {
      mounted = false;
    };
  }, []);

  // Update language - only saves to localStorage (session language)
  // Does NOT update user profile default - user must explicitly save default
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      // Save to localStorage for current session only
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      // Update HTML lang attribute for accessibility
      document.documentElement.lang = lang;
      // Update dir attribute for RTL support
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
      // Note: We do NOT update user profile here - that's only done when user explicitly saves default
    }
  }, []);

  // Separate function to save current language as default preference
  const saveAsDefault = useCallback(async (lang?: Language) => {
    const languageToSave = lang || language;
    if (!languageToSave) {
      throw new Error("Language is required");
    }
    try {
      // TanStack Start server functions expect data wrapped in 'data' property
      const result = await updateUserLanguagePreference({ data: { language: languageToSave } });
      if (!result) {
        throw new Error("Failed to save language preference");
      }
    } catch (error: any) {
      console.error("Failed to update user language preference:", error);
      // Re-throw with a more user-friendly message
      const message = error?.message || "Failed to save language preference";
      throw new Error(message);
    }
  }, [language]);

  // Translation function
  const t = useCallback(
    (path: string) => {
      return translate(path, language);
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, saveAsDefault, t, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to use language context
 * @throws Error if used outside LanguageProvider (client-side only)
 */
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    // During SSR, provide a default context to prevent errors
    if (typeof window === "undefined") {
      return {
        language: "en" as Language,
        setLanguage: () => {},
        saveAsDefault: async () => {},
        t: (path: string) => translate(path, "en"),
        isLoading: false,
      };
    }
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

/**
 * Hook to get translation function
 * Shorthand for useLanguage().t
 */
export function useTranslation() {
  const { t } = useLanguage();
  return t;
}

