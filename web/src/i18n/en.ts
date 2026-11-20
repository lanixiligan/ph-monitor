// Every visible word of the web app, in English. This file is the master list:
// fil.ts must have exactly the same keys (TypeScript checks it).
//
// `{name}` marks a spot where a number or name is put in (see `fill` in state.ts).
// Names and text that come from outside (headlines, storm names, places) are
// never listed here. Agency names, units and the app name stay as they are.

export const en = {
  // The page itself (header, jump links, load error, footer credits).
  app: {
    intro:
      'Stress right now from earthquakes, weather and disaster events. Search for a place or click anywhere on land.',
    jumpHeadlines: 'Headlines',
    jumpStreams: 'Live news',
    loadError: 'Could not load the scores. Is the server running?',
    // {feeds} is a list of names from `feeds` below.
    staleBanner: 'Out of date: {feeds}. What you see for these may be old or missing.',
    statusError: 'Could not check how fresh the data is.',
    // The footer link and the credits page (CreditsPage.tsx).
    creditsLink: 'Data sources and credits',
    creditsTitle: 'Data sources and credits',
    backToMap: 'Back to the map',
    creditQuakes: 'Earthquakes:',
    creditWeather: 'Weather (modelled):',
    creditWeatherEnd: ', CC BY 4.0.',
    creditBoundaries: 'Boundaries: NAMRIA and PSA via OCHA, CC BY 3.0 IGO, from',
    // Hazard maps line: lead, "Project NOAH" link, middle, licence link.
    creditHazards: 'Hazard maps:',
    creditHazardsMid:
      'and its contributors (UP NOAH Center); landslide maps by UP NIGS, storm surge maps by PAGASA with UP NIGS. Licence:',
    creditHazardsOdbl:
      'The hazard zone shapes our map serves are simplified from Project NOAH data and are available under the ODbL 1.0.',
    creditEvents: 'Disaster events:',
    creditEventsMid: ', © European Union, CC BY 4.0, and',
    creditStorms: 'Storm tracks:',
    creditStormsMid: 'and',
    creditOutlook: '7-day outlook:',
    creditOutlookMid: '; river flow from',
    creditOutlookEnd: ', CC BY 4.0.',
    // Heat map lines, one per source: lead, link, middle, link(s), end. GFS is public domain (no CC BY).
    creditHeatEcmwf:
      'Heat index map (ECMWF source) and rain forecast: based on data and products of the European Centre for Medium-Range Weather Forecasts (',
    creditHeatEcmwfMid: '), IFS HRES',
    creditHeatEcmwfData: 'open data',
    creditHeatEcmwfVia: ', via',
    creditHeatEcmwfEnd:
      ', CC BY 4.0. Changed: we work out the heat index from its temperature and humidity, and add up the rain in 3-hour steps.',
    creditHeatIcon: 'Heat index map, ICON source: based on data from Deutscher Wetterdienst (',
    creditHeatIconMid: '), gridded data reproduced graphically: the ICON global model, via',
    creditHeatIconEnd: ', CC BY 4.0.',
    creditHeatGfs: 'Heat index map, GFS source: the Global Forecast System of',
    // Follows the "NOAA" link with no space.
    creditHeatGfsMid: "'s National Weather Service (NCEP), via",
    creditHeatGfsEnd: '. Public domain.',
    creditAlerts: 'Official alerts: © PAGASA, CC BY 4.0, from its public alert feed.',
    creditNews: 'News headlines: the outlets named beside each headline, some found through Google News.',
    creditVideo: 'Video:',
    creditVideoEnd: ", from each outlet's own channel.",
    creditBasemap: 'Basemap:',
    creditBasemapMid: ', ©',
    creditBasemapData: ', data ©',
    creditBasemapEnd: 'contributors.',
  },

  // Feed names for the "out of date" banner, by the id the server sends.
  feeds: {
    earthquakes: 'earthquakes',
    weather: 'weather',
    officialAlerts: 'official alerts (PAGASA)',
    events: 'disaster events (GDACS)',
    naturalEvents: 'natural events (NASA EONET)',
    storms: 'storm tracks',
    outlook: '7-day outlook',
    riverFlow: 'river flow',
    news: 'headlines',
    heatMap: 'heat map',
    rainForecast: 'rain forecast',
  },

  // The language switch. The draft note is shown only when Filipino is chosen.
  language: {
    groupLabel: 'Language',
    english: 'English',
    filipino: 'Filipino',
    draftNote: 'The Filipino translation is a draft still under review.',
  },

  // The light/dark colour switch in the top bar.
  theme: {
    groupLabel: 'Colours',
    light: 'Light',
    dark: 'Dark',
  },

  // The "not an official warning" notice (page footer and status card).
  disclaimer: {
    lead: 'Unofficial estimate, not a warning service. For official warnings, follow',
    and: 'and',
  },

  // The top bar's view switch (ViewSwitch.tsx), by the ids in shared/src/mapViews.ts.
  // A view with no name here fails the typecheck. A view never changes the score.
  views: {
    groupLabel: 'Map view',
    names: {
      overall: 'Overall',
      typhoon: 'Typhoon',
      flood: 'Flood',
      earthquake: 'Earthquake',
      heat: 'Heat',
      stormSurge: 'Storm surge',
      tsunami: 'Tsunami',
    },
    more: 'More',
    // The More button while the pressed view is inside its menu.
    moreHolding: 'More: {view}',
    // The note beside a greyed-out view, by id; `noData` for one with no note of its own.
    notes: { stormSurge: 'Storm surge map not loaded yet', tsunami: 'No live feed for tsunamis yet' },
    noData: 'No live data yet',
  },

  // The map legend.
  legend: {
    title: 'Stress score (0–100)',
    noScore: 'No score yet',
    incomplete: 'Stripes over a colour: some data is missing, the score may be higher',
    event: 'Disaster event (thicker ring = higher alert)',
    stormPast: 'Storm track so far',
    stormForecast: 'Storm forecast',
    news: 'Place named in the news (bigger = more headlines)',
    showLabel: 'Show on the map',
    towns: 'Each city and municipality is coloured by its own score. Zoom in to see the borders.',
    heading: 'Map legend',
    // The fixed hazard maps (Project NOAH). The map shows the widest storm surge scenario.
    landslide: 'Landslide zones',
    stormSurge: 'Storm surge zones: SSA 4 scenario (more than 4 m)',
    zoomIn: 'Zoom in to see zones',
    hazardNote: 'Fixed maps from Project NOAH, not a forecast. They do not change the score.',
    hazardClasses: { 1: 'Low', 2: 'Medium', 3: 'High' },
    // The folded heading over the layers that don't belong to the pressed view.
    otherLayers: 'Other layers',
    // In the legend while a hazard view (not Overall) is pressed.
    scoresHidden: 'The score colours are hidden in this view. Press Overall to see them.',
    // The heat key's source line; {model} is a name from `heat.models`, or `heat.average`.
    heatSource: 'Source: {model}',
  },

  // The side panel before a spot is picked.
  spot: {
    title: 'Pick a spot',
    hint: 'Search for a place, use your location, or click anywhere on land. The score for that exact spot, the reasons for it and the next 7 days open here.',
    highest: 'Highest province scores now',
    noScores: 'No province has a score yet.',
    alertsTitle: 'Official alerts in effect',
    alertsNone: 'PAGASA lists no flood advisory or tropical cyclone alert in effect. Other warnings (rainfall, wind signals, volcanoes) are not checked here.',
  },

  // The search box over the map and the "use my location" button.
  search: {
    label: 'Find a place',
    placeholder: 'Search a city, municipality or province',
    // Shown beside a match that is a province (a town shows its province's name there).
    province: 'province',
    none: 'No place with that name. Try the name of the town or province.',
    failed: 'Search is not working right now. You can still click the map.',
    locate: 'Use my location',
    locateOutside: 'Your location is outside the Philippines, so there is no score for it.',
    locateFailed: 'Could not get your location. Check that this page is allowed to use it.',
  },

  // Score bands.
  bands: {
    calm: 'Nothing detected',
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    severe: 'Severe',
  },

  // Outlet groups for news and streams.
  categories: {
    official: 'Official',
    tv: 'TV',
    radio: 'Radio',
    online: 'Online and newspapers',
    regional: 'Regional',
    international: 'International',
  },

  // Kinds of disaster in the headlines panel (see shared/src/newsTypes.ts).
  newsTypes: {
    all: 'All',
    typhoon: 'Typhoons',
    flood: 'Floods',
    earthquake: 'Earthquakes',
    volcano: 'Volcanoes',
    landslide: 'Landslides',
    tsunami: 'Tsunamis and storm surges',
    drought: 'Droughts and dry spells',
    wildfire: 'Wildfires',
    heat: 'Extreme heat',
    general: 'General',
  },

  // Kinds of disaster event.
  kinds: {
    typhoon: 'typhoon',
    earthquake: 'earthquake',
    flood: 'flood',
    volcano: 'volcano',
    wildfire: 'wildfire',
    drought: 'drought',
    other: 'other',
  },

  // GDACS alert levels.
  alertLevels: {
    green: 'green',
    orange: 'orange',
    red: 'red',
  },

  // PAGASA rainfall levels.
  rainLevels: {
    yellow: 'yellow',
    orange: 'orange',
    red: 'red',
  },

  // PAGASA heat bands.
  heatBands: {
    caution: 'caution',
    'extreme caution': 'extreme caution',
    danger: 'danger',
    'extreme danger': 'extreme danger',
  },

  // Sentences explaining a score.
  reasons: {
    quake: 'M{magnitude} earthquake {where} ({depth}), {when}.',
    quakeInsideProvince: 'inside the province',
    lessThanOneKmAway: 'less than 1 km away',
    kmAway: '{km} km away',
    depthUnknown: 'depth unknown',
    depthKm: '{km} km deep',
    lessThanAnHourAgo: 'less than an hour ago',
    oneHourAgo: '1 hour ago',
    hoursAgo: '{hours} hours ago',
    moreQuakes: '{count} more smaller or older earthquakes nearby.',
    event: 'GDACS {level} alert: {kind} {where}{ended}.',
    eventInOrBesideProvince: 'in or beside the province',
    eventEnded: ' (now ended)',
    noWeatherProvince: 'No recent weather data for this province.',
    noWeatherSpot: 'No recent weather data for this spot.',
    noQuakeData: 'The earthquake feed has not answered lately, so recent earthquakes may be missing.',
    noEventData: 'The disaster event feed (GDACS) has not answered lately, so events may be missing.',
    rain: 'Rain: {rain1h} mm in the last hour, {rain24h} mm in the last 24 hours{level}.',
    rainLevel: " (a model estimate at PAGASA's {level} rainfall threshold; not a PAGASA warning)",
    heat: 'Heat index {heat} °C{band}.',
    heatBand: ' (PAGASA "{band}" band)',
    calm: 'Nothing detected here right now: no strong earthquake nearby, no heavy rain or extreme heat in the model, no disaster alert. This is not an all-clear.',
  },

  // Map popups and hover labels.
  map: {
    // Read out by a screen reader when it reaches the map.
    label: 'Map of the Philippines with each city and municipality coloured by its score. Arrow keys move it, plus and minus zoom. To pick a place without a pointer, use the search box or the list of highest scores.',
    sampleNotice: 'Sample data, not a real storm',
    noScoreYet: 'no score yet',
    atLeast: 'at least {score}',
    // Hover labels. A province shows its highest town's score and names that town.
    provinceLabel: '{province}: {score}',
    provinceTopLabel: '{province}: {score}, highest in {town}',
    townLabel: '{town}, {province}: {score}',
    // Hover labels while the score colours are hidden (Typhoon, Storm surge): the name only.
    townName: '{town}, {province}',
    popupKind: 'Kind: {kind}',
    popupAlert: 'Alert level: {level}',
    popupSource: 'Source: {source}',
    popupStarted: 'Started: {time}',
    popupSourcePage: 'Source page',
    popupForecast: 'Forecast position',
    popupObserved: 'Observed position',
    popupTime: 'Time: {time}',
    popupWind: 'Wind: {value}',
    popupPressure: 'Pressure: {value}',
    popupNewsTitle: '{province}: {count} in the news',
    popupNewsMore: 'and {count} more in the headlines panel',
    // The map's credit line while a hazard layer is drawn.
    hazardAttribution: 'Hazard maps © Project NOAH and its contributors, ODbL',
  },

  // The status card.
  card: {
    thisSpot: 'This spot',
    loading: 'Loading…',
    close: 'Close',
    loadError: 'Could not load this spot. It may be off the coast, or the server is not running.',
    stale: 'STALE',
    staleText: 'Some data is more than 1 hour old.',
    bandAtSpot: '{band} at this spot',
    bandInTown: '{band} across {town}',
    hazardsTitle: 'By hazard',
    // Beside the hazard row that the pressed map view shows.
    onMap: 'On the map',
    notCovered:
      'Not covered here: landslides, tsunami, PAGASA wind signals and rainfall warnings, PHIVOLCS volcano alert levels. Use the official links below.',
    incomplete: 'Some data is missing, so the real score may be higher.',
    nearTitle: 'Storms and disaster events near here',
    exactSpot: 'At the exact spot you picked: {score}, {band}',
    wholeProvince: 'Whole province ({province}): {score}, {band}',
    areaNote: 'This score is for the exact spot you picked. The town and province numbers on the map count the most exposed part of each, so they can be higher.',
    townNote: 'The big number is the whole town, the same score that colours it on the map. It counts the most exposed part of the town (its hottest, wettest, closest-to-a-quake reading), so the exact spot can be lower. A province shows its highest town.',
    why: 'Why',
    quakesTitle: 'Earthquakes, last 3 days',
    quakesNone: 'None within reach of this spot.',
    lessThanOneKmAway: 'Less than 1 km away',
    kmAway: '{km} km away',
    kmDeep: '{km} km deep',
    usgsPage: 'USGS page',
    quakesUnknown: 'Earthquakes could not be checked lately: recent ones may be missing.',
    weatherTitle: 'Weather',
    temperature: 'Temperature',
    humidity: 'Humidity',
    heatIndex: 'Heat index (feels like)',
    rain1h: 'Rain, last hour',
    rain24h: 'Rain, last 24 hours',
    weatherNote:
      'Modelled for this spot (to the nearest 5 km), valid for {time}. Not a station reading.',
    weatherNone: 'No weather reading for this spot right now.',
    updatedTitle: 'Last updated',
    scoreComputed: 'Score computed',
    quakesChecked: 'Earthquakes checked',
    weatherChecked: 'Weather checked',
  },

  // USGS's impact estimates under each earthquake on the status card. Shown
  // only when USGS gave them; they never change the score.
  quakeImpact: {
    pager: "PAGER alert: {level}. USGS's estimate of possible deaths and damage.",
    // PAGER levels, as words (never drawn in their colour).
    levels: {
      green: 'Green',
      yellow: 'Yellow',
      orange: 'Orange',
      red: 'Red',
    },
    // USGS's scale, not the PHIVOLCS intensity scale readers know, so say so.
    mmi: "USGS's estimated strongest shaking: {mmi} on the Modified Mercalli scale (not the PHIVOLCS intensity scale).",
    // The tsunami line is split around the PHIVOLCS link: lead, link, end.
    tsunamiLead: 'USGS shows tsunami information for this quake. For official tsunami warnings, check',
    tsunamiEnd: '.',
  },

  // The extra sections on the status card.
  conditions: {
    outlookTitle: 'Next 7 days',
    rain: 'Rain {value}',
    gust: 'Gust {value}',
    river: 'River {value}',
    outlookNote: 'Modelled data, not measurements: Open-Meteo. River flow: GloFAS, via Open-Meteo.',
    eventsTitle: 'Disaster events nearby',
    eventAway: '{distance} away, ',
    eventAlert: ', alert level {level}',
    eventEnded: ', ended {time}',
    otherEventsTitle: 'Other disaster events nearby',
    stormsTitle: 'Storms forecast to pass near',
    stormLine: 'about {distance} away around {time}',
    stormNote: 'The forecast centre is uncertain; the real path can be different.',
    // While Typhoon is pressed the storms block always shows, even with no storm.
    stormsNone: 'No tracked tropical cyclone is forecast to pass within 300 km of here.',
    stormsUnsure: 'The storm tracks could not be checked lately: a storm may be missing.',
    newsTitle: 'Recent headlines',
    bulletinsTitle: 'Official bulletins',
    bulletinsFallback: 'Official pages: pagasa.dost.gov.ph and phivolcs.dost.gov.ph.',
  },

  // Official bulletin link labels, by the id the server sends.
  bulletins: {
    'pagasa-cyclone': 'Tropical cyclone bulletin',
    'pagasa-flood': 'Flood information',
    'phivolcs-volcano': 'Volcano bulletins',
    'phivolcs-earthquake': 'Earthquake information',
  },

  // The headlines panel.
  news: {
    title: 'Disaster headlines',
    note: 'Sorted by the words in each headline, so a few may be in the wrong group. "General" means the headline names no kind of disaster, only a response such as an evacuation. The map shows the same group.',
    filterLabel: 'Filter by kind of disaster',
    failed: 'Could not load headlines right now.',
    none: 'No headlines to show.',
    alsoAt: 'Also at:',
    showOnMap: 'Show {places} on the map',
    loading: 'Loading…',
    // The panel title while one kind is chosen (by hand or by a map view), by NEWS_TYPES id.
    titles: {
      typhoon: 'Typhoon headlines',
      flood: 'Flood headlines',
      earthquake: 'Earthquake headlines',
      volcano: 'Volcano headlines',
      landslide: 'Landslide headlines',
      tsunami: 'Tsunami and storm surge headlines',
      drought: 'Drought headlines',
      wildfire: 'Wildfire headlines',
      heat: 'Heat headlines',
      general: 'General headlines',
    },
    // No headline of the chosen kind. {days} is how long headlines are kept (NEWS_KEEP_DAYS).
    noneOfKind: {
      typhoon: 'No typhoon headlines in the last {days} days.',
      flood: 'No flood headlines in the last {days} days.',
      earthquake: 'No earthquake headlines in the last {days} days.',
      volcano: 'No volcano headlines in the last {days} days.',
      landslide: 'No landslide headlines in the last {days} days.',
      tsunami: 'No tsunami or storm surge headlines in the last {days} days.',
      drought: 'No drought headlines in the last {days} days.',
      wildfire: 'No wildfire headlines in the last {days} days.',
      heat: 'No heat headlines in the last {days} days.',
      general: 'No general headlines in the last {days} days.',
    },
    showAll: 'Show all headlines',
  },

  // The live news panel (YouTube streams and latest videos).
  streams: {
    title: 'Live news',
    note: "Video: YouTube, from each outlet's own channel. A stream is not an official warning.",
    failed: 'Could not load the streams right now.',
    none: 'No streams are available right now.',
    live: 'LIVE',
    latest: 'Latest',
    latestMaybeOffline: 'Latest (may be offline)',
    videoTitle: '{outlet} video',
    play: 'Play',
    stop: 'Stop',
    refresh: 'Refresh',
    refreshing: 'Checking…',
    refreshLabel: 'Check the channels again for new live streams and videos',
  },

  // Where a piece of information comes from, shown as a small tag.
  tiers: {
    official: 'Official · {agency}',
    global: 'Global assessment',
    model: 'Model estimate',
    hazardMap: 'Fixed map · Project NOAH',
  },

  // The "Hazard map" block on the status card (HazardZones.tsx).
  hazardMap: {
    title: 'Hazard map',
    landslide: 'Landslide',
    stormSurge: 'Storm surge',
    classes: { 1: 'low', 2: 'medium', 3: 'high' },
    notInZone: 'not in a zone',
    notReached: 'not reached',
    // Unknown, never "safe": no map is loaded for this province.
    noMap: 'no hazard map here',
    // Storm surge advisory levels, in Project NOAH's wording.
    levels: {
      1: 'SSA 1 (up to 2 m)',
      2: 'SSA 2 (up to 3 m)',
      3: 'SSA 3 (up to 4 m)',
      4: 'SSA 4 (more than 4 m)',
    },
    note: 'Scenarios from fixed maps, not a forecast: each storm surge level shows where a surge that high would reach. They do not change the score.',
  },

  // Official alerts (the text of an alert itself is the agency's, never ours).
  alerts: {
    title: 'Official alerts for this area',
    nationwide: 'Whole Philippine area',
    times: 'Issued {sent} · in effect until {expires}',
    fullText: "Read {agency}'s full text",
    file: '{agency} alert file',
    about: 'About this kind of alert',
  },

  // One line per hazard on the status card.
  hazards: {
    quake: 'Earthquakes',
    rain: 'Rain',
    heat: 'Heat',
    event: 'Storms and disaster events (GDACS)',
    unknown: 'unknown',
    // The average view's {model} in the hover labels. {range} is `range` or `degrees`.
    averageAll: 'average of {total} models: {range}',
    averagePart: 'average of {used} of {total} models: {range}',
    averageNone: 'average of {total} models',
  },

  // The Earthquake view and the quake markers (display only; they never change the score).
  quakes: {
    scaleTitle: 'Earthquake part of the score (0–100)',
    unknownStripes: 'Stripes over a colour: earthquakes could not be checked, the part may be higher',
    overallHidden: 'The overall score is not shown in this view. Press Overall to see it.',
    legend: 'Earthquake (USGS; bigger = stronger)',
    loading: 'Loading earthquakes…',
    loadError: 'Could not load the earthquake list right now.',
    stale: 'The earthquake feed is out of date: recent earthquakes may be missing.',
    none: 'No earthquakes counted by the score in the last {hours} hours.',
    countOne: '1 earthquake in the last {hours} hours.',
    count: '{count} earthquakes in the last {hours} hours.',
    townLabel: '{town}, {province}: earthquake part {score}',
    provinceLabel: '{province}: earthquake part {score}',
    provinceTopLabel: '{province}: earthquake part {score}, in {town}',
    // {score} in the labels above when the town has no earthquake part yet.
    noValueLabel: 'no score yet',
    popupMagnitude: 'Magnitude {magnitude}',
    popupNoDepth: 'Depth not given',
    popupClick: 'Click for the USGS page',
    mapLabel: 'Map of the Philippines with each city and municipality coloured by the earthquake part of its score. Arrow keys move it, plus and minus zoom. To pick a place without a pointer, use the search box or the list of highest scores.',
  },

  // The Flood view: towns coloured by the rain part of the score (display only;
  // it never changes the score). The same keys as `quakes` for the shared parts.
  flood: {
    scaleTitle: 'Rain part of the score (0–100)',
    about: 'Rain in the last hour and the last 24 hours, from the weather model. A model estimate, not a PAGASA rainfall warning.',
    noValue: 'No rain reading',
    unknownStripes: 'Stripes over a colour: some towns have no rain reading, the part may be higher',
    overallHidden: 'The overall score is not shown in this view. Press Overall to see it.',
    townLabel: '{town}, {province}: rain part {score}',
    provinceLabel: '{province}: rain part {score}',
    provinceTopLabel: '{province}: rain part {score}, in {town}',
    // {score} in the labels above when the town has no rain reading (striped).
    noValueLabel: 'no rain reading',
    mapLabel: 'Map of the Philippines with each city and municipality coloured by the rain part of its score. Arrow keys move it, plus and minus zoom. To pick a place without a pointer, use the search box or the list of highest scores.',
  },

  // The Typhoon view: storm tracks only (no wind data yet). Display only.
  typhoon: {
    title: 'Tropical cyclone tracks',
    sources: 'Tracks and forecasts from JMA and JTWC.',
    noWind: 'Wind colours for each town are not available yet: the map shows the tracks only.',
    alertsNote: "PAGASA's tropical cyclone alerts for a place are on its status card, in PAGASA's own words.",
    // The dashed outline on the map and its legend row.
    par: 'Philippine Area of Responsibility (PAR): PAGASA names and warns about storms inside it',
    parShort: 'PAR',
    // Notes on the map (MapNote.tsx).
    loading: 'Loading storm tracks…',
    loadError: 'Could not load the storm tracks right now.',
    stale: 'The storm track feed is out of date: a storm may be missing, or its track may be old.',
    unchecked: 'Could not check how fresh the storm tracks are: a storm may be missing.',
    none: 'No tropical cyclone tracked right now.',
    hidden: 'Storm tracks are switched off. Tick them in the legend to see them.',
    mapLabel: 'Map of the Philippines with the tracks of tropical cyclones. Arrow keys move it, plus and minus zoom. To pick a place without a pointer, use the search box or the list of highest scores.',
  },

  // The rain forecast field in the Typhoon view (ECMWF via Open-Meteo). Display only.
  rain: {
    // The legend's tick box and key.
    title: 'Rain forecast (mm in 3 hours)',
    noValue: 'No forecast here',
    about: 'ECMWF model, points about 165 km apart, smoothed between them. A model estimate, not a PAGASA forecast.',
    // The panel over the map.
    panelTitle: 'Rain forecast',
    play: 'Play',
    pause: 'Pause',
    slider: 'Forecast time',
    updated: 'Updated {ago}',
    loading: 'Loading the rain forecast…',
    loadError: 'Could not load the rain forecast right now.',
    noData: 'No rain forecast yet: the first download has not finished.',
    stale: 'The rain forecast is out of date: newer model runs may differ.',
  },

  // The Storm surge view: the fixed Project NOAH zones. Display only.
  stormSurge: {
    title: 'Storm surge hazard map',
    about: 'A fixed map of where a storm surge could reach. It is not a live surge and not a forecast.',
    hidden: 'Storm surge zones are switched off. Tick them in the legend to see them.',
    mapLabel: 'Map of the Philippines with the Project NOAH storm surge hazard zones. Arrow keys move it, plus and minus zoom. To pick a place without a pointer, use the search box or the list of highest scores.',
  },

  // The heat map: its panel (HeatMapPanel.tsx, open while Heat is pressed), its
  // key in the legend and its hover labels. A display layer only; it never changes the score.
  heat: {
    title: 'Heat index map',
    close: 'Close heat map',
    source: 'Source',
    // By the Open-Meteo name (shared/src/heatModels.ts). A model with no name here fails the typecheck.
    models: { ecmwf_ifs: 'ECMWF', dwd_icon_global_native: 'ICON (DWD)', ncep_gfs_global: 'GFS (NOAA)' },
    km: '{km} km model',
    // The fourth choice: each town's value averaged over every model that has one.
    average: 'Average of all three',
    averageNote: '{total} models',
    updated: 'Updated {ago}',
    loading: 'Loading…',
    loadError: 'Could not load the heat map right now.',
    noData: 'No data yet for this source.',
    stale: 'This forecast is out of date.',
    staleSome: 'At least one of its sources is out of date.',
    keyTitle: "Heat index, PAGASA's bands",
    below: 'Below 27 °C',
    noValue: 'No value for this hour',
    // A band's range in the key: "27–32 °C", and the top band "52+ °C".
    range: '{from}–{to} °C',
    rangeTop: '{from}+ °C',
    spacing: 'Points are about 28 km apart for every source; a town shows its hottest point.',
    cardDiffers: "The status card uses Open-Meteo's blended forecast, so its number can differ.",
    // The chosen source's credit, shown next to the map (DWD and Open-Meteo ask for it there).
    // The "Open-Meteo" link (creditLink) follows it.
    credit: {
      ecmwf_ifs: 'Data: ECMWF (CC BY 4.0) via',
      dwd_icon_global_native: 'Data: Deutscher Wetterdienst (CC BY 4.0) via',
      ncep_gfs_global: 'Data: NOAA GFS (public domain) via',
    },
    creditLink: 'Open-Meteo',
    // Hover labels. {heat} is `degrees`, `degreesBand` or `unknown`; {model} is a name from `models`.
    townLabel: '{town}, {province}: {heat} · {model}',
    provinceLabel: '{province}: {heat} · {model}',
    degrees: '{heat} °C',
    degreesBand: '{heat} °C, {band}',
    unknown: 'unknown',
    // The average view's {model} in the hover labels. {range} is `range` or `degrees`.
    averageAll: 'average of {total} models: {range}',
    averagePart: 'average of {used} of {total} models: {range}',
    averageNone: 'average of {total} models',
    // Read out by a screen reader when it reaches the map while the heat map is on.
    mapLabel: 'Map of the Philippines with each city and municipality coloured by its heat index. Arrow keys move it, plus and minus zoom. To pick a place without a pointer, use the search box or the list of highest scores.',
  },

  // Small words used by the formatting helpers.
  format: {
    never: 'never',
    lessThanOneKm: 'less than 1 km',
    // "Uploaded 12 minutes ago", on its own row under a headline or stream.
    uploaded: 'Uploaded {ago}',
    ago: {
      justNow: 'just now',
      second: '{n} second ago',
      seconds: '{n} seconds ago',
      minute: '{n} minute ago',
      minutes: '{n} minutes ago',
      hour: '{n} hour ago',
      hours: '{n} hours ago',
      day: '{n} day ago',
      days: '{n} days ago',
    },
  },
};

/** The shape every language must follow. `typeof` reads the type off a value. */
export type Strings = typeof en;
