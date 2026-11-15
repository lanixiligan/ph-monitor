// The "this is not an official warning" notice. Shown in the page footer and
// on the status card, so it is next to every score a reader might act on.

export function Disclaimer() {
  return (
    <span className="disclaimer">
      Unofficial estimate, not a warning service. For official warnings, follow{' '}
      <a href="https://www.pagasa.dost.gov.ph/" target="_blank" rel="noreferrer">
        PAGASA
      </a>{' '}
      and{' '}
      <a href="https://www.phivolcs.dost.gov.ph/" target="_blank" rel="noreferrer">
        PHIVOLCS
      </a>
      .
    </span>
  );
}
