// Language switcher — Tamil / English / Hindi. Place in TopBar.
import { LOCALES, useI18n } from '../lib/i18n.js';

export default function LanguageSwitcher() {
  const { lang, setLang, t, locales } = useI18n();
  return (
    <label className="lang-switcher">
      <span className="sr-only">{t('common.language')}</span>
      <select
        className="lang-select"
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label={t('common.language')}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {LOCALES[code].label}
          </option>
        ))}
      </select>
    </label>
  );
}
