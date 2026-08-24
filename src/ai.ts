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
  failed?: boolean;
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

function chatCompletionsUrl(value: string): string {
  const host = normalizeApiHost(value);
  return /\/chat\/completions$/i.test(host) ? host : host + "/chat/completions";
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
    const errorBody = body && body.error;
    const detail = typeof errorBody === "string" ? errorBody : (errorBody && (errorBody.message || errorBody.code));
    throw createAiError("http-" + httpCode + (detail ? ":" + detail : ""));
  }
  if (body && body.error) {
    const errorBody = body.error;
    throw createAiError(typeof errorBody === "string" ? errorBody : String(errorBody.message || errorBody.code || "provider-error"));
  }
  return body;
}

function normalizeContent(value: any): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) {
    return value.map((item: any) => normalizeContent(item && (item.text || item.content || item.value))).join("").trim();
  }
  if (value && typeof value === "object") {
    return normalizeContent(value.text || value.content || value.value || value.output_text);
  }
  return "";
}

function responseText(body: any): string {
  const source = body && body.data && typeof body.data === "object" ? body.data : body;
  const choice = source && Array.isArray(source.choices) ? source.choices[0] : null;
  const message = choice && choice.message ? choice.message : null;
  const candidates = [
    message && message.content,
    message && message.reasoning_content,
    choice && choice.text,
    choice && choice.delta && choice.delta.content,
    source && source.output_text,
    source && source.content,
    source && source.text,
    source && source.response
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    const text = normalizeContent(candidates[index]);
    if (text) return text;
  }
  return "";
}

function responseDetail(body: any): string {
  const source = body && body.data && typeof body.data === "object" ? body.data : body;
  return normalizeContent(source && (source.message || source.detail || source.msg || source.error));
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
    .filter((message) => message && !message.failed && (message.role === "user" || message.role === "assistant") && String(message.content || "").trim())
    .slice(-10)
    .map((message) => ({ role: message.role, content: String(message.content).trim() }));

  if (!history.length) throw createAiError("empty-message");

  let response: any;
  try {
    response = await fetch.fetch({
      url: chatCompletionsUrl(apiHost),
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
        max_tokens: 1024,
        stream: false
      })
    });
  } catch (error) {
    const code = error && error.code ? error.code : "network";
    throw createAiError("fetch-" + code);
  }

  const body = unwrapFetchResponse(response);
  const text = responseText(body);
  if (!text) {
    const detail = responseDetail(body);
    throw createAiError(detail ? "empty-response:" + detail : "empty-response");
  }
  return text;
}
