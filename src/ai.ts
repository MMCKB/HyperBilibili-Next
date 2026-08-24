import { fetch, storage } from "./tsimports"

export interface AISettings {
  provider: string;
  apiHost: string;
  apiPath: string;
  apiKey: string;
  model: string;
  extraHeaders: string;
  extraBody: string;
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
}

const AI_STORAGE_KEY = "toolbox_ai_text_settings";
const MAX_HISTORY_MESSAGES = 10;
const TEXT_ONLY_INSTRUCTION = "请只使用自然语言纯文本回答。不要使用 Markdown 标记、标题符号、列表符号、代码围栏、表格、LaTeX、链接格式、图片或工具调用说明。不要输出思考过程，只输出简洁的最终文字答案。";

export let AI_SETTINGS: AISettings = {
  provider: "",
  apiHost: "",
  apiPath: "/chat/completions",
  apiKey: "",
  model: "",
  extraHeaders: "",
  extraBody: ""
};

function createAiError(message: string): Error {
  return new Error(message || "ai-error");
}

function normalizeApiHost(value: string): string {
  let host = String(value || "").trim();
  if (host && !/^https?:\/\//i.test(host)) host = "https://" + host;
  return host.replace(/\/+$/, "");
}

function normalizeApiPath(value: string): string {
  const path = String(value || "").trim();
  if (!path) return "/chat/completions";
  if (/^https?:\/\//i.test(path)) return path.replace(/\/+$/, "");
  return (path.charAt(0) === "/" ? path : "/" + path).replace(/\/+$/, "");
}

function isSafeApiHost(value: string): boolean {
  return /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)?$/.test(value);
}

function chatUrl(settings: AISettings): string {
  const host = normalizeApiHost(settings.apiHost);
  const path = normalizeApiPath(settings.apiPath);
  if (!isSafeApiHost(host)) throw createAiError("invalid-api-address");
  if (/^https:\/\//i.test(path)) return path;
  if (/\/chat\/completions$/i.test(host) && /\/chat\/completions$/i.test(path)) return host;
  return host + path;
}

function parseJsonObject(value: string, field: string): any {
  const text = String(value || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("not-object");
    return parsed;
  } catch (error) {
    throw createAiError("invalid-" + field + "-json");
  }
}

function shortError(value: any): string {
  const text = String(value || "").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [hidden]").replace(/[\r\n]+/g, " ").trim();
  return text.slice(0, 140);
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

  const errorBody = body && body.error;
  const errorText = typeof errorBody === "string" ? errorBody : (errorBody && (errorBody.message || errorBody.code));
  if (httpCode && (httpCode < 200 || httpCode >= 300)) {
    throw createAiError("http-" + httpCode + (errorText ? ":" + shortError(errorText) : ""));
  }
  if (errorBody) throw createAiError(shortError(errorText || "provider-error"));
  return body;
}

function textFromValue(value: any, depth: number = 0): string {
  if (depth > 6 || value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item: any) => textFromValue(item, depth + 1)).join("");
  if (typeof value !== "object") return "";

  const type = String(value.type || "").toLowerCase();
  if (type === "reasoning" || type === "thinking" || type === "tool_call" || type === "function_call" || type === "image" || type === "image_url") return "";
  if (value.text !== undefined) return textFromValue(value.text, depth + 1);
  if (value.output_text !== undefined) return textFromValue(value.output_text, depth + 1);
  if (value.content !== undefined) return textFromValue(value.content, depth + 1);
  if (value.message !== undefined) return textFromValue(value.message, depth + 1);
  return "";
}

function plainText(value: string): string {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, (block: string) => block.replace(/```[a-zA-Z0-9_-]*\n?/g, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function responseText(body: any): string {
  const source = body && body.data && typeof body.data === "object" ? body.data : body;
  const choice = source && Array.isArray(source.choices) ? source.choices[0] : null;
  const message = choice && choice.message ? choice.message : null;
  const candidates = [
    message && message.content,
    choice && choice.text,
    choice && choice.delta && choice.delta.content,
    source && source.output_text,
    source && source.content,
    source && source.text,
    source && source.response,
    source && source.output
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    const text = plainText(textFromValue(candidates[index]));
    if (text) return text;
  }
  return "";
}

function responseDetail(body: any): string {
  const source = body && body.data && typeof body.data === "object" ? body.data : body;
  return shortError(source && (source.message || source.detail || source.msg || source.error));
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
              apiHost: normalizeApiHost(stored.apiHost || AI_SETTINGS.apiHost),
              apiPath: normalizeApiPath(stored.apiPath || AI_SETTINGS.apiPath)
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
    apiPath: normalizeApiPath(params.apiPath === undefined ? AI_SETTINGS.apiPath : params.apiPath),
    apiKey: String(params.apiKey === undefined ? AI_SETTINGS.apiKey : params.apiKey).trim(),
    model: String(params.model === undefined ? AI_SETTINGS.model : params.model).trim(),
    extraHeaders: String(params.extraHeaders === undefined ? AI_SETTINGS.extraHeaders : params.extraHeaders).trim(),
    extraBody: String(params.extraBody === undefined ? AI_SETTINGS.extraBody : params.extraBody).trim()
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
  if (!isAIReady(settings)) throw createAiError("missing-settings");
  const history = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && !message.failed && (message.role === "user" || message.role === "assistant") && String(message.content || "").trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({ role: message.role, content: String(message.content).trim() }));
  if (!history.length) throw createAiError("empty-message");

  const extraHeaders = parseJsonObject(settings.extraHeaders, "headers");
  const extraBody = parseJsonObject(settings.extraBody, "body");
  const requestHeaders: any = { ...extraHeaders };
  if (!requestHeaders.Authorization && !requestHeaders.authorization) requestHeaders.Authorization = "Bearer " + String(settings.apiKey).trim();
  requestHeaders["Content-Type"] = "application/json";
  requestHeaders.Accept = "application/json";

  const payload: any = {
    ...extraBody,
    model: String(settings.model).trim(),
    messages: [{ role: "system", content: TEXT_ONLY_INSTRUCTION }].concat(history),
    stream: false
  };

  let response: any;
  try {
    response = await fetch.fetch({
      url: chatUrl(settings),
      method: "POST",
      responseType: "json",
      header: requestHeaders,
      data: JSON.stringify(payload)
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
