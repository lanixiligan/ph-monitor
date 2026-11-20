// Types shared by the server and the web app.
//
// A `type` describes the shape of a piece of data. It exists only while
// coding and checking: it is removed when the code runs, so it costs nothing.
//
// `export` makes a type usable from other files.
//
// Dates travel between server and browser as text (JSON has no date type),
// so every time below is an ISO string such as "2026-11-15T10:45:00Z".

import type { NewsType } from './newsTypes.ts';

/**
 * One province, or one Metro Manila district ('Dist').
 * 'Other' covers two areas that are neither: the City of Isabela and
 * BARMM's Special Geographic Area.
 */
export type Province = {
  /** PSGC = Philippine Standard Geographic Code, the official ID for a place. */
  psgc: number;
  name: string;
  regionPsgc: number;
  // This is a "union": the value must be exactly one of these three.
  geoLevel: 'Prov' | 'Dist' | 'Other';
};

/** An earthquake, as seen from one province. */
export type EarthquakeEvent = {
  kind: 'earthquake';
  /** USGS event id, e.g. "us7000ty9v". */
  id: string;
  magnitude: number;
  // `number | null` means "a number, or nothing if the feed didn't give one".
  depthKm: number | null;
  /** Human description from USGS, e.g. "7 km SE of Tagbina, Philippines". */
  place: string | null;
  occurredAt: string;
  /** Distance from the epicentre to this province's edge. 0 if it is inside. */
  distanceKm: number;
  url: string | null;
  // USGS's own impact estimates (shown on the card only, never in the score).
  // Each is null when USGS gave no value or the value failed the checks.
  /** PAGER alert: USGS's estimate of possible deaths and damage. */
  pagerAlert: PagerAlert | null;
  /** Highest estimated shaking intensity (Modified Mercalli, about 1 to 10). */
  mmi: number | null;
  /**
   * True when USGS shows a tsunami information link for this quake.
   * It does NOT mean a tsunami happened or is coming.
   */
  tsunamiInfo: boolean;
};

/** USGS PAGER alert levels, from least to most severe. */
export type PagerAlert = 'green' | 'yellow' | 'orange' | 'red';

/** The weather at a province's sample point. Modelled data, not a station reading. */
export type WeatherEvent = {
  kind: 'weather';
  /** The time this modelled value is valid for. */
  validAt: string;
  tempC: number | null;
  /** Relative humidity, 0 to 100. */
  humidityPct: number | null;
  /** "Feels like" temperature, computed from temperature and humidity. */
  heatIndexC: number | null;
  rain1hMm: number | null;
  rain24hMm: number | null;
};

/**
 * Any raw event shown on the status card.
 * Check `event.kind` to find out which one you have; TypeScript then knows
 * which fields exist (this pattern is called a "discriminated union").
 */
export type HazardEvent = EarthquakeEvent | WeatherEvent;

/** One of the three things the score is built from. */
export type SignalName = 'quake' | 'weather' | 'event';

/** A province's current stress score. */
export type ProvinceScore = {
  psgc: number;
  /** Overall score, 0 (calm) to 100 (severe). */
  score: number;
  quakeScore: number;
  weatherScore: number;
  /** From disaster events with an alert level (GDACS). */
  eventScore: number;
  /**
   * Signals we could not check (feed down or no recent reading). When this is
   * not empty the score is a lower limit: "at least N".
   */
  unknownSignals: SignalName[];
  /** Why the score is what it is. `ScoreReason[]` means "a list of ScoreReason". */
  reasons: ScoreReason[];
  computedAt: string;
};

/**
 * One reason behind a score, as a message key plus the numbers that go in it.
 * The server never writes the sentence: the web app does, in the reader's
 * language (see web/src/i18n). `key` says which of these shapes you have.
 */
export type ScoreReason =
  | {
      key: 'quake';
      /** What was scored: a whole province, or one exact spot. */
      target: 'province' | 'point';
      magnitude: number;
      /** Whole km. */
      distanceKm: number;
      /** True when under 1 km: inside the province, or right at the spot. */
      isVeryClose: boolean;
      /** Whole km; null when USGS gave no depth. */
      depthKm: number | null;
      /** Whole hours. */
      hoursAgo: number;
    }
  /** "N more smaller or older earthquakes nearby". */
  | { key: 'moreQuakes'; count: number }
  | {
      key: 'event';
      target: 'province' | 'point';
      alertLevel: AlertLevel;
      kind: DisasterKind;
      distanceKm: number;
      isVeryClose: boolean;
      hasEnded: boolean;
    }
  /** No weather reading recent enough to use. */
  | { key: 'noWeather'; target: 'province' | 'point' }
  /** The earthquake feed has not answered lately, so recent quakes may be missing. */
  | { key: 'noQuakeData' }
  /** The disaster event feed has not answered lately. */
  | { key: 'noEventData' }
  /** `level` is PAGASA's rainfall level: 'yellow', 'orange', 'red', or null below yellow. */
  | { key: 'rain'; rain1hMm: number; rain24hMm: number; level: string | null }
  /** `band` is PAGASA's heat band, e.g. 'danger'. */
  | { key: 'heat'; heatIndexC: number; band: string | null }
  /** Nothing significant right now. */
  | { key: 'calm' };

/** How fresh the data is. */
export type Freshness = {
  /** Last successful fetch of each feed; null if it has never succeeded. */
  earthquakesFetchedAt: string | null;
  weatherFetchedAt: string | null;
  /** True when either feed was last fetched more than 1 hour ago. */
  isStale: boolean;
};

/** The feeds shown in the "out of date" banner. */
export type FeedId =
  | 'earthquakes'
  | 'weather'
  | 'officialAlerts'
  | 'events'
  | 'naturalEvents'
  | 'storms'
  | 'outlook'
  | 'riverFlow'
  | 'news'
  | 'heatMap'
  | 'rainForecast';

/** How one feed is doing. */
export type FeedHealth = {
  id: FeedId;
  /** Last successful fetch; null if it has never succeeded. */
  lastOkAt: string | null;
  /** True when the last success is older than that feed's own limit. */
  isStale: boolean;
};

/** Returned by GET /api/status */
export type StatusReport = {
  checkedAt: string;
  feeds: FeedHealth[];
};

/**
 * What the map knows about each province shape.
 * These are the `properties` of every feature in GET /api/provinces (GeoJSON).
 * Scores are null until the first score run has finished.
 */
export type ProvinceMapProperties = {
  psgc: number;
  name: string;
  score: number | null;
  quake_score: number | null;
  weather_score: number | null;
  event_score: number | null;
  /** True when a signal could not be checked: the score is "at least" this much. */
  incomplete: boolean;
  /** The town whose score the province shows (its highest); null when it has no towns. */
  top_place: string | null;
  /**
   * Earthquake view (display only): the highest earthquake part among the
   * province's towns (the province's own when it has no town scores); null before the first score run.
   */
  quake_top_score: number | null;
  /** The town with that highest earthquake part; null when it has no town scores. */
  quake_top_place: string | null;
  /** True when earthquakes could not be checked ('quake' in the province's unknown signals). */
  quake_unknown: boolean;
  /**
   * Flood view (display only): the highest rain part among the province's
   * towns whose rain is known; null when no town's rain is known (or it has no
   * town scores): striped, never 0.
   */
  rain_top_score: number | null;
  /** The town with that highest rain part; null when rain_top_score is null. */
  rain_top_place: string | null;
  /** True when some town's rain is unknown: the province shows "at least" rain_top_score. */
  rain_unknown: boolean;
  /** A spot inside the province, where the map pins its headlines. */
  point_lat: number;
  point_lon: number;
};

/** Everything the status card needs. Returned by GET /api/provinces/:psgc */
export type ProvinceDetail = {
  province: Province;
  /** null until the first score run has finished. */
  score: ProvinceScore | null;
  events: HazardEvent[];
  freshness: Freshness;
  /** Phase 2: outlook, nearby events, storms and news. Not part of the score. */
  conditions: Conditions;
};

/** A city or municipality. */
export type Place = {
  psgc: number;
  name: string;
  /** 'City' or 'Mun' (municipality). */
  geoLevel: string;
};

/** What the map knows about each town shape. The `properties` of GET /api/places/shapes. */
export type PlaceShapeProperties = {
  psgc: number;
  name: string;
  province_name: string;
};

/** One town's latest score, for the map. */
export type PlaceScoreEntry = {
  psgc: number;
  score: number;
  /** True when a signal could not be checked: the score is "at least" this much. */
  incomplete: boolean;
  /** The earthquake part of the score (0–100), for the Earthquake view. Display only. */
  quakeScore: number;
  /** True when earthquakes could not be checked for this town ('quake' in its unknown signals). */
  quakeUnknown: boolean;
  /**
   * The rain part of the score (0–100), for the Flood view. Display only.
   * null = rain unknown (no usable weather reading, or a row saved before the
   * parts were stored): striped, never shown as calm.
   */
  rainScore: number | null;
};

/** Every town's latest score. Returned by GET /api/places/scores */
export type PlaceScores = {
  /** When the scores were worked out; null before the first score run. */
  computedAt: string | null;
  places: PlaceScoreEntry[];
};

/** A score with its parts: for one exact spot, or for a whole town. */
export type PointScore = {
  score: number;
  quakeScore: number;
  weatherScore: number;
  eventScore: number;
  /** The same formulas, one score per hazard. null = that reading is missing. */
  hazards: { quake: number; rain: number | null; heat: number | null; event: number };
  /** Signals we could not check; when not empty the score is "at least N". */
  unknownSignals: SignalName[];
  reasons: ScoreReason[];
  computedAt: string;
};

/** One answer of the place search. Returned (as a list) by GET /api/places?q=... */
export type PlaceMatch = {
  psgc: number;
  name: string;
  kind: 'province' | 'city' | 'municipality';
  /** The province a city or municipality is in; null for a province itself. */
  provinceName: string | null;
  /** A point inside the place: the spot that is opened when the reader picks it. */
  lat: number;
  lon: number;
};

/** Everything the status card needs for a clicked spot. Returned by GET /api/point */
export type PointDetail = {
  lat: number;
  lon: number;
  /** The city or municipality the spot is in, if known. */
  place: Place | null;
  province: Province;
  /**
   * The whole town's score, exactly as the map colours it: the card's main
   * number. null until the first score run, or with no town.
   */
  placeScore: PointScore | null;
  /** The whole province's score (its highest town), for comparison. null until the first score run. */
  provinceScore: number | null;
  /** The score for the exact spot (its own weather, distances from the spot). */
  score: PointScore;
  /** Earthquake distances here are measured from the spot itself. */
  events: HazardEvent[];
  freshness: Freshness;
  /** Phase 2: outlook, nearby events, storms and news. Not part of the score. */
  conditions: Conditions;
  /** Fixed hazard maps (Project NOAH) for this spot. Not part of the score. */
  hazardZones: HazardZones;
};

// ---------- Hazard maps (Project NOAH, ODbL) ----------

/** A hazard map class: 1 low, 2 medium, 3 high. */
export type HazardClass = 1 | 2 | 3;

/** Storm surge advisory (SSA) level: 1 up to 2 m, 2 up to 3 m, 3 up to 4 m, 4 more than 4 m. */
export type SurgeLevel = 1 | 2 | 3 | 4;

/** The two fixed hazard maps. */
export type HazardMapKind = 'landslide' | 'stormSurge';

/** One storm surge level at a spot. `hazardClass` null: that surge does not reach the spot. */
export type SurgeAtSpot = { level: SurgeLevel; hazardClass: HazardClass | null };

/**
 * What the fixed hazard maps say about one spot. A null map means no map is
 * loaded for the spot's province: unknown, never "safe".
 */
export type HazardZones = {
  /** `hazardClass` null: the spot is outside every landslide zone. */
  landslide: { hazardClass: HazardClass | null } | null;
  /** One entry per loaded surge level (1 to 4), in order. */
  stormSurge: SurgeAtSpot[] | null;
};

/**
 * One loaded hazard map layer, for the legend. Returned as a list by GET /api/hazards.
 * `surgeLevel` is null for landslide.
 */
export type HazardLayerInfo = {
  kind: HazardMapKind;
  surgeLevel: SurgeLevel | null;
  /** How many provinces have this map loaded. */
  provinces: number;
  /** When the newest province file was loaded (ISO time). */
  loadedAt: string;
};

// ---------- Phase 2 ----------

/** The group a news outlet or live stream belongs to. A label, not a ranking of trust. */
export type OutletCategory = 'official' | 'tv' | 'radio' | 'online' | 'regional' | 'international';

export type DisasterKind =
  | 'typhoon'
  | 'earthquake'
  | 'flood'
  | 'volcano'
  | 'wildfire'
  | 'drought'
  | 'other';

export type AlertLevel = 'green' | 'orange' | 'red';

/** One disaster event from GDACS or NASA EONET. */
export type DisasterEvent = {
  /** Source plus its own id, e.g. "gdacs:TC:1001234". */
  id: string;
  source: 'gdacs' | 'eonet';
  kind: DisasterKind;
  /** null when the source gives no alert level (EONET never does). */
  alertLevel: AlertLevel | null;
  title: string;
  startedAt: string;
  /** null while the event is still going. */
  endedAt: string | null;
  url: string | null;
  /** A point that stands for the event on the map. */
  lat: number;
  lon: number;
  /** Only on the status card: how far the event is from the spot or province. */
  distanceKm?: number; // `?` means the field may be left out
};

/** One position of a storm, past or forecast. */
export type StormTrackPoint = {
  validAt: string;
  /** false = where the storm was; true = where it is forecast to be. */
  isForecast: boolean;
  lat: number;
  lon: number;
  pressureHpa: number | null;
  /** Strongest steady wind, in knots. */
  windKt: number | null;
  /** Forecast only: radius of the circle the centre will probably be inside. */
  radiusKm: number | null;
};

/** A tropical storm and its track. */
export type Storm = {
  id: string;
  source: 'jma' | 'jtwc' | 'sample';
  name: string;
  /** The source's own class, e.g. "TY" (typhoon). */
  category: string | null;
  isActive: boolean;
  url: string | null;
  updatedAt: string;
  /** Oldest first. Empty when the source gave warnings but no positions. */
  track: StormTrackPoint[];
};

/** One day of the "next 7 days" outlook for a province. Modelled data. */
export type ForecastDay = {
  /** Calendar day in Philippine time, e.g. "2026-11-17". */
  day: string;
  rainMm: number | null;
  gustKmh: number | null;
  riverDischargeM3s: number | null;
};

/** One outlet's copy of a story. */
export type NewsOutletLink = {
  outlet: string;
  category: OutletCategory;
  url: string;
};

/** One disaster headline. No article text is ever stored or shown. */
export type NewsItem = {
  id: number;
  title: string;
  url: string;
  outlet: string;
  category: OutletCategory;
  publishedAt: string;
  /** Provinces named in the headline. */
  provincePsgcs: number[];
  /** Kinds of disaster the headline is about; empty = general (only a response, such as an evacuation). */
  types: NewsType[];
  /** The same story at other outlets. */
  otherOutlets: NewsOutletLink[];
};

/** What the link checker found for one feed or stream link. */
export type SourceStatus = 'ok' | 'dead' | 'not-live' | 'not-embeddable';

/** A live stream the page may show. Dead and not-embeddable ones are never sent. */
export type StreamSlot = {
  id: string;
  outlet: string;
  category: OutletCategory;
  /** The YouTube video to embed: the live stream, or else the channel's latest video. */
  videoId: string;
  /** The video's title and upload time, when known. */
  title: string | null;
  publishedAt: string | null;
  /**
   * true = the checker saw it live ("LIVE"); false = not live ("Latest");
   * null = unknown (no YouTube key set, or the last check failed), shown as
   * "Latest" with "may be offline".
   */
  isLive: boolean | null;
  lastCheckedAt: string;
};

/** A storm whose forecast track passes near a province or spot. */
export type StormComing = {
  stormId: string;
  name: string;
  /** When the forecast track is closest. */
  closestAt: string;
  /** Distance from the forecast centre at that time. The centre itself is uncertain. */
  distanceKm: number;
};

/** What is happening around one province or spot, beyond the score. */
export type Conditions = {
  /** Next 7 days at the province's sample point, oldest first. */
  outlook: ForecastDay[];
  /** Current disaster events within a few hundred km, nearest first. */
  nearbyEvents: DisasterEvent[];
  stormsComing: StormComing[];
  /** Recent headlines that name the province. */
  news: NewsItem[];
  /** Official alerts in effect for the province (or the whole country), newest first. */
  officialAlerts: OfficialAlert[];
};

/**
 * One official alert, in the agency's own words. Never part of the score:
 * it is shown above it.
 */
export type OfficialAlert = {
  id: string;
  /** 'PAGASA' for now. */
  agency: string;
  /** What kind of alert, e.g. "General Flood Advisory (Moderate)". */
  event: string;
  headline: string;
  /** CAP scale: 'Extreme', 'Severe', 'Moderate', 'Minor' or 'Unknown'. */
  severity: string;
  description: string;
  instruction: string | null;
  /** The agency's page about this kind of alert. */
  web: string | null;
  /** The alert file itself. */
  url: string;
  sentAt: string;
  expiresAt: string;
  /** The areas as the agency names them. */
  areaNames: string[];
  provincePsgcs: number[];
  /** True when the alert covers the whole country (no single province named). */
  isNationwide: boolean;
};

/** A link to an official bulletin page. */
export type BulletinLink = {
  id: string;
  agency: string;
  label: string;
  url: string;
};

// --- Heat map (display only; it never changes the score) ---

/** The weather models the heat map can show (Open-Meteo names). */
export type HeatModelId = 'ecmwf_ifs' | 'dwd_icon_global_native' | 'ncep_gfs_global';

/** PAGASA's heat index bands (27 °C and up). */
export type HeatBandName = 'caution' | 'extreme caution' | 'danger' | 'extreme danger';

/** What the heat map can show: one model, or the average of all of them. */
export type HeatViewId = HeatModelId | 'average';

/** Average view only: how many models had a value, and the lowest and highest of them. */
export type HeatSpread = { used: number; lowC: number; highC: number };

/**
 * One town's or province's heat index for the hour shown. null = unknown.
 * `spread?` (the `?` means it may be left out) is only there in the average
 * view, for a known value.
 */
export type HeatValue = { psgc: number; heatIndexC: number | null; band: HeatBandName | null; spread?: HeatSpread };

/** Returned by GET /api/heatmap?model= */
export type HeatMapData = {
  model: HeatViewId;
  /** The newest good run for this model (the average: the oldest of its sources' runs); null = none yet. */
  fetchedAt: string | null;
  isStale: boolean;
  /** The hour shown (the current hour, ISO); null when nothing is stored for it. */
  validAt: string | null;
  places: HeatValue[];
  provinces: HeatValue[];
};

// --- View switch and its views (display only; they never change the score) ---

/** The views of the top bar's view switch (see shared/src/mapViews.ts). */
export type MapViewId = 'overall' | 'typhoon' | 'flood' | 'earthquake' | 'heat' | 'stormSurge' | 'tsunami';

/** The map layers a view can tick (the legend's tick boxes; MapLayers in web/src/mapSettings.ts). */
export type MapLayerName =
  | 'scores'
  | 'events'
  | 'storms'
  | 'news'
  | 'landslide'
  | 'stormSurge'
  | 'quakes'
  | 'rainForecast';

/** One earthquake for the map's quake markers. */
export type QuakePoint = {
  /** USGS event id. */
  id: string;
  magnitude: number;
  depthKm: number | null;
  /** Human description from USGS, e.g. "7 km SE of Tagbina, Philippines". */
  place: string | null;
  occurredAt: string;
  /** The USGS event page. */
  url: string | null;
  /** The epicentre. */
  lat: number;
  lon: number;
};

/** Returned by GET /api/quakes: the quakes inside the score's time window, newest first. */
export type QuakeMap = {
  /** The score's quake window (WEIGHTS.quake.windowHours). */
  windowHours: number;
  /** Last successful USGS fetch; null if it has never succeeded. */
  fetchedAt: string | null;
  /** True when the USGS feed is past its limit: recent quakes may be missing. */
  isStale: boolean;
  quakes: QuakePoint[];
};

// --- Rain forecast field (Typhoon view; display only, never part of the score) ---

/** The forecast grid: evenly spaced points, `step` degrees apart. */
export type RainGrid = {
  /** The south-west point (degrees). */
  west: number;
  south: number;
  step: number;
  cols: number;
  rows: number;
};

/** One time step: the rain in the `stepHours` hours that end at `endsAt`. */
export type RainFrame = {
  endsAt: string;
  /**
   * Millimetres per grid point, row by row from the south (index = row × cols + col).
   * null = no forecast for that point and period: drawn as "no data", never as dry.
   */
  mm: (number | null)[];
};

/** Returned by GET /api/rainforecast: the next 7 days of rain, 3 hours at a time. */
export type RainForecastMap = {
  /** The Open-Meteo model, e.g. 'ecmwf_ifs'. */
  model: string;
  /** Hours in each frame (3). */
  stepHours: number;
  grid: RainGrid;
  /** When the forecast was fetched; null before the first good run. */
  fetchedAt: string | null;
  /** True when the last good run is older than its limit (freshness.ts). */
  isStale: boolean;
  /** From the period that holds "now" onwards. Empty before the first good run. */
  frames: RainFrame[];
};
