// Heat index: how hot it feels once humidity is taken into account.
//
// This is the US National Weather Service method (the "Rothfusz regression"),
// which PAGASA also uses for its heat index. The formula is defined in
// Fahrenheit, so we convert in and out.
// Reference: https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml

/**
 * @param tempC air temperature in °C
 * @param humidityPct relative humidity, 0 to 100
 * @returns heat index in °C, rounded to one decimal
 */
export function heatIndexC(tempC: number, humidityPct: number): number {
  const t = (tempC * 9) / 5 + 32; // to Fahrenheit
  const rh = humidityPct;

  // Step 1: a simple formula that is good enough in mild conditions.
  const simple = 0.5 * (t + 61.0 + (t - 68.0) * 1.2 + rh * 0.094);
  let hi = (simple + t) / 2;

  // Step 2: when it is hot (80 °F or more), use the full formula instead.
  if (hi >= 80) {
    hi =
      -42.379 +
      2.04901523 * t +
      10.14333127 * rh -
      0.22475541 * t * rh -
      0.00683783 * t * t -
      0.05481717 * rh * rh +
      0.00122874 * t * t * rh +
      0.00085282 * t * rh * rh -
      0.00000199 * t * t * rh * rh;

    // Two small corrections from the NWS for very dry and very humid air.
    if (rh < 13 && t >= 80 && t <= 112) {
      hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
    } else if (rh > 85 && t >= 80 && t <= 87) {
      hi += ((rh - 85) / 10) * ((87 - t) / 5);
    }
  }

  const celsius = ((hi - 32) * 5) / 9;
  return Math.round(celsius * 10) / 10;
}
