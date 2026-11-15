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
  /** "Feels like" temperature. */
  apparentTempC: number | null;
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

/** Everything the status card needs. Returned by GET /api/provinces/:psgc */
export type ProvinceDetail = {
  province: Province;
  score: ProvinceScore;
  events: HazardEvent[];
  freshness: Freshness;
};
