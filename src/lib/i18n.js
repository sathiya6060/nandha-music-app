// i18n system — Nandha Music.
// To add a language: copy src/locales/en.js, translate the values,
// save as src/locales/<code>.js, and add one line to LOCALES below.
// Every key falls back to English when missing in the active locale.
import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import en from '../locales/en.js';
import ta from '../locales/ta.js';
import hi from '../locales/hi.js';

export const LOCALES = {
  en: { label: 'English', strings: en, font: "'Inter', 'Noto Sans Tamil', system-ui, sans-serif" },
  ta: { label: 'தமிழ்', strings: ta, font: "'Noto Sans Tamil', 'Inter', system-ui, sans-serif" },
  hi: { label: 'हिन्दी', strings: hi, font: "'Inter', 'Noto Sans Tamil', system-ui, sans-serif" },
};

export const DEFAULT_LANG = 'en';
const STORAGE_KEY = 'nandha-lang-v2';

const LanguageContext = createContext(null);

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LOCALES[saved]) return saved;
    } catch { /* ignore */ }
    return DEFAULT_LANG;
  });

  const setLang = (code) => {
    if (!LOCALES[code]) return;
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.style.setProperty('--font-ui', LOCALES[lang].font);
  }, [lang]);

  const value = useMemo(() => {
    const strings = LOCALES[lang]?.strings || {};
    const t = (key, vars) => interpolate(strings[key] ?? en[key] ?? key, vars);
    return { lang, setLang, t, locales: Object.keys(LOCALES) };
  }, [lang]);

  return createElement(LanguageContext.Provider, { value }, children);
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) return { lang: DEFAULT_LANG, setLang: () => {}, t: (k, v) => interpolate(en[k] ?? k, v), locales: Object.keys(LOCALES) };
  return ctx;
}

// Non-hook helper for code outside React (e.g. service worker messages).
export function translate(lang, key, vars) {
  const strings = LOCALES[lang]?.strings || {};
  return interpolate(strings[key] ?? en[key] ?? key, vars);
}
