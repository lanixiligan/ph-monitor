News samples for the tests. The headlines are REAL, collected from our news feeds and Google
News searches on 2026-11-16 and 2026-11-17. Only headline and outlet are kept, never article text.

  outlet-feed.xml          a trimmed RSS feed from one outlet (good and bad items)
  google-news.xml          a trimmed Google News feed (outlet name in <source>)
  atom.xml                 a one-entry Atom feed
  labelled-headlines.json  242 headlines with the right answers filled in by hand (below)
  provinces.json           the 88 rows of the provinces table (psgc code and name)
  towns.json               the 1,642 rows of the places table (town or city name and its province)


LABELLED HEADLINES

The answer key for the news check (server/src/news/checkHeadline.ts). The site never shows these
headlines: they only measure how well the rules work.

  npm run measure:news     prints the scores and lists every headline the rules get wrong
  npm test                 fails if the scores drop clearly below those of 2026-11-17

One headline per line:

  {"title": "Forest fire hits Tuba in Benguet", "outlet": "...", "disaster": true,
   "types": ["wildfire"], "provinces": ["Benguet"], "note": "..."}

  disaster   true if the headline is about a natural disaster in the Philippines
  types      the kinds of disaster it names (more than one is fine); empty = "general"
  provinces  the provinces a person would pick, with names exactly as in provinces.json
             (Metro Manila = all four "NCR, ..." rows); empty = none named
  note       optional: why a borderline headline got its answer

Kinds (the owner's list, plus extreme heat; see shared/src/newsTypes.ts):

  typhoon     typhoons, tropical storms and depressions, low pressure areas, wind signals
  flood       floods and heavy rain
  earthquake  earthquakes, aftershocks
  volcano     eruptions, ash, lahar, volcano alert news
  landslide   landslides, mudslides
  tsunami     tsunamis AND storm surges
  drought     droughts, dry spells, El Niño
  wildfire    forest, grass and brush fires
  heat        extreme heat, heat index readings and forecasts, heatstroke warnings

Rules used when labelling (decided with the owner on 2026-11-17):

  - Natural disasters only for now. Building fires, conflicts, pests, diseases, energy crises and
    garbage, landfill or mine collapses are "not a disaster". A "Man-made" group may come later.
  - A headline that is only about a response (an evacuation, food packs, a state of calamity)
    with no kind named is a disaster with empty types: "general".
  - A storm surge is tsunami and typhoon (a typhoon causes it).
  - Quakes caused by a volcano are volcano and earthquake.
  - Any El Niño headline is also drought.
  - Heat counts when it is about heat in the Philippines now or soon. Explainers, fact checks,
    new equipment and heat abroad are not disasters.
  - Disasters abroad are not disasters, unless the headline is about their effect here
    ("Indonesia forest-fire smoke reaches Philippines").
  - "Pagasa Island" sea-dispute stories are not disasters. Typhoon news from the island is, in
    Palawan.
  - Explainers and round-ups with no event ("World Earthquake Report") are not disasters.
  - A town names its province (Guiuan = Eastern Samar). Regions ("Visayas", "Bicol") name none.

Counts on 2026-11-17: 131 about a disaster, 111 not. Kinds: drought 27, earthquake 25, heat 24,
typhoon 23, volcano 15, tsunami 10, wildfire 10, landslide 6, flood 5; 3 general; 17 have more
than one kind. Floods and landslides are few: add more when the feeds carry them.

To fix or add a label: edit the line, keep one headline per line, then run
`npm run measure:news`. If a label was wrong, the scores in the test may need to change too
(server/test/news.test.ts, "labelled headlines").
