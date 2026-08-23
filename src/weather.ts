import { fetch, storage } from "./tsimports"

export interface WeatherCity {
  locationId: string;
  locationName: string;
}

export interface WeatherSettings {
  apiHost: string;
  apiKey: string;
  locationName: string;
  locationId: string;
  savedCities: WeatherCity[];
  latitude: string;
  longitude: string;
  timezone: string;
  country: string;
  adm1: string;
  adm2: string;
}

const WEATHER_STORAGE_KEY = "qweather_settings";
export const MAX_WEATHER_CITIES = 5;

export let WEATHER_SETTINGS: WeatherSettings = {
  apiHost: "",
  apiKey: "",
  locationName: "",
  locationId: "",
  savedCities: [],
  latitude: "",
  longitude: "",
  timezone: "",
  country: "",
  adm1: "",
  adm2: ""
};

function normalizeCities(cities: any, activeLocationId: string, activeLocationName: string): WeatherCity[] {
  const values = Array.isArray(cities) ? cities : [];
  const unique: WeatherCity[] = [];
  values.forEach((city: any) => {
    const locationId = String(city && city.locationId ? city.locationId : "").trim();
    if (!locationId || unique.some((item) => item.locationId === locationId)) return;
    unique.push({ locationId, locationName: String(city && city.locationName ? city.locationName : "").trim() });
  });
  const activeId = String(activeLocationId || "").trim();
  if (activeId && !unique.some((item) => item.locationId === activeId)) {
    unique.unshift({ locationId: activeId, locationName: String(activeLocationName || "").trim() });
  }
  return unique.slice(0, MAX_WEATHER_CITIES);
}

export function getSavedWeatherCities(settings: WeatherSettings = WEATHER_SETTINGS): WeatherCity[] {
  return normalizeCities(settings.savedCities, settings.locationId, settings.locationName);
}

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

function queryString(params: Record<string, string>): string {
  const values = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
  return values.length ? "?" + values.join("&") : "";
}

function createApiError(message: string): Error {
  return new Error(message || "api-error");
}

function unwrapFetchResponse(response: any): any {
  let transport = response;
  if (transport && transport.data && typeof transport.data === "object" &&
    (typeof transport.data.code === "number" || transport.data.headers || transport.data.data !== undefined)) {
    transport = transport.data;
  }

  const httpCode = transport && typeof transport.code === "number" ? transport.code : 0;
  let body = transport && transport.data !== undefined ? transport.data : transport;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      throw createApiError(httpCode ? "http-" + httpCode : "invalid-response");
    }
  }
  if (httpCode && (httpCode < 200 || httpCode >= 300)) {
    throw createApiError("http-" + httpCode);
  }
  if (body && body.code && String(body.code) !== "200") {
    throw createApiError("qweather-" + body.code);
  }
  return body;
}

export function loadWeatherSettings(): Promise<WeatherSettings> {
  return new Promise((resolve) => {
    storage.get({
      key: WEATHER_STORAGE_KEY,
      success: (data: any) => {
        if (data) {
          try {
            const stored = JSON.parse(data);
            const nextSettings = {
              ...WEATHER_SETTINGS,
              ...stored,
              apiHost: normalizeHost(stored.apiHost || WEATHER_SETTINGS.apiHost)
            };
            WEATHER_SETTINGS = {
              ...nextSettings,
              savedCities: normalizeCities(nextSettings.savedCities, nextSettings.locationId, nextSettings.locationName)
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
  const nextSettings = {
    ...WEATHER_SETTINGS,
    ...params,
    apiHost: normalizeHost(params.apiHost === undefined ? WEATHER_SETTINGS.apiHost : params.apiHost)
  };
  WEATHER_SETTINGS = {
    ...nextSettings,
    savedCities: normalizeCities(nextSettings.savedCities, nextSettings.locationId, nextSettings.locationName)
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

export async function addWeatherCity(locationId: string): Promise<WeatherSettings> {
  const id = String(locationId || "").trim();
  if (!id) throw createApiError("missing-location");
  const cities = getSavedWeatherCities();
  const existing = cities.find((city) => city.locationId === id);
  if (!existing && cities.length >= MAX_WEATHER_CITIES) throw createApiError("city-limit");
  const nextCities = existing ? cities : cities.concat([{ locationId: id, locationName: "" }]);
  return saveWeatherSettings({ locationId: id, locationName: existing ? existing.locationName : "", savedCities: nextCities });
}

export async function selectWeatherCity(locationId: string): Promise<WeatherSettings> {
  const id = String(locationId || "").trim();
  const city = getSavedWeatherCities().find((item) => item.locationId === id);
  if (!city) throw createApiError("unknown-city");
  return saveWeatherSettings({ locationId: city.locationId, locationName: city.locationName });
}

export async function updateWeatherCityName(locationId: string, locationName: string): Promise<WeatherSettings> {
  const id = String(locationId || "").trim();
  const name = String(locationName || "").trim();
  const cities = getSavedWeatherCities().map((city) => city.locationId === id ? { ...city, locationName: name } : city);
  return saveWeatherSettings({ savedCities: cities, locationName: WEATHER_SETTINGS.locationId === id ? name : WEATHER_SETTINGS.locationName });
}

export function hasWeatherApiCredentials(settings: WeatherSettings = WEATHER_SETTINGS): boolean {
  return !!(normalizeHost(settings.apiHost) && String(settings.apiKey || "").trim());
}

export function hasWeatherLocationId(settings: WeatherSettings = WEATHER_SETTINGS): boolean {
  return !!String(settings.locationId || "").trim();
}

export function isWeatherReady(settings: WeatherSettings = WEATHER_SETTINGS): boolean {
  return hasWeatherApiCredentials(settings) && hasWeatherLocationId(settings);
}

async function requestJson(host: string, apiKey: string, path: string): Promise<any> {
  let response: any;
  try {
    response = await fetch.fetch({
      url: buildUrl(host, path),
      responseType: "json",
      header: {
        "X-QW-Api-Key": String(apiKey || "").trim(),
        "Accept": "application/json",
        "Accept-Encoding": "gzip"
      }
    });
  } catch (error) {
    const code = error && error.code ? error.code : "network";
    throw createApiError("fetch-" + code);
  }
  return unwrapFetchResponse(response);
}

export async function testWeatherSettings(settings: WeatherSettings = WEATHER_SETTINGS): Promise<any> {
  if (!hasWeatherApiCredentials(settings) || !hasWeatherLocationId(settings)) {
    throw createApiError("missing-settings");
  }
  return requestJson(
    settings.apiHost,
    settings.apiKey,
    "/v7/weather/now" + queryString({ location: String(settings.locationId).trim(), lang: "zh" })
  );
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
  if (!isWeatherReady(settings)) throw createApiError("missing-settings");
  const location = String(settings.locationId).trim();
  const common = { location, lang: "zh" };
  const requests = await Promise.all([
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/weather/now" + queryString(common))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/weather/24h" + queryString(common))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/weather/7d" + queryString(common))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/air/now" + queryString(common))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/warning/now" + queryString(common))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/indices/1d" + queryString({ type: "1,2,3,5", location, lang: "zh" }))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/v7/minutely/5m" + queryString(common))),
    safeRequest(() => requestJson(settings.apiHost, settings.apiKey, "/geo/v2/city/lookup" + queryString({ location, number: "1", lang: "zh" })))
  ]);
  if (!requests[0] || !requests[0].now) throw createApiError("weather-unavailable");
  return {
    current: requests[0],
    hourly: requests[1],
    daily: requests[2],
    air: requests[3],
    alerts: requests[4],
    indices: requests[5],
    minutely: requests[6],
    location: requests[7]
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

export function weatherConditionAsset(code: string): string {
  const number = Number(code);
  if (number === 100 || number === 150) return "/common/images/weather_sunny.png";
  if ((number >= 101 && number <= 103) || (number >= 151 && number <= 153)) return "/common/images/weather_partly.png";
  if (number === 104) return "/common/images/weather_cloudy.png";
  if (number >= 200 && number <= 213) return "/common/images/weather_wind.png";
  if (number >= 300 && number <= 399) return "/common/images/weather_rain.png";
  if (number >= 400 && number <= 499) return "/common/images/weather_snow.png";
  if (number >= 500 && number <= 515) return "/common/images/weather_fog.png";
  if (number >= 516 && number <= 599) return "/common/images/weather_hail.png";
  return "/common/images/weather_cloudy.png";
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
