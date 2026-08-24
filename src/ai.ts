import { fetch, storage } from "./tsimports"

export interface AISettings {
  provider: string;
  apiHost: string;
  apiKey: string;
  model: string;
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

const AI_STORAGE_KEY = "toolbox_ai_settings";

export let AI_SETTINGS: AISettings = {
  provider: "",
  apiHost: "",
  apiKey: "",
  model: ""
};

function normalizeApiHost(value: string): string {
  let host = String(value || "").trim();
  if (host && !/^https?:\/\//i.test(host)) host = "https://" + host;
  return host.replace(/\/+$/, "");
}

function isSafeApiHost(value: string): boolean {
  return /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)?$/.test(value);
}

function createAiError(message: string): Error {
  return new Error(message || "ai-error");
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
      throw createAiError(httpCode ? "http-" + httpCode : "invalid-response");
    }
  }
  if (httpCode && (httpCode < 200 || httpCode >= 300)) {
    const detail = body && body.error && body.error.message ? ":" + body.error.message : "";
    throw createAiError("http-" + httpCode + detail);
  }
  if (body && body.error) {
    throw createAiError(String(body.error.message || body.error.code || "provider-error"));
  }
  return body;
}

function responseText(body: any): string {
  const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : "";
  if (Array.isArray(content)) {
    return content.map((item: any) => String(item && (item.text || item.content) ? (item.text || item.content) : "")).join("");
  }
  return String(content || "").trim();
}

export function loadAISettings(): Promise<AISettings> {
  return new Promise((resolve) => {
    storage.get({
      key: AI_STORAGE_KEY,
      success: (data: any) => {
        if (data) {
          try {
            const stored = JSON.parse(data);
            AI_SETTINGS = {
              ...AI_SETTINGS,
              ...stored,
              apiHost: normalizeApiHost(stored.apiHost || AI_SETTINGS.apiHost)
            };
          } catch (error) {
            global.logger.log("Failed to parse AI settings");
          }
        }
        resolve(AI_SETTINGS);
      },
      fail: () => resolve(AI_SETTINGS)
    });
  });
}

export function saveAISettings(params: Partial<AISettings>): Promise<AISettings> {
  AI_SETTINGS = {
    ...AI_SETTINGS,
    ...params,
    provider: String(params.provider === undefined ? AI_SETTINGS.provider : params.provider).trim(),
    apiHost: normalizeApiHost(params.apiHost === undefined ? AI_SETTINGS.apiHost : params.apiHost),
    apiKey: String(params.apiKey === undefined ? AI_SETTINGS.apiKey : params.apiKey).trim(),
    model: String(params.model === undefined ? AI_SETTINGS.model : params.model).trim()
  };
  return new Promise((resolve) => {
    storage.set({
      key: AI_STORAGE_KEY,
      value: JSON.stringify(AI_SETTINGS),
      success: () => resolve(AI_SETTINGS),
      fail: () => resolve(AI_SETTINGS)
    });
  });
}

export function isAIReady(settings: AISettings = AI_SETTINGS): boolean {
  return isSafeApiHost(normalizeApiHost(settings.apiHost)) && !!String(settings.apiKey || "").trim() && !!String(settings.model || "").trim();
}

export async function sendAIChat(messages: AIChatMessage[], settings: AISettings = AI_SETTINGS): Promise<string> {
  const apiHost = normalizeApiHost(settings.apiHost);
  if (!isAIReady({ ...settings, apiHost })) throw createAiError("missing-settings");

  const history = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && String(message.content || "").trim())
    .slice(-10)
    .map((message) => ({ role: message.role, content: String(message.content).trim() }));

  if (!history.length) throw createAiError("empty-message");

  let response: any;
  try {
    response = await fetch.fetch({
      url: apiHost + "/chat/completions",
      method: "POST",
      responseType: "json",
      header: {
        "Authorization": "Bearer " + String(settings.apiKey).trim(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      data: JSON.stringify({
        model: String(settings.model).trim(),
        messages: history,
        stream: false
      })
    });
  } catch (error) {
    const code = error && error.code ? error.code : "network";
    throw createAiError("fetch-" + code);
  }

  const text = responseText(unwrapFetchResponse(response));
  if (!text) throw createAiError("empty-response");
  return text;
}
