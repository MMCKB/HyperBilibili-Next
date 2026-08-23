import { fetch, storage } from "./tsimports"

export interface WeatherSettings {
  apiHost: string;
  apiKey: string;
  locationName: string;
  locationId: string;
  latitude: string;
  longitude: string;
  timezone: string;
  country: string;
  adm1: string;
  adm2: string;
}

const WEATHER_STORAGE_KEY = "qweather_settings";

export let WEATHER_SETTINGS: WeatherSettings = {
  apiHost: "",
  apiKey: "",
  locationName: "",
  locationId: "",
  latitude: "",
  longitude: "",
  timezone: "",
  country: "",
  adm1: "",
  adm2: ""
};

function normalizeHost(host: string): string {
  return String(host || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
}

function isSafeHost(host: string): boolean {
  return /^[a-zA-Z0-9.-]+$/.test(host) && host.indexOf(".") > 0;
}

function buildUrl(host: string, path: string): string {
  const normalizedHost = normalizeHost(host);
  if (!isSafeHost(normalizedHost)) {
    throw new Error("invalid-host");
  }
  return "https://" + normalizedHost + path;
}

export function loadWeatherSettings(): Promise<WeatherSettings> {
  return new Promise((resolve) => {
    storage.get({
      key: WEATHER_STORAGE_KEY,
      success: (data: any) => {
        if (data) {
          try {
            const stored = JSON.parse(data);
            WEATHER_SETTINGS = {
              ...WEATHER_SETTINGS,
              ...stored,
              apiHost: normalizeHost(stored.apiHost || WEATHER_SETTINGS.apiHost)
            };
          } catch (error) {
            global.logger.log("Failed to parse weather settings");
          }
        }
        resolve(WEATHER_SETTINGS);
      },
      fail: () => resolve(WEATHER_SETTINGS)
    });
  });
}

export function saveWeatherSettings(params: Partial<WeatherSettings>): Promise<WeatherSettings> {
  WEATHER_SETTINGS = {
    ...WEATHER_SETTINGS,
    ...params,
    apiHost: normalizeHost(params.apiHost === undefined ? WEATHER_SETTINGS.apiHost : params.apiHost)
  };

  return new Promise((resolve) => {
    storage.set({
      key: WEATHER_STORAGE_KEY,
      value: JSON.stringify(WEATHER_SETTINGS),
      success: () => resolve(WEATHER_SETTINGS),
      fail: () => resolve(WEATHER_SETTINGS)
    });
  });
}

export function hasWeatherApiCredentials(settings: WeatherSettings = WEATHER_SETTINGS): boolean {
  return !!(normalizeHost(settings.apiHost) && String(settings.apiKey || "").trim());
}

export function hasWeatherLocationId(settings: WeatherSettings = WEATHER_SETTINGS): boolean {
  return !!String(settings.locationId || "").trim();
}

export function hasWeatherLocation(settings: WeatherSettings = WEATHER_SETTINGS): boolean {
  return !!(hasWeatherLocationId(settings) && settings.latitude && settings.longitude);
}

export function isWeatherReady(settings: WeatherSettings = WEATHER_SETTINGS): boolean {
  return hasWeatherApiCredentials(settings) && hasWeatherLocation(settings);
}

async function requestJson(host: string, apiKey: string, path: string): Promise<any> {
  const response = await fetch.fetch({
    url: buildUrl(host, path),
    responseType: "json",
    header: {
      "X-QW-Api-Key": String(apiKey || "").trim(),
      "Accept": "application/json"
    }
  });
  return response && response.data ? response.data : response;
}

function queryString(params: Record<string, string>): string {
  const values = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
  return values.length ? "?" + values.join("&") : "";
}

export async function resolveWeatherLocationId(settings: WeatherSettings = WEATHER_SETTINGS): Promise<any> {
  if (!hasWeatherApiCredentials(settings) || !hasWeatherLocationId(settings)) {
    throw new Error("missing-location-id");
  }

  const result = await requestJson(
    settings.apiHost,
    settings.apiKey,
    "/geo/v2/city/lookup" + queryString({ location: String(settings.locationId).trim(), number: "1", lang: "zh" })
  );
  const location = result && Array.isArray(result.location) && result.location.length ? result.location[0] : null;
  if (!location || !location.lat || !location.lon) {
    throw new Error("invalid-location-id");
  }
  return location;
}

export async function testWeatherSettings(settings: WeatherSettings = WEATHER_SETTINGS): Promise<any> {
  const location = await resolveWeatherLocationId(settings);
  const current = await requestJson(
    settings.apiHost,
    settings.apiKey,
    "/weather/v1/current/" + encodeURIComponent(location.lat) + "/" + encodeURIComponent(location.lon) + queryString({ localTime: "true", lang: "zh" })
  );
  return { location, current };
}

async function safeRequest(task: () => Promise<any>): Promise<any> {
  try {
    return await task();
  } catch (error) {
    global.logger.log("Weather request failed", error);
    return null;
  }
}

export async function loadWeatherBundle(settings: WeatherSettings = WEATHER_SETTINGS): Promise<any> {
  if (!isWeatherReady(settings)) throw new Error("missing-settings");

  const latitude = encodeURIComponent(settings.latitude);
  const longitude = encodeURIComponent(settings.longitude);
  const localized = queryString({ localTime: "true", lang: "zh" });
  const coordinate = encodeURIComponent(settings.longitude + "," + settings.latitude);

  const requests = await Promise.all([
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/weather/v1/current/" + latitude + "/" + longitude + localized)),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/weather/v1/hourly/" + latitude + "/" + longitude + queryString({ hours: "4", localTime: "true", lang: "zh" }))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/weather/v1/daily/" + latitude + "/" + longitude + queryString({ days: "3", localTime: "true", lang: "zh" }))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/airquality/v1/current/" + latitude + "/" + longitude + queryString({ lang: "zh" }))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/weatheralert/v1/current/" + latitude + "/" + longitude + localized)),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/indices/1d" + queryString({ type: "1,3,5,9", location: settings.locationId || settings.longitude + "," + settings.latitude, lang: "zh" }))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/minutely/5m?location=" + coordinate + "&lang=zh"))
  ]);

  return {
    current: requests[0],
    hourly: requests[1],
    daily: requests[2],
    air: requests[3],
    alerts: requests[4],
    indices: requests[5],
    minutely: requests[6]
  };
}

export function weatherConditionSymbol(code: string): string {
  const number = Number(code);
  if (number === 100 || number === 150) return "☀";
  if ((number >= 101 && number <= 103) || (number >= 151 && number <= 153)) return "⛅";
  if (number === 104) return "☁";
  if ((number >= 300 && number <= 399) || (number >= 450 && number <= 499)) return "☂";
  if (number >= 400 && number <= 499) return "❄";
  if (number >= 500 && number <= 599) return "≋";
  return "●";
}

export function formatForecastTime(time: string): string {
  if (!time) return "--";
  const match = String(time).match(/T(\d{2}:\d{2})/);
  return match ? match[1] : String(time).slice(-5);
}

export function formatShortDate(time: string): string {
  if (!time) return "--";
  const match = String(time).match(/(\d{2})-(\d{2})(?:T|$)/);
  return match ? match[1] + "/" + match[2] : String(time).slice(5, 10);
}
