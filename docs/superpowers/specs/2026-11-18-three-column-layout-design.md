# Three-column layout with a folding legend

## Why

The owner wants the page laid out like an operations console: map in the middle, the panel
for the picked spot on the left, feeds on the right. The map legend covered a large part of
the map, so it moves out of the map and can fold away.

## Goals

- Wide screens (900px and up): three columns. Left: the spot panel (status card, or the
  "pick a spot" hint), with the map legend at the bottom of the same column. Middle: the
  map, with the search box (top left) and zoom and locate buttons (top right). Right: live
  news and headlines.
- The legend's title ("Map legend ▾") is a button that folds the rest of the legend away.
  The tick boxes keep their settings while it is folded.
- Small screens: one scrolling page as before. The legend stays right under the map and
  folds the same way.

## Non-goals

- No change to the colours or fonts ("sea chart" stays). Only the layout is copied.
- No timeline strip along the bottom.

## Approaches

1. **Chosen: CSS grid with named areas.** The page order stays map, legend, spot panel,
   feeds (so small screens are unchanged). On wide screens `grid-template-areas` places
   them: `spot map feeds` over `legend map feeds`.
2. Legend kept floating over the map, with a fold button. Rejected by the owner in favour
   of putting it under the spot panel.
3. Spot panel itself folding away. Built first by mistake, then removed: the owner meant
   the legend.

## Calls made by the builder

- Column widths: 300px on each side, or 380px and 400px from 1360px wide.
- The legend is at most half the screen tall and scrolls inside itself beyond that.
- The legend starts open on every visit; the folded state is not saved.
- New string `legend.heading` in `en.ts` and `fil.ts` (Filipino marked REVIEW).
