// Types shared by the server and the web app.
//
// A `type` describes the shape of a piece of data. It exists only while
// coding and checking: it is removed when the code runs, so it costs nothing.
//
// `export` makes a type usable from other files.
//
// Dates travel between server and browser as text (JSON has no date type),
// so every time below is an ISO string such as "2026-11-15T10:45:00Z".

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
};

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

/** A province's current stress score. */
export type ProvinceScore = {
  psgc: number;
  /** Overall score, 0 (calm) to 100 (severe). */
  score: number;
  quakeScore: number;
  weatherScore: number;
  /** From disaster events with an alert level (GDACS). */
  eventScore: number;
  /** Short sentences explaining the score. `string[]` means "a list of strings". */
  reasons: string[];
  computedAt: string;
};

/** How fresh the data is. */
export type Freshness = {
  /** Last successful fetch of each feed; null if it has never succeeded. */
  earthquakesFetchedAt: string | null;
  weatherFetchedAt: string | null;
  /** True when either feed was last fetched more than 1 hour ago. */
  isStale: boolean;
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

/** A score worked out on demand for one exact spot. */
export type PointScore = {
  score: number;
  quakeScore: number;
  weatherScore: number;
  eventScore: number;
  reasons: string[];
  computedAt: string;
};

/** Everything the status card needs for a clicked spot. Returned by GET /api/point */
export type PointDetail = {
  lat: number;
  lon: number;
  /** The city or municipality the spot is in, if known. */
  place: Place | null;
  province: Province;
  /** The whole province's score, for comparison. null until the first score run. */
  provinceScore: number | null;
  score: PointScore;
  /** Earthquake distances here are measured from the spot itself. */
  events: HazardEvent[];
  freshness: Freshness;
  /** Phase 2: outlook, nearby events, storms and news. Not part of the score. */
  conditions: Conditions;
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
};

/** A link to an official bulletin page. */
export type BulletinLink = {
  id: string;
  agency: string;
  label: string;
  url: string;
};
