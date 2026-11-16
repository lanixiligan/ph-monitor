// DRAFT: every string in this file is a first draft of the Filipino text, for
// the project owner to review. Each line ends with `// REVIEW`.
//
// `: Strings` below makes TypeScript stop with an error if a key is missing or
// extra compared with en.ts.

import type { Strings } from './en.ts';

export const fil: Strings = {
  // The page itself (header, jump links, load error, footer credits).
  app: {
    intro: 'Stress ngayon mula sa lindol, panahon at mga sakuna. I-click ang kahit saang lupa para sa lugar na iyon.', // REVIEW: unsure about "I-click"
    jumpHeadlines: 'Mga balita', // REVIEW
    jumpStreams: 'Mga live stream', // REVIEW
    loadError: 'Hindi ma-load ang mga score. Tumatakbo ba ang server?', // REVIEW
    creditQuakes: 'Mga lindol:', // REVIEW
    creditWeather: 'Panahon (mula sa modelo):', // REVIEW: unsure about "modelo"
    creditWeatherEnd: ', CC BY 4.0.', // REVIEW
    creditBoundaries: 'Mga hangganan: NAMRIA at PSA sa pamamagitan ng OCHA, CC BY 3.0 IGO, mula sa', // REVIEW
    creditEvents: 'Mga sakuna:', // REVIEW
    creditEventsMid: ', © European Union, CC BY 4.0, at', // REVIEW
    creditStorms: 'Landas ng mga bagyo:', // REVIEW
    creditStormsMid: 'at', // REVIEW
    creditOutlook: 'Panahon sa susunod na 7 araw:', // REVIEW
    creditOutlookMid: '; daloy ng ilog mula sa', // REVIEW
    creditOutlookEnd: ', CC BY 4.0.', // REVIEW
    creditNews: 'Mga headline ng balita: ang mga news outlet na nakasaad sa tabi ng bawat headline, ang ilan ay nakuha sa pamamagitan ng Google News.', // REVIEW
    creditVideo: 'Video:', // REVIEW
    creditVideoEnd: ', mula sa sariling channel ng bawat outlet.', // REVIEW
    creditBasemap: 'Basemap:', // REVIEW
    creditBasemapMid: ', ©', // REVIEW
    creditBasemapData: ', data ©', // REVIEW
    creditBasemapEnd: 'contributors.', // REVIEW: unsure about "contributors"
  },

  // The language switch. The draft note is shown only when Filipino is chosen.
  language: {
    groupLabel: 'Wika', // REVIEW
    english: 'English', // REVIEW
    filipino: 'Filipino', // REVIEW
    draftNote: 'Draft pa lamang ang salin sa Filipino at sinusuri pa.', // REVIEW: unsure about "salin"
  },

  // The "not an official warning" notice (page footer and status card).
  disclaimer: {
    lead: 'Hindi opisyal ang tantiyang ito at hindi ito serbisyo ng babala. Para sa opisyal na babala, sundin ang', // REVIEW: unsure about "tantiyang"
    and: 'at', // REVIEW
  },

  // The map legend.
  legend: {
    title: 'Stress score (0–100)', // REVIEW
    noScore: 'Wala pang score', // REVIEW
    event: 'Sakuna (mas makapal na ring = mas mataas na alerto)', // REVIEW
    stormPast: 'Landas ng bagyo hanggang ngayon', // REVIEW
    stormForecast: 'Forecast ng bagyo', // REVIEW
  },

  // Score bands.
  bands: {
    calm: 'Kalmado', // REVIEW
    low: 'Mababa', // REVIEW
    moderate: 'Katamtaman', // REVIEW
    high: 'Mataas', // REVIEW
    severe: 'Matindi', // REVIEW
  },

  // Outlet groups for news and streams.
  categories: {
    all: 'Lahat', // REVIEW
    official: 'Opisyal', // REVIEW
    tv: 'Telebisyon', // REVIEW
    radio: 'Radyo', // REVIEW
    online: 'Online at diyaryo', // REVIEW
    regional: 'Panrehiyon', // REVIEW
    international: 'Pandaigdig', // REVIEW
  },

  // Kinds of disaster event.
  kinds: {
    typhoon: 'bagyo', // REVIEW
    earthquake: 'lindol', // REVIEW
    flood: 'baha', // REVIEW
    volcano: 'bulkan', // REVIEW
    wildfire: 'sunog sa gubat', // REVIEW
    drought: 'tagtuyot', // REVIEW
    other: 'iba pa', // REVIEW
  },

  // GDACS alert levels.
  alertLevels: {
    green: 'berde', // REVIEW
    orange: 'kahel', // REVIEW
    red: 'pula', // REVIEW
  },

  // PAGASA rainfall levels.
  rainLevels: {
    yellow: 'dilaw', // REVIEW
    orange: 'kahel', // REVIEW
    red: 'pula', // REVIEW
  },

  // PAGASA heat bands.
  heatBands: {
    caution: 'pag-iingat', // REVIEW: unsure about "pag-iingat"
    'extreme caution': 'matinding pag-iingat', // REVIEW
    danger: 'panganib', // REVIEW
    'extreme danger': 'matinding panganib', // REVIEW
  },

  // Sentences explaining a score.
  reasons: {
    quake: 'Lindol na M{magnitude} {where} ({depth}), {when}.', // REVIEW
    quakeInsideProvince: 'sa loob ng probinsya', // REVIEW
    lessThanOneKmAway: 'wala pang 1 km ang layo', // REVIEW
    kmAway: '{km} km ang layo', // REVIEW
    depthUnknown: 'hindi alam ang lalim', // REVIEW
    depthKm: '{km} km ang lalim', // REVIEW
    lessThanAnHourAgo: 'wala pang isang oras ang nakalipas', // REVIEW
    oneHourAgo: '1 oras ang nakalipas', // REVIEW
    hoursAgo: '{hours} oras ang nakalipas', // REVIEW
    moreQuakes: '{count} pang mas maliit o mas lumang lindol sa malapit.', // REVIEW
    event: 'GDACS alerto na {level}: {kind} {where}{ended}.', // REVIEW: unsure about the word order of "alerto na {level}"
    eventInOrBesideProvince: 'sa loob o katabi ng probinsya', // REVIEW
    eventEnded: ' (tapos na)', // REVIEW
    noWeatherProvince: 'Walang bagong datos ng panahon para sa probinsyang ito.', // REVIEW
    noWeatherSpot: 'Walang bagong datos ng panahon para sa lugar na ito.', // REVIEW
    rain: 'Ulan: {rain1h} mm sa nakaraang oras, {rain24h} mm sa nakaraang 24 oras{level}.', // REVIEW
    rainLevel: ' (antas ng ulan ng PAGASA: {level})', // REVIEW: unsure about "antas ng ulan"
    heat: 'Heat index {heat} °C{band}.', // REVIEW
    heatBand: ' (antas ng PAGASA: "{band}")', // REVIEW
    calm: 'Walang malaking stress mula sa lindol, panahon o sakuna sa ngayon.', // REVIEW
  },

  // Map popups and hover labels.
  map: {
    sampleNotice: 'Sample na datos, hindi totoong bagyo', // REVIEW
    noScoreYet: 'wala pang score', // REVIEW
    popupKind: 'Uri: {kind}', // REVIEW
    popupAlert: 'Antas ng alerto: {level}', // REVIEW
    popupSource: 'Pinagmulan: {source}', // REVIEW
    popupStarted: 'Nagsimula: {time}', // REVIEW
    popupSourcePage: 'Pahina ng pinagmulan', // REVIEW
    popupForecast: 'Forecast na posisyon', // REVIEW
    popupObserved: 'Naobserbahang posisyon', // REVIEW
    popupTime: 'Oras: {time}', // REVIEW
    popupWind: 'Hangin: {value}', // REVIEW
    popupPressure: 'Presyon: {value}', // REVIEW
  },

  // The status card.
  card: {
    thisSpot: 'Lugar na ito', // REVIEW
    loading: 'Naglo-load…', // REVIEW
    close: 'Isara', // REVIEW
    loadError: 'Hindi ma-load ang lugar na ito. Maaaring nasa labas ito ng baybayin, o hindi tumatakbo ang server.', // REVIEW
    stale: 'LUMA NA', // REVIEW: unsure about "LUMA NA"
    staleText: 'May datos na mahigit 1 oras na.', // REVIEW
    bandAtSpot: '{band} sa lugar na ito', // REVIEW
    parts: 'Lindol {quake} · Panahon {weather} · Mga sakuna {event}', // REVIEW
    wholeProvince: 'Buong probinsya ({province}): {score}, {band}', // REVIEW
    why: 'Bakit', // REVIEW
    quakesTitle: 'Mga lindol, nakaraang 3 araw', // REVIEW
    quakesNone: 'Wala sa abot ng lugar na ito.', // REVIEW
    lessThanOneKmAway: 'Wala pang 1 km ang layo', // REVIEW
    kmAway: '{km} km ang layo', // REVIEW
    kmDeep: '{km} km ang lalim', // REVIEW
    usgsPage: 'Pahina ng USGS', // REVIEW
    weatherTitle: 'Panahon', // REVIEW
    temperature: 'Temperatura', // REVIEW
    humidity: 'Halumigmig', // REVIEW
    heatIndex: 'Heat index (ramdam na init)', // REVIEW: unsure about "ramdam na init"
    rain1h: 'Ulan, nakaraang oras', // REVIEW
    rain24h: 'Ulan, nakaraang 24 oras', // REVIEW
    weatherNote: 'Tantiya ng modelo para sa lugar na ito (sa pinakamalapit na 5 km), para sa {time}. Hindi ito sukat mula sa istasyon.', // REVIEW
    weatherNone: 'Walang datos ng panahon para sa lugar na ito sa ngayon.', // REVIEW
    updatedTitle: 'Huling na-update', // REVIEW
    scoreComputed: 'Nakalkula ang score', // REVIEW
    quakesChecked: 'Huling sinuri ang lindol', // REVIEW
    weatherChecked: 'Huling sinuri ang panahon', // REVIEW
  },

  // The extra sections on the status card.
  conditions: {
    outlookTitle: 'Susunod na 7 araw', // REVIEW
    rain: 'Ulan {value}', // REVIEW
    gust: 'Bugso ng hangin {value}', // REVIEW
    river: 'Ilog {value}', // REVIEW
    outlookNote: 'Datos mula sa modelo, hindi sukat: Open-Meteo. Daloy ng ilog: GloFAS, sa pamamagitan ng Open-Meteo.', // REVIEW
    eventsTitle: 'Mga sakuna sa malapit', // REVIEW
    eventAway: '{distance} ang layo, ', // REVIEW
    eventAlert: ', antas ng alerto: {level}', // REVIEW
    stormsTitle: 'Mga bagyong inaasahang dadaan sa malapit', // REVIEW
    stormLine: 'mga {distance} ang layo bandang {time}', // REVIEW
    stormNote: 'Hindi tiyak ang sentro ng forecast; maaaring iba ang tunay na landas.', // REVIEW
    newsTitle: 'Mga bagong balita', // REVIEW
    bulletinsTitle: 'Mga opisyal na bulletin', // REVIEW
    bulletinsFallback: 'Mga opisyal na pahina: pagasa.dost.gov.ph at phivolcs.dost.gov.ph.', // REVIEW
  },

  // Official bulletin link labels, by the id the server sends.
  bulletins: {
    'pagasa-cyclone': 'Bulletin ng tropical cyclone', // REVIEW
    'pagasa-flood': 'Impormasyon sa baha', // REVIEW
    'phivolcs-volcano': 'Mga bulletin sa bulkan', // REVIEW
    'phivolcs-earthquake': 'Impormasyon sa lindol', // REVIEW
  },

  // The headlines panel.
  news: {
    title: 'Mga balita tungkol sa sakuna', // REVIEW
    note: 'Label lang ang grupo para sa uri ng outlet. Hindi ito ranggo kung gaano ito dapat pagkatiwalaan.', // REVIEW
    filterLabel: 'I-filter ayon sa grupo ng outlet', // REVIEW
    failed: 'Hindi ma-load ang mga balita ngayon.', // REVIEW
    none: 'Walang balitang maipapakita.', // REVIEW
    alsoAt: 'Makikita rin sa:', // REVIEW
  },

  // The live streams panel.
  streams: {
    title: 'Mga live stream', // REVIEW
    note: 'Video: YouTube, mula sa sariling channel ng bawat outlet. Hindi opisyal na babala ang isang stream.', // REVIEW
    failed: 'Hindi ma-load ang mga stream ngayon.', // REVIEW
    none: 'Walang magagamit na stream ngayon.', // REVIEW
    live: 'LIVE', // REVIEW
    latest: 'Pinakabago', // REVIEW
    latestMaybeOffline: 'Pinakabago (maaaring offline)', // REVIEW
    uploaded: 'Na-upload noong {time}', // REVIEW
    videoTitle: 'Video ng {outlet}', // REVIEW
    play: 'I-play', // REVIEW
    stop: 'Ihinto', // REVIEW
  },

  // Small words used by the formatting helpers.
  format: {
    never: 'hindi pa', // REVIEW: unsure about "hindi pa"
    lessThanOneKm: 'wala pang 1 km', // REVIEW
  },
};
