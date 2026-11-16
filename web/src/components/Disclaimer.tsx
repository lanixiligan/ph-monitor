// The "this is not an official warning" notice. Shown in the page footer and
// on the status card, so it is next to every score a reader might act on.

import { useStrings } from '../i18n/index.ts';

export function Disclaimer() {
  const { t } = useStrings();
  return (
    <span className="disclaimer">
      {t.disclaimer.lead}{' '}
      <a href="https://www.pagasa.dost.gov.ph/" target="_blank" rel="noreferrer">
        PAGASA
      </a>{' '}
      {t.disclaimer.and}{' '}
      <a href="https://www.phivolcs.dost.gov.ph/" target="_blank" rel="noreferrer">
        PHIVOLCS
      </a>
      .
    </span>
  );
}
