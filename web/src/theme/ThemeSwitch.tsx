// Two plain buttons to pick light or dark colours.

import { useStrings } from '../i18n/index.ts';
import { useTheme } from './ThemeContext.tsx';

export function ThemeSwitch() {
  const { t } = useStrings();
  const { theme, setTheme } = useTheme();

  return (
    <div className="switch" role="group" aria-label={t.theme.groupLabel}>
      <button className="filter" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
        {t.theme.light}
      </button>
      <button className="filter" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
        {t.theme.dark}
      </button>
    </div>
  );
}
