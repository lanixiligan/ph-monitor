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
    creditEvents: 'Disaster events:',
    creditEventsMid: ', © European Union, CC BY 4.0, and',
    creditStorms: 'Storm tracks:',
    creditStormsMid: 'and',
    creditOutlook: '7-day outlook:',
    creditOutlookMid: '; river flow from',
    creditOutlookEnd: ', CC BY 4.0.',
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
    notCovered:
      'Not covered here: landslides, storm surge, tsunami, PAGASA wind signals and rainfall warnings, PHIVOLCS volcano alert levels. Use the official links below.',
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
