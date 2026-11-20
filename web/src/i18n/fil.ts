// DRAFT: every string in this file is a first draft of the Filipino text, for
// the project owner to review. Each line ends with `// REVIEW`.
//
// `: Strings` below makes TypeScript stop with an error if a key is missing or
// extra compared with en.ts.

import type { Strings } from './en.ts';

export const fil: Strings = {
  // The page itself (header, jump links, load error, footer credits).
  app: {
    intro: 'Stress ngayon mula sa lindol, panahon at mga sakuna. Maghanap ng lugar o i-click ang kahit saang lupa.', // REVIEW: unsure about "i-click"
    jumpHeadlines: 'Mga balita', // REVIEW
    jumpStreams: 'Live na balita', // REVIEW
    loadError: 'Hindi ma-load ang mga score. Tumatakbo ba ang server?', // REVIEW
    staleBanner: 'Hindi na bago: {feeds}. Maaaring luma o kulang ang nakikita mo para sa mga ito.', // REVIEW
    statusError: 'Hindi matiyak kung gaano kabago ang datos.', // REVIEW
    creditsLink: 'Mga pinagmulan ng datos at pagkilala', // REVIEW: unsure about "pagkilala"
    creditsTitle: 'Mga pinagmulan ng datos at pagkilala', // REVIEW: unsure about "pagkilala"
    backToMap: 'Bumalik sa mapa', // REVIEW
    creditQuakes: 'Mga lindol:', // REVIEW
    creditWeather: 'Panahon (mula sa modelo):', // REVIEW: unsure about "modelo"
    creditWeatherEnd: ', CC BY 4.0.', // REVIEW
    creditBoundaries: 'Mga hangganan: NAMRIA at PSA sa pamamagitan ng OCHA, CC BY 3.0 IGO, mula sa', // REVIEW
    creditHazards: 'Mga mapa ng panganib:', // REVIEW
    creditHazardsMid: 'at ang mga kontribyutor nito (UP NOAH Center); mga mapa ng pagguho ng lupa ng UP NIGS, mga mapa ng daluyong ng PAGASA kasama ang UP NIGS. Lisensya:', // REVIEW: unsure about "kontribyutor"
    creditHazardsOdbl: 'Ang mga hugis ng hazard zone na ipinapakita ng aming mapa ay pinasimple mula sa datos ng Project NOAH at makukuha sa ilalim ng ODbL 1.0.', // REVIEW
    creditEvents: 'Mga sakuna:', // REVIEW
    creditEventsMid: ', © European Union, CC BY 4.0, at', // REVIEW
    creditStorms: 'Landas ng mga bagyo:', // REVIEW
    creditStormsMid: 'at', // REVIEW
    creditOutlook: 'Panahon sa susunod na 7 araw:', // REVIEW
    creditOutlookMid: '; daloy ng ilog mula sa', // REVIEW
    creditOutlookEnd: ', CC BY 4.0.', // REVIEW
    creditHeatEcmwf: 'Mapa ng heat index, pinagmulang ECMWF: batay sa datos at produkto ng European Centre for Medium-Range Weather Forecasts (', // REVIEW
    creditHeatEcmwfMid: '), IFS HRES', // REVIEW
    creditHeatEcmwfData: 'open data', // REVIEW
    creditHeatEcmwfVia: ', sa pamamagitan ng', // REVIEW
    creditHeatEcmwfEnd: ', CC BY 4.0. Binago: kinukuwenta namin ang heat index mula sa temperatura at halumigmig nito.', // REVIEW: unsure about "kinukuwenta"
    creditHeatIcon: 'Mapa ng heat index, pinagmulang ICON: batay sa datos mula sa Deutscher Wetterdienst (', // REVIEW
    creditHeatIconMid: '), gridded data na ipinakita nang grapiko: ang ICON global model, sa pamamagitan ng', // REVIEW: unsure about "ipinakita nang grapiko"
    creditHeatIconEnd: ', CC BY 4.0.', // REVIEW
    creditHeatGfs: 'Mapa ng heat index, pinagmulang GFS: ang Global Forecast System ng National Weather Service (NCEP) ng', // REVIEW
    creditHeatGfsMid: ', sa pamamagitan ng', // REVIEW
    creditHeatGfsEnd: '. Public domain.', // REVIEW
    creditAlerts: 'Mga opisyal na babala: © PAGASA, CC BY 4.0, mula sa public alert feed nito.', // REVIEW
    creditNews: 'Mga headline ng balita: ang mga news outlet na nakasaad sa tabi ng bawat headline, ang ilan ay nakuha sa pamamagitan ng Google News.', // REVIEW
    creditVideo: 'Video:', // REVIEW
    creditVideoEnd: ', mula sa sariling channel ng bawat outlet.', // REVIEW
    creditBasemap: 'Basemap:', // REVIEW
    creditBasemapMid: ', ©', // REVIEW
    creditBasemapData: ', data ©', // REVIEW
    creditBasemapEnd: 'contributors.', // REVIEW: unsure about "contributors"
  },

  // Mga pangalan ng feed para sa babalang "hindi na bago".
  feeds: {
    earthquakes: 'lindol', // REVIEW
    weather: 'panahon', // REVIEW
    officialAlerts: 'mga opisyal na babala (PAGASA)', // REVIEW
    events: 'mga sakuna (GDACS)', // REVIEW
    naturalEvents: 'mga likas na pangyayari (NASA EONET)', // REVIEW
    storms: 'landas ng bagyo', // REVIEW
    outlook: 'susunod na 7 araw', // REVIEW
    riverFlow: 'agos ng ilog', // REVIEW
    news: 'mga balita', // REVIEW
    heatMap: 'mapa ng heat index', // REVIEW
  },

  // The language switch. The draft note is shown only when Filipino is chosen.
  language: {
    groupLabel: 'Wika', // REVIEW
    english: 'English', // REVIEW
    filipino: 'Filipino', // REVIEW
    draftNote: 'Draft pa lamang ang salin sa Filipino at sinusuri pa.', // REVIEW: unsure about "salin"
  },

  theme: {
    groupLabel: 'Kulay', // REVIEW
    light: 'Maliwanag', // REVIEW
    dark: 'Madilim', // REVIEW
  },

  // The "not an official warning" notice (page footer and status card).
  disclaimer: {
    lead: 'Hindi opisyal ang tantiyang ito at hindi ito serbisyo ng babala. Para sa opisyal na babala, sundin ang', // REVIEW: unsure about "tantiyang"
    and: 'at', // REVIEW
  },

  // The map legend.
  views: {
    groupLabel: 'Uri ng mapa', // REVIEW
    names: {
      overall: 'Kabuuan', // REVIEW
      heat: 'Init', // REVIEW
      earthquake: 'Lindol', // REVIEW
      tsunami: 'Tsunami', // REVIEW
    },
    more: 'Iba pa', // REVIEW
    moreHolding: 'Iba pa: {view}', // REVIEW
    notes: {
      tsunami: 'Wala pang live feed para sa tsunami', // REVIEW
    },
    noData: 'Wala pang live na datos', // REVIEW
  },
  legend: {
    title: 'Stress score (0–100)', // REVIEW
    noScore: 'Wala pang score', // REVIEW
    incomplete: 'May guhit sa ibabaw ng kulay: may kulang na datos, maaaring mas mataas ang score', // REVIEW
    event: 'Sakuna (mas makapal na ring = mas mataas na alerto)', // REVIEW
    stormPast: 'Landas ng bagyo hanggang ngayon', // REVIEW
    stormForecast: 'Forecast ng bagyo', // REVIEW
    news: 'Lugar na nasa balita (mas malaki = mas maraming balita)', // REVIEW
    showLabel: 'Ipakita sa mapa', // REVIEW
    towns: 'May sariling kulay ang bawat lungsod at bayan ayon sa sarili nitong score. Mag-zoom in para makita ang mga hangganan.', // REVIEW
    heading: 'Palatandaan ng mapa', // REVIEW
    landslide: 'Mga zone ng pagguho ng lupa', // REVIEW
    stormSurge: 'Mga zone ng daluyong: senaryong SSA 4 (higit sa 4 m)', // REVIEW
    zoomIn: 'Mag-zoom in para makita ang mga zone', // REVIEW
    hazardNote: 'Nakapirming mapa mula sa Project NOAH, hindi forecast. Hindi nito binabago ang score.', // REVIEW: unsure about "nakapirming"
    hazardClasses: {
      1: 'Mababa', // REVIEW
      2: 'Katamtaman', // REVIEW
      3: 'Mataas', // REVIEW
    },
    otherLayers: 'Iba pang layer', // REVIEW
    scoresHidden: 'Nakatago ang mga kulay ng score sa view na ito. Pindutin ang Kabuuan para makita ang mga ito.', // REVIEW
    heatSource: 'Pinagmulan: {model}', // REVIEW
  },

  // The side panel before a spot is picked.
  spot: {
    title: 'Pumili ng lugar', // REVIEW
    hint: 'Maghanap ng lugar, gamitin ang iyong lokasyon, o i-click ang kahit saang lupa. Dito lalabas ang score para sa mismong lugar na iyon, ang mga dahilan nito at ang susunod na 7 araw.', // REVIEW
    highest: 'Pinakamataas na score ng mga lalawigan/probinsya ngayon', // REVIEW
    noScores: 'Wala pang lalawigan/probinsyang may score.', // REVIEW
    alertsTitle: 'Mga opisyal na babalang may bisa', // REVIEW
    alertsNone: 'Walang nakalistang general flood advisory o tropical cyclone alert ang PAGASA na may bisa. Hindi sinusuri dito ang ibang babala (ulan, wind signal, bulkan).', // REVIEW
  },

  // Ang search box sa ibabaw ng mapa at ang button na "gamitin ang aking lokasyon".
  search: {
    label: 'Maghanap ng lugar', // REVIEW
    placeholder: 'Maghanap ng lungsod, bayan o lalawigan/probinsya', // REVIEW
    province: 'lalawigan/probinsya', // REVIEW
    none: 'Walang lugar na may ganyang pangalan. Subukan ang pangalan ng bayan o lalawigan/probinsya.', // REVIEW
    failed: 'Hindi gumagana ang paghahanap sa ngayon. Maaari mo pa ring i-click ang mapa.', // REVIEW
    locate: 'Gamitin ang aking lokasyon', // REVIEW
    locateOutside: 'Nasa labas ng Pilipinas ang iyong lokasyon, kaya walang score para dito.', // REVIEW
    locateFailed: 'Hindi makuha ang iyong lokasyon. Tiyaking pinapayagan ang pahinang ito na gamitin ito.', // REVIEW
  },

  // Score bands.
  bands: {
    calm: 'Walang natukoy', // REVIEW
    low: 'Mababa', // REVIEW
    moderate: 'Katamtaman', // REVIEW
    high: 'Mataas', // REVIEW
    severe: 'Matindi', // REVIEW
  },

  // Outlet groups for news and streams.
  categories: {
    official: 'Opisyal', // REVIEW
    tv: 'Telebisyon', // REVIEW
    radio: 'Radyo', // REVIEW
    online: 'Online at diyaryo', // REVIEW
    regional: 'Panrehiyon', // REVIEW
    international: 'Pandaigdig', // REVIEW
  },

  // Kinds of disaster in the headlines panel (see shared/src/newsTypes.ts).
  newsTypes: {
    all: 'Lahat', // REVIEW
    typhoon: 'Bagyo', // REVIEW
    flood: 'Baha', // REVIEW
    earthquake: 'Lindol', // REVIEW
    volcano: 'Bulkan', // REVIEW
    landslide: 'Pagguho ng lupa', // REVIEW
    tsunami: 'Tsunami at daluyong', // REVIEW
    drought: 'Tagtuyot', // REVIEW
    wildfire: 'Sunog sa gubat', // REVIEW
    heat: 'Matinding init', // REVIEW
    general: 'Pangkalahatan', // REVIEW
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
    quakeInsideProvince: 'sa loob ng lalawigan/probinsya', // REVIEW
    lessThanOneKmAway: 'wala pang 1 km ang layo', // REVIEW
    kmAway: '{km} km ang layo', // REVIEW
    depthUnknown: 'hindi alam ang lalim', // REVIEW
    depthKm: '{km} km ang lalim', // REVIEW
    lessThanAnHourAgo: 'wala pang isang oras ang nakalipas', // REVIEW
    oneHourAgo: '1 oras ang nakalipas', // REVIEW
    hoursAgo: '{hours} oras ang nakalipas', // REVIEW
    moreQuakes: '{count} pang mas maliit o mas lumang lindol sa malapit.', // REVIEW
    event: 'GDACS alerto na {level}: {kind} {where}{ended}.', // REVIEW: unsure about the word order of "alerto na {level}"
    eventInOrBesideProvince: 'sa loob o katabi ng lalawigan/probinsya', // REVIEW
    eventEnded: ' (tapos na)', // REVIEW
    noWeatherProvince: 'Walang bagong datos ng panahon para sa lalawigan/probinsyang ito.', // REVIEW
    noWeatherSpot: 'Walang bagong datos ng panahon para sa lugar na ito.', // REVIEW
    noQuakeData: 'Hindi sumasagot kamakailan ang feed ng lindol, kaya maaaring may kulang na bagong lindol.', // REVIEW
    noEventData: 'Hindi sumasagot kamakailan ang feed ng sakuna (GDACS), kaya maaaring may kulang.', // REVIEW
    rain: 'Ulan: {rain1h} mm sa nakaraang oras, {rain24h} mm sa nakaraang 24 oras{level}.', // REVIEW
    rainLevel: ' (tantiya ng modelo na abot sa {level} na antas ng ulan ng PAGASA; hindi ito babala ng PAGASA)', // REVIEW: unsure about "antas ng ulan"
    heat: 'Heat index {heat} °C{band}.', // REVIEW
    heatBand: ' (antas ng PAGASA: "{band}")', // REVIEW
    calm: 'Walang natukoy dito sa ngayon: walang malakas na lindol sa malapit, walang malakas na ulan o matinding init sa modelo, walang alerto ng sakuna. Hindi ito nangangahulugang ligtas na.', // REVIEW
  },

  // Map popups and hover labels.
  map: {
    label: 'Mapa ng Pilipinas, may kulay ang bawat lungsod at bayan ayon sa score nito. Ginagalaw ito ng mga arrow key, at nagzo-zoom ang plus at minus. Para pumili ng lugar nang walang pointer, gamitin ang search box o ang listahan ng pinakamataas na score.', // REVIEW
    sampleNotice: 'Sample na datos, hindi totoong bagyo', // REVIEW
    noScoreYet: 'wala pang score', // REVIEW
    atLeast: 'hindi bababa sa {score}', // REVIEW
    provinceLabel: '{province}: {score}', // REVIEW
    provinceTopLabel: '{province}: {score}, pinakamataas sa {town}', // REVIEW
    townLabel: '{town}, {province}: {score}', // REVIEW
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
    popupNewsTitle: '{province}: {count} sa balita', // REVIEW
    popupNewsMore: 'at {count} pa sa panel ng mga balita', // REVIEW
    hazardAttribution: 'Mga mapa ng panganib © Project NOAH at ang mga kontribyutor nito, ODbL', // REVIEW
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
    bandInTown: '{band} sa buong {town}', // REVIEW
    hazardsTitle: 'Ayon sa uri ng banta', // REVIEW
    onMap: 'Nasa mapa', // REVIEW
    notCovered:
      'Hindi saklaw dito: pagguho ng lupa, tsunami, wind signal at babala sa ulan ng PAGASA, alert level ng bulkan ng PHIVOLCS. Gamitin ang mga opisyal na link sa ibaba.', // REVIEW
    incomplete: 'May kulang na datos, kaya maaaring mas mataas ang totoong score.', // REVIEW
    nearTitle: 'Mga bagyo at sakuna malapit dito', // REVIEW
    exactSpot: 'Sa mismong lugar na pinili mo: {score}, {band}', // REVIEW
    wholeProvince: 'Buong lalawigan/probinsya ({province}): {score}, {band}', // REVIEW
    areaNote: 'Ang score na ito ay para sa mismong lugar na pinili mo. Ang mga numero ng bayan at lalawigan/probinsya sa mapa ay para sa pinaka-apektadong bahagi ng bawat isa, kaya maaaring mas mataas ang mga ito.', // REVIEW
    townNote: 'Ang malaking numero ay para sa buong bayan, ang parehong score na nagbibigay ng kulay nito sa mapa. Binibilang nito ang pinaka-apektadong bahagi ng bayan (pinakamainit, pinakamaulan, pinakamalapit sa lindol), kaya maaaring mas mababa ang mismong lugar. Ang lalawigan/probinsya ay nagpapakita ng pinakamataas nitong bayan.', // REVIEW
    why: 'Bakit', // REVIEW
    quakesTitle: 'Mga lindol, nakaraang 3 araw', // REVIEW
    quakesNone: 'Wala sa abot ng lugar na ito.', // REVIEW
    lessThanOneKmAway: 'Wala pang 1 km ang layo', // REVIEW
    kmAway: '{km} km ang layo', // REVIEW
    kmDeep: '{km} km ang lalim', // REVIEW
    usgsPage: 'Pahina ng USGS', // REVIEW
    quakesUnknown: 'Hindi nasuri ang mga lindol kamakailan: maaaring may kulang na bagong lindol.', // REVIEW
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

  // USGS's impact estimates under each earthquake on the status card.
  quakeImpact: {
    pager: 'PAGER alert: {level}. Tantiya ng USGS sa posibleng masasawi at pinsala.', // REVIEW: unsure about "masasawi"
    levels: {
      green: 'Berde', // REVIEW
      yellow: 'Dilaw', // REVIEW
      orange: 'Kahel', // REVIEW
      red: 'Pula', // REVIEW
    },
    mmi: 'Tantiya ng USGS sa pinakamalakas na pagyanig: {mmi} sa Modified Mercalli scale (hindi ang intensity scale ng PHIVOLCS).', // REVIEW: unsure about "pagyanig"
    tsunamiLead: 'May impormasyon ang USGS tungkol sa tsunami para sa lindol na ito. Para sa opisyal na babala sa tsunami, tingnan ang', // REVIEW
    tsunamiEnd: '.', // REVIEW
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
    eventEnded: ', natapos {time}', // REVIEW
    otherEventsTitle: 'Iba pang sakuna sa malapit', // REVIEW
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
    note: 'Inayos ayon sa mga salita sa bawat headline, kaya maaaring mali ang grupo ng ilan. Ang "Pangkalahatan" ay headline na walang binanggit na uri ng sakuna, tulad ng paglikas lang. Ganito rin ang ipinapakita sa mapa.', // REVIEW
    filterLabel: 'I-filter ayon sa uri ng sakuna', // REVIEW
    failed: 'Hindi ma-load ang mga balita ngayon.', // REVIEW
    none: 'Walang balitang maipapakita.', // REVIEW
    alsoAt: 'Makikita rin sa:', // REVIEW
    showOnMap: 'Ipakita ang {places} sa mapa', // REVIEW
    loading: 'Naglo-load…', // REVIEW
    titles: {
      typhoon: 'Mga balita tungkol sa bagyo', // REVIEW
      flood: 'Mga balita tungkol sa baha', // REVIEW
      earthquake: 'Mga balita tungkol sa lindol', // REVIEW
      volcano: 'Mga balita tungkol sa bulkan', // REVIEW
      landslide: 'Mga balita tungkol sa pagguho ng lupa', // REVIEW
      tsunami: 'Mga balita tungkol sa tsunami at daluyong', // REVIEW
      drought: 'Mga balita tungkol sa tagtuyot', // REVIEW
      wildfire: 'Mga balita tungkol sa sunog sa gubat', // REVIEW
      heat: 'Mga balita tungkol sa matinding init', // REVIEW
      general: 'Mga pangkalahatang balita', // REVIEW
    },
    noneOfKind: {
      typhoon: 'Walang balita tungkol sa bagyo sa nakaraang {days} araw.', // REVIEW
      flood: 'Walang balita tungkol sa baha sa nakaraang {days} araw.', // REVIEW
      earthquake: 'Walang balita tungkol sa lindol sa nakaraang {days} araw.', // REVIEW
      volcano: 'Walang balita tungkol sa bulkan sa nakaraang {days} araw.', // REVIEW
      landslide: 'Walang balita tungkol sa pagguho ng lupa sa nakaraang {days} araw.', // REVIEW
      tsunami: 'Walang balita tungkol sa tsunami o daluyong sa nakaraang {days} araw.', // REVIEW
      drought: 'Walang balita tungkol sa tagtuyot sa nakaraang {days} araw.', // REVIEW
      wildfire: 'Walang balita tungkol sa sunog sa gubat sa nakaraang {days} araw.', // REVIEW
      heat: 'Walang balita tungkol sa matinding init sa nakaraang {days} araw.', // REVIEW
      general: 'Walang pangkalahatang balita sa nakaraang {days} araw.', // REVIEW
    },
    showAll: 'Ipakita ang lahat ng balita', // REVIEW
  },

  // The live news panel (YouTube streams and latest videos).
  streams: {
    title: 'Live na balita', // REVIEW
    note: 'Video: YouTube, mula sa sariling channel ng bawat outlet. Hindi opisyal na babala ang isang stream.', // REVIEW
    failed: 'Hindi ma-load ang mga stream ngayon.', // REVIEW
    none: 'Walang magagamit na stream ngayon.', // REVIEW
    live: 'LIVE', // REVIEW
    latest: 'Pinakabago', // REVIEW
    latestMaybeOffline: 'Pinakabago (maaaring offline)', // REVIEW
    videoTitle: 'Video ng {outlet}', // REVIEW
    play: 'I-play', // REVIEW
    stop: 'Ihinto', // REVIEW
    refresh: 'I-refresh', // REVIEW
    refreshing: 'Sinusuri…', // REVIEW
    refreshLabel: 'Suriin muli ang mga channel para sa bagong live stream at video', // REVIEW
  },

  // Kung saan galing ang impormasyon, ipinapakita bilang maliit na tatak.
  tiers: {
    official: 'Opisyal · {agency}', // REVIEW
    global: 'Pandaigdigang pagtatasa', // REVIEW
    model: 'Tantiya ng modelo', // REVIEW
    hazardMap: 'Nakapirming mapa · Project NOAH', // REVIEW: unsure about "nakapirming"
  },

  // Ang bloke na "Mapa ng panganib" sa status card (HazardZones.tsx).
  hazardMap: {
    title: 'Mapa ng panganib', // REVIEW
    landslide: 'Pagguho ng lupa', // REVIEW
    stormSurge: 'Daluyong', // REVIEW
    classes: {
      1: 'mababa', // REVIEW
      2: 'katamtaman', // REVIEW
      3: 'mataas', // REVIEW
    },
    notInZone: 'wala sa zone', // REVIEW
    notReached: 'hindi inaabot', // REVIEW: unsure about "hindi inaabot"
    noMap: 'walang hazard map dito', // REVIEW
    levels: {
      1: 'SSA 1 (hanggang 2 m)', // REVIEW
      2: 'SSA 2 (hanggang 3 m)', // REVIEW
      3: 'SSA 3 (hanggang 4 m)', // REVIEW
      4: 'SSA 4 (higit sa 4 m)', // REVIEW
    },
    note: 'Mga senaryo mula sa nakapirming mapa, hindi forecast: ipinapakita ng bawat antas ng daluyong kung hanggang saan aabot ang daluyong na ganoon kataas. Hindi nito binabago ang score.', // REVIEW
  },

  // Mga opisyal na babala (ang teksto ng babala ay sa ahensya, hindi sa atin).
  alerts: {
    title: 'Mga opisyal na babala para sa lugar na ito', // REVIEW
    nationwide: 'Buong saklaw ng Pilipinas', // REVIEW
    times: 'Inilabas {sent} · may bisa hanggang {expires}', // REVIEW
    fullText: 'Basahin ang buong teksto ng {agency}', // REVIEW
    file: 'Alert file ng {agency}', // REVIEW
    about: 'Tungkol sa ganitong babala', // REVIEW
  },

  // Isang linya bawat panganib sa status card.
  hazards: {
    quake: 'Lindol', // REVIEW
    rain: 'Ulan', // REVIEW
    heat: 'Init', // REVIEW
    event: 'Mga bagyo at sakuna (GDACS)', // REVIEW
    unknown: 'hindi alam', // REVIEW
    averageAll: 'average ng {total} modelo: {range}', // REVIEW
    averagePart: 'average ng {used} sa {total} modelo: {range}', // REVIEW
    averageNone: 'average ng {total} modelo', // REVIEW
  },

  // The Earthquake view and the quake markers (display only; they never change the score).
  quakes: {
    scaleTitle: 'Bahagi ng lindol sa score (0–100)', // REVIEW
    unknownStripes: 'Guhit sa ibabaw ng kulay: hindi masuri ang lindol, maaaring mas mataas ang bahagi', // REVIEW
    overallHidden: 'Hindi ipinapakita ang kabuuang score sa view na ito. Pindutin ang Kabuuan para makita ito.', // REVIEW
    legend: 'Lindol (USGS; mas malaki = mas malakas)', // REVIEW
    loading: 'Naglo-load ng mga lindol…', // REVIEW
    loadError: 'Hindi ma-load ang listahan ng lindol ngayon.', // REVIEW
    stale: 'Luma na ang datos ng lindol: maaaring may kulang na bagong lindol.', // REVIEW
    none: 'Walang lindol na binilang ng score sa nakaraang {hours} oras.', // REVIEW
    countOne: '1 lindol sa nakaraang {hours} oras.', // REVIEW
    count: '{count} lindol sa nakaraang {hours} oras.', // REVIEW
    townLabel: '{town}, {province}: bahagi ng lindol {score}', // REVIEW
    provinceLabel: '{province}: bahagi ng lindol {score}', // REVIEW
    provinceTopLabel: '{province}: bahagi ng lindol {score}, sa {town}', // REVIEW
    popupMagnitude: 'Magnitude {magnitude}', // REVIEW
    popupNoDepth: 'Walang ibinigay na lalim', // REVIEW
    popupClick: 'I-click para sa pahina ng USGS', // REVIEW
    mapLabel: 'Mapa ng Pilipinas, may kulay ang bawat lungsod at bayan ayon sa bahagi ng lindol sa score nito. Ginagalaw ito ng mga arrow key, at nagzo-zoom ang plus at minus. Para pumili ng lugar nang walang pointer, gamitin ang search box o ang listahan ng pinakamataas na score.', // REVIEW
  },

  // The heat map: its panel (HeatMapPanel.tsx), its key in the legend and its hover labels.
  heat: {
    title: 'Mapa ng heat index', // REVIEW
    close: 'Isara ang mapa ng init', // REVIEW
    source: 'Pinagmulan', // REVIEW
    models: {
      ecmwf_ifs: 'ECMWF', // REVIEW
      dwd_icon_global_native: 'ICON (DWD)', // REVIEW
      ncep_gfs_global: 'GFS (NOAA)', // REVIEW
    },
    km: 'modelong {km} km', // REVIEW
    average: 'Average ng tatlo', // REVIEW
    averageNote: '{total} modelo', // REVIEW
    updated: 'Na-update {ago}', // REVIEW
    loading: 'Naglo-load…', // REVIEW
    loadError: 'Hindi ma-load ang mapa ng init ngayon.', // REVIEW
    noData: 'Wala pang datos para sa pinagmulang ito.', // REVIEW
    stale: 'Luma na ang forecast na ito.', // REVIEW
    staleSome: 'Luma na ang kahit isa sa mga pinagmulan nito.', // REVIEW
    keyTitle: 'Heat index, ayon sa mga antas ng PAGASA', // REVIEW
    below: 'Mas mababa sa 27 °C', // REVIEW
    noValue: 'Walang halaga para sa oras na ito', // REVIEW: unsure about "halaga"
    range: '{from}–{to} °C', // REVIEW
    rangeTop: '{from}+ °C', // REVIEW
    spacing: 'Mga 28 km ang layo ng mga punto sa bawat pinagmulan; ipinapakita ng bawat bayan ang pinakamainit nitong punto.', // REVIEW
    cardDiffers: 'Gumagamit ang status card ng pinagsamang forecast ng Open-Meteo, kaya maaaring iba ang numero nito.', // REVIEW
    credit: {
      ecmwf_ifs: 'Datos: ECMWF (CC BY 4.0) sa pamamagitan ng', // REVIEW
      dwd_icon_global_native: 'Datos: Deutscher Wetterdienst (CC BY 4.0) sa pamamagitan ng', // REVIEW
      ncep_gfs_global: 'Datos: NOAA GFS (public domain) sa pamamagitan ng', // REVIEW
    },
    creditLink: 'Open-Meteo', // REVIEW
    townLabel: '{town}, {province}: {heat} · {model}', // REVIEW
    provinceLabel: '{province}: {heat} · {model}', // REVIEW
    degrees: '{heat} °C', // REVIEW
    degreesBand: '{heat} °C, {band}', // REVIEW
    unknown: 'hindi alam', // REVIEW
    averageAll: 'average ng {total} modelo: {range}', // REVIEW
    averagePart: 'average ng {used} sa {total} modelo: {range}', // REVIEW
    averageNone: 'average ng {total} modelo', // REVIEW
    mapLabel: 'Mapa ng Pilipinas, may kulay ang bawat lungsod at bayan ayon sa heat index nito. Ginagalaw ito ng mga arrow key, at nagzo-zoom ang plus at minus. Para pumili ng lugar nang walang pointer, gamitin ang search box o ang listahan ng pinakamataas na score.', // REVIEW
  },

  // Small words used by the formatting helpers.
  format: {
    never: 'hindi pa', // REVIEW: unsure about "hindi pa"
    lessThanOneKm: 'wala pang 1 km', // REVIEW
    uploaded: 'Na-upload {ago}', // REVIEW
    ago: {
      justNow: 'ngayon lang', // REVIEW
      second: '{n} segundo ang nakalipas', // REVIEW
      seconds: '{n} segundo ang nakalipas', // REVIEW
      minute: '{n} minuto ang nakalipas', // REVIEW
      minutes: '{n} minuto ang nakalipas', // REVIEW
      hour: '{n} oras ang nakalipas', // REVIEW
      hours: '{n} oras ang nakalipas', // REVIEW
      day: '{n} araw ang nakalipas', // REVIEW
      days: '{n} araw ang nakalipas', // REVIEW
    },
  },
};
