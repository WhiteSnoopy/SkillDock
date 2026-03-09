export type Locale = "zh" | "en";

export const APP_LOCALE_STORAGE_KEY = "skilldock.app.locale";

export function resolveInitialLocale(): Locale {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
    if (saved === "zh" || saved === "en") {
      return saved;
    }
    const nav = window.navigator.language.toLowerCase();
    return nav.startsWith("zh") ? "zh" : "en";
  }
  return "zh";
}
