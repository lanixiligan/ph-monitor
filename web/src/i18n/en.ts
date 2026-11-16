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
      'Stress right now from earthquakes, weather and disaster events. Click anywhere on land for that spot.',
    jumpHeadlines: 'Headlines',
    jumpStreams: 'Live streams',
    loadError: 'Could not load the scores. Is the server running?',
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
    creditNews: 'News headlines: the outlets named beside each headline, some found through Google News.',
    creditVideo: 'Video:',
    creditVideoEnd: ", from each outlet's own channel.",
    creditBasemap: 'Basemap:',
    creditBasemapMid: ', ©',
    creditBasemapData: ', data ©',
    creditBasemapEnd: 'contributors.',
  },

  // The language switch. The draft note is shown only when Filipino is chosen.
  language: {
    groupLabel: 'Language',
    english: 'English',
    filipino: 'Filipino',
    draftNote: 'The Filipino translation is a draft still under review.',
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
    event: 'Disaster event (thicker ring = higher alert)',
    stormPast: 'Storm track so far',
    stormForecast: 'Storm forecast',
  },

  // Score bands.
  bands: {
    calm: 'Calm',
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    severe: 'Severe',
  },

  // Outlet groups for news and streams.
  categories: {
    all: 'All',
    official: 'Official',
    tv: 'TV',
    radio: 'Radio',
    online: 'Online and newspapers',
    regional: 'Regional',
    international: 'International',
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
    rain: 'Rain: {rain1h} mm in the last hour, {rain24h} mm in the last 24 hours{level}.',
    rainLevel: ' (PAGASA {level} rainfall level)',
    heat: 'Heat index {heat} °C{band}.',
    heatBand: ' (PAGASA "{band}" band)',
    calm: 'No significant earthquake, weather or disaster event stress right now.',
  },

  // Map popups and hover labels.
  map: {
    sampleNotice: 'Sample data, not a real storm',
    noScoreYet: 'no score yet',
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
    parts: 'Earthquakes {quake} · Weather {weather} · Events {event}',
    wholeProvince: 'Whole province ({province}): {score}, {band}',
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
    note: 'The group is only a label for the kind of outlet. It is not a ranking of how far to trust it.',
    filterLabel: 'Filter by outlet group',
    failed: 'Could not load headlines right now.',
    none: 'No headlines to show.',
    alsoAt: 'Also at:',
  },

  // The live streams panel.
  streams: {
    title: 'Live streams',
    note: "Video: YouTube, from each outlet's own channel. A stream is not an official warning.",
    failed: 'Could not load the streams right now.',
    none: 'No streams are available right now.',
    live: 'LIVE',
    latest: 'Latest',
    latestMaybeOffline: 'Latest (may be offline)',
    uploaded: 'Uploaded {time}',
    videoTitle: '{outlet} video',
    play: 'Play',
    stop: 'Stop',
  },

  // Small words used by the formatting helpers.
  format: {
    never: 'never',
    lessThanOneKm: 'less than 1 km',
  },
};

/** The shape every language must follow. `typeof` reads the type off a value. */
export type Strings = typeof en;
