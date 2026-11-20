// A section of the status card that starts closed (unless `open`): its title is always
// visible, and a click (or Enter, or Space) opens it.

import type { ReactNode } from 'react';

type Props = {
  title: string;
  /** How many items are inside, shown beside the title. Left out = no number. */
  count?: number; // `?` means the value may be left out
  /** A small label after the title, such as "Model estimate". */
  tag?: string;
  /** true = starts open (the pressed map view's own section). Left out = starts closed. */
  open?: boolean;
  // `ReactNode` is the type of anything React can draw: text, elements, lists.
  children: ReactNode;
};

export function Fold({ title, count, tag, open, children }: Props) {
  return (
    // <details> is the browser's own "click to open" block; <summary> is its
    // always-visible label. It works by keyboard and with a screen reader as is.
    <details className="fold" open={open}>
      <summary>
        <h3>{title}</h3>
        {count !== undefined && <span className="muted"> ({count})</span>}
        {tag !== undefined && <span className="tag">{tag}</span>}
      </summary>
      {children}
    </details>
  );
}
