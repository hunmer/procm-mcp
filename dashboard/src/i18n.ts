import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

export const LANGUAGES = ["en", "zh"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  zh: "中文",
};

const STORAGE_KEY = "procm-language";

// Read the persisted language, falling back to the browser's preferred language
// (when it starts with one of ours) and finally to English. Mirrors the
// localStorage pattern in useTheme.ts.
export function readStoredLanguage(): Language {
  if (typeof localStorage !== "undefined") {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "zh") return v;
  }
  if (typeof navigator !== "undefined") {
    const nav = navigator.language.toLowerCase();
    if (nav.startsWith("zh")) return "zh";
    if (nav.startsWith("en")) return "en";
  }
  return "en";
}

// Persist a language choice (best-effort; localStorage may be unavailable).
export function writeStoredLanguage(lng: Language): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: readStoredLanguage(),
  fallbackLng: "en",
  interpolation: {
    // React already escapes, so i18next doesn't need to.
    escapeValue: false,
  },
});

// Keep <html lang> in sync so screen readers / browser features match the UI.
document.documentElement.lang = i18n.language;

export { STORAGE_KEY };
export default i18n;
