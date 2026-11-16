Storm test samples

REAL data (saved from the live source on 2026-11-16):
  jtwc-real-2026-11-16.rss         JTWC RSS feed; no Northwest Pacific warning was active.
                                   Its Southern Hemisphere item has a real warning (04P).
  jtwc-warning-real-sh04.txt       The real warning text for that storm (04P Xavier).
  (JMA targetTc.json was [] on that day; so no real JMA storm file could be saved.)

CONSTRUCTED data (NOT a real storm; built to the real file layout):
  jtwc-nwpac-CONSTRUCTED.rss       A Northwest Pacific item written like the real Southern one.
  jma-sample/                      targetTc.json, forecast.json, specifications.json for a
                                   made-up storm "Sample" (TC9901). The layout was read from
                                   the code of JMA's own typhoon map page. Time text format, field
                                   types and the 6 hour past-track spacing are inferred.
                                   Positions follow the shape of a real 2026 past track
                                   (JMA pastTracks.json) but are not copied from it.
