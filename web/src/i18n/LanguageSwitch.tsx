// Two plain buttons to pick the language, plus a short note when Filipino is on.

import { useStrings } from './LanguageContext.tsx';

export function LanguageSwitch() {
  const { t, lang, setLanguage } = useStrings();

  return (
    <div className="filters" role="group" aria-label={t.language.groupLabel}>
      <button className="filter" aria-pressed={lang === 'en'} onClick={() => setLanguage('en')}>
        {t.language.english}
      </button>
      <button className="filter" aria-pressed={lang === 'fil'} onClick={() => setLanguage('fil')}>
        {t.language.filipino}
      </button>
      {lang === 'fil' && <span className="muted">{t.language.draftNote}</span>}
    </div>
  );
}
