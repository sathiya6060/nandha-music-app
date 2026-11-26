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

const DEFAULT_LANG = 'en';
const STORAGE_KEY = 'nandha-lang-v2';

const LanguageContext = createContext(null);

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}

/** Plural form key (N1, exported for tests): `_one` for n === 1,
 *  `_other` for everything else (including 0). */
export function pluralFormKey(key, n) {
  return Number(n) === 1 ? `${key}_one` : `${key}_other`;
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
    // Plural-aware lookup (N1): tp('playlists.tracks', n) picks the
    // `<key>_one` form for n === 1 and `<key>_other` otherwise, falling
    // back to the base key (and then to English) when a form is missing.
    // Tamil/Hindi keep the same one/other split (1 பாடல் / n பாடல்கள்,
    // 1 गाना / n गाने) — no locale needs more than two forms today.
    const tp = (key, n) => {
      const count = Number(n) || 0;
      const formKey = pluralFormKey(key, count);
      return interpolate(
        strings[formKey] ?? strings[key] ?? en[formKey] ?? en[key] ?? key,
        { n: count },
      );
    };
    return { lang, setLang, t, tp, locales: Object.keys(LOCALES) };
  }, [lang]);

  return createElement(LanguageContext.Provider, { value }, children);
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    const t = (k, v) => interpolate(en[k] ?? k, v);
    const tp = (key, n) => {
      const count = Number(n) || 0;
      const formKey = pluralFormKey(key, count);
      return interpolate(en[formKey] ?? en[key] ?? key, { n: count });
    };
    return { lang: DEFAULT_LANG, setLang: () => {}, t, tp, locales: Object.keys(LOCALES) };
  }
  return ctx;
}

/**
 * Resolve a locale-shaped field (title/description/...) from the active
 * language. Catalog objects carry `titleEn`/`titleTa` (+ `descriptionEn`/
 * `descriptionTa`); user-created objects carry only the plain field.
 * Tamil picks the Tamil text first, every other language picks English
 * first, and the plain field is the last resort — so the heading is
 * never empty while any variant exists.
 */
function localizedField(obj, lang, enKey, taKey, plainKey) {
  if (!obj) return '';
  if (lang === 'ta') return obj[taKey] || obj[enKey] || obj[plainKey] || '';
  return obj[enKey] || obj[taKey] || obj[plainKey] || '';
}

/** Locale-aware title for a catalog/user object (titleEn/titleTa/title). */
export function localizedTitle(obj, lang) {
  return localizedField(obj, lang, 'titleEn', 'titleTa', 'title');
}

/** Locale-aware description (descriptionEn/descriptionTa/description). */
export function localizedDescription(obj, lang) {
  return localizedField(obj, lang, 'descriptionEn', 'descriptionTa', 'description');
}
