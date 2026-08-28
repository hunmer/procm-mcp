import { useCallback, useEffect, useState } from "react";
import i18n, {
  readStoredLanguage,
  writeStoredLanguage,
  type Language,
} from "@/i18n";

// Mirror of useTheme.ts: holds the active language, persists it to localStorage,
// and applies it to the i18next instance + <html lang> on change.
export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => readStoredLanguage());

  useEffect(() => {
    if (i18n.language === language) return;
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
    writeStoredLanguage(language);
  }, [language]);

  const changeLanguage = useCallback((lng: Language) => {
    setLanguage(lng);
  }, []);

  return { language, changeLanguage };
}
