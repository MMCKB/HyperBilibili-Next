import { fetch, storage } from "./tsimports"

export const MAX_AI_PROVIDERS = 3;
export const MAX_AI_MODELS_PER_PROVIDER = 5;

export interface AIProviderProfile {
  name: string;
  apiHost: string;
  apiPath: string;
  apiKey: string;
  models: string[];
  activeModelIndex: number;
  extraHeaders: string;
  extraBody: string;
}

export interface AISettings {
  provider: string;
  apiHost: string;
  apiPath: string;
  apiKey: string;
  model: string;
  extraHeaders: string;
  extraBody: string;
  providers: AIProviderProfile[];
  activeProviderIndex: number;
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
  extraBody: "",
  providers: [],
  activeProviderIndex: 0
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

function createBlankProvider(): AIProviderProfile {
  return {
    name: "",
    apiHost: "",
    apiPath: "/chat/completions",
    apiKey: "",
    models: [],
    activeModelIndex: 0,
    extraHeaders: "",
    extraBody: ""
  };
}

function normalizeModels(values: any, legacyModel: any = ""): string[] {
  const source = Array.isArray(values) ? values.slice() : [];
  if (legacyModel) source.push(legacyModel);
  const models: string[] = [];
  source.forEach((value: any) => {
    const model = String(value || "").trim();
    if (model && models.indexOf(model) === -1 && models.length < MAX_AI_MODELS_PER_PROVIDER) models.push(model);
  });
  return models;
}

function normalizeProvider(value: any): AIProviderProfile {
  const source = value || {};
  const models = normalizeModels(source.models, source.model);
  let activeModelIndex = Number(source.activeModelIndex);
  if (!isFinite(activeModelIndex) || activeModelIndex < 0 || activeModelIndex >= models.length) activeModelIndex = 0;
  return {
    name: String(source.name === undefined ? source.provider || "" : source.name || "").trim(),
    apiHost: normalizeApiHost(source.apiHost || ""),
    apiPath: normalizeApiPath(source.apiPath || "/chat/completions"),
    apiKey: String(source.apiKey || "").trim(),
    models,
    activeModelIndex,
    extraHeaders: String(source.extraHeaders || "").trim(),
    extraBody: String(source.extraBody || "").trim()
  };
}

function hasLegacyValues(value: any): boolean {
  return !!(value && (value.provider || value.apiHost || value.apiKey || value.model || value.extraHeaders || value.extraBody));
}

function normalizeProviders(values: any, legacy: any): AIProviderProfile[] {
  const source = Array.isArray(values) ? values : [];
  const providers = source.map((item: any) => normalizeProvider(item)).slice(0, MAX_AI_PROVIDERS);
  if (!providers.length && hasLegacyValues(legacy)) {
    providers.push(normalizeProvider({
      name: legacy.provider,
      apiHost: legacy.apiHost,
      apiPath: legacy.apiPath,
      apiKey: legacy.apiKey,
      model: legacy.model,
      extraHeaders: legacy.extraHeaders,
      extraBody: legacy.extraBody
    }));
  }
  return providers;
}

function syncActiveSettings(value: any): AISettings {
  const providers = normalizeProviders(value && value.providers, value);
  let activeProviderIndex = Number(value && value.activeProviderIndex);
  if (!isFinite(activeProviderIndex) || activeProviderIndex < 0 || activeProviderIndex >= providers.length) activeProviderIndex = 0;
  const active = providers[activeProviderIndex] || createBlankProvider();
  const model = active.models[active.activeModelIndex] || "";
  return {
    provider: active.name,
    apiHost: active.apiHost,
    apiPath: active.apiPath,
    apiKey: active.apiKey,
    model,
    extraHeaders: active.extraHeaders,
    extraBody: active.extraBody,
    providers,
    activeProviderIndex
  };
}

function ensureActiveProvider(settings: AISettings): AIProviderProfile[] {
  const providers = settings.providers.slice();
  if (!providers.length) providers.push(createBlankProvider());
  return providers;
}

function saveCurrentSettings(next: AISettings): Promise<AISettings> {
  AI_SETTINGS = syncActiveSettings(next);
  return new Promise((resolve) => {
    storage.set({
      key: AI_STORAGE_KEY,
      value: JSON.stringify(AI_SETTINGS),
      success: () => resolve(AI_SETTINGS),
      fail: () => resolve(AI_SETTINGS)
    });
  });
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

export function getAIProviderCount(settings: AISettings = AI_SETTINGS): number {
  return Array.isArray(settings.providers) ? settings.providers.length : 0;
}

export function getAIModelCount(settings: AISettings = AI_SETTINGS): number {
  const profile = settings.providers && settings.providers[settings.activeProviderIndex];
  return profile && Array.isArray(profile.models) ? profile.models.length : 0;
}

export function loadAISettings(): Promise<AISettings> {
  return new Promise((resolve) => {
    storage.get({
      key: AI_STORAGE_KEY,
      success: (data: any) => {
        if (data) {
          try {
            AI_SETTINGS = syncActiveSettings(JSON.parse(data));
          } catch (error) {
            global.logger.log("Failed to parse AI settings");
          }
        } else {
          AI_SETTINGS = syncActiveSettings(AI_SETTINGS);
        }
        resolve(AI_SETTINGS);
      },
      fail: () => resolve(AI_SETTINGS)
    });
  });
}

export function saveAISettings(params: Partial<AISettings>): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  let providers = params.providers === undefined ? base.providers.slice() : normalizeProviders(params.providers, params);
  let activeProviderIndex = params.activeProviderIndex === undefined ? base.activeProviderIndex : Number(params.activeProviderIndex);
  const hasLegacyUpdate = params.provider !== undefined || params.apiHost !== undefined || params.apiPath !== undefined || params.apiKey !== undefined || params.model !== undefined || params.extraHeaders !== undefined || params.extraBody !== undefined;

  if (hasLegacyUpdate) {
    providers = ensureActiveProvider({ ...base, providers });
    if (activeProviderIndex < 0 || activeProviderIndex >= providers.length) activeProviderIndex = 0;
    const current = normalizeProvider(providers[activeProviderIndex]);
    let models = current.models.slice();
    let activeModelIndex = current.activeModelIndex;
    if (params.model !== undefined) {
      const model = String(params.model || "").trim();
      if (model) {
        const existingIndex = models.indexOf(model);
        if (existingIndex >= 0) activeModelIndex = existingIndex;
        else if (models.length < MAX_AI_MODELS_PER_PROVIDER) {
          models.push(model);
          activeModelIndex = models.length - 1;
        } else {
          models[activeModelIndex] = model;
        }
      }
    }
    providers[activeProviderIndex] = normalizeProvider({
      ...current,
      name: params.provider === undefined ? current.name : params.provider,
      apiHost: params.apiHost === undefined ? current.apiHost : params.apiHost,
      apiPath: params.apiPath === undefined ? current.apiPath : params.apiPath,
      apiKey: params.apiKey === undefined ? current.apiKey : params.apiKey,
      models,
      activeModelIndex,
      extraHeaders: params.extraHeaders === undefined ? current.extraHeaders : params.extraHeaders,
      extraBody: params.extraBody === undefined ? current.extraBody : params.extraBody
    });
  }

  return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex }));
}

export async function addAIProvider(): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  if (base.providers.length >= MAX_AI_PROVIDERS) throw createAiError("provider-limit");
  const providers = base.providers.concat([createBlankProvider()]);
  return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex: providers.length - 1 }));
}

export async function updateActiveAIProvider(params: any): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  const providers = ensureActiveProvider(base);
  const index = Math.min(Math.max(0, base.activeProviderIndex), providers.length - 1);
  const current = normalizeProvider(providers[index]);
  providers[index] = normalizeProvider({ ...current, ...params, models: current.models, activeModelIndex: current.activeModelIndex });
  return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex: index }));
}

export async function addAIModel(value: string): Promise<AISettings> {
  const model = String(value || "").trim();
  if (!model) throw createAiError("empty-model");
  const base = syncActiveSettings(AI_SETTINGS);
  const providers = ensureActiveProvider(base);
  const index = Math.min(Math.max(0, base.activeProviderIndex), providers.length - 1);
  const current = normalizeProvider(providers[index]);
  if (current.models.indexOf(model) >= 0) {
    current.activeModelIndex = current.models.indexOf(model);
  } else {
    if (current.models.length >= MAX_AI_MODELS_PER_PROVIDER) throw createAiError("model-limit");
    current.models.push(model);
    current.activeModelIndex = current.models.length - 1;
  }
  providers[index] = current;
  return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex: index }));
}

export async function selectNextAIProvider(): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  if (!base.providers.length) return base;
  return saveCurrentSettings(syncActiveSettings({
    providers: base.providers,
    activeProviderIndex: (base.activeProviderIndex + 1) % base.providers.length
  }));
}

export async function selectNextAIModel(): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  const providers = base.providers.slice();
  const index = base.activeProviderIndex;
  const current = providers[index] && normalizeProvider(providers[index]);
  if (!current || !current.models.length) return base;
  current.activeModelIndex = (current.activeModelIndex + 1) % current.models.length;
  providers[index] = current;
  return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex: index }));
}

export async function selectNextAIProfile(): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  if (!base.providers.length) return base;
  const providers = base.providers.slice();
  let providerIndex = base.activeProviderIndex;
  let profile = normalizeProvider(providers[providerIndex]);
  if (profile.models.length && profile.activeModelIndex < profile.models.length - 1) {
    profile.activeModelIndex += 1;
    providers[providerIndex] = profile;
    return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex: providerIndex }));
  }
  for (let step = 1; step <= providers.length; step += 1) {
    const candidateIndex = (base.activeProviderIndex + step) % providers.length;
    const candidate = normalizeProvider(providers[candidateIndex]);
    if (candidate.models.length) {
      candidate.activeModelIndex = 0;
      providers[candidateIndex] = candidate;
      providerIndex = candidateIndex;
      return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex: providerIndex }));
    }
  }
  return base;
}

export function getAIProfileOptions(settings: AISettings = AI_SETTINGS): any[] {
  const options: any[] = [];
  const providers = Array.isArray(settings.providers) ? settings.providers : [];
  providers.forEach((rawProvider: any, providerIndex: number) => {
    const provider = normalizeProvider(rawProvider);
    provider.models.forEach((model: string, modelIndex: number) => {
      options.push({
        providerIndex,
        modelIndex,
        providerName: provider.name || "AI",
        modelName: model,
        active: providerIndex === settings.activeProviderIndex && modelIndex === provider.activeModelIndex
      });
    });
  });
  return options;
}

export async function selectAIProfile(providerIndex: number, modelIndex: number): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  const providers = base.providers.slice();
  const targetProvider = providers[providerIndex] && normalizeProvider(providers[providerIndex]);
  if (!targetProvider || !targetProvider.models[modelIndex]) throw createAiError("unknown-profile");
  targetProvider.activeModelIndex = modelIndex;
  providers[providerIndex] = targetProvider;
  return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex: providerIndex }));
}

export async function deleteActiveAIModel(): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  const providers = base.providers.slice();
  const providerIndex = base.activeProviderIndex;
  const current = providers[providerIndex] && normalizeProvider(providers[providerIndex]);
  if (!current || !current.models.length) throw createAiError("no-model");
  current.models.splice(current.activeModelIndex, 1);
  current.activeModelIndex = Math.max(0, Math.min(current.activeModelIndex, current.models.length - 1));
  providers[providerIndex] = current;
  return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex: providerIndex }));
}

export async function deleteActiveAIProvider(): Promise<AISettings> {
  const base = syncActiveSettings(AI_SETTINGS);
  const providers = base.providers.slice();
  if (!providers.length) throw createAiError("no-provider");
  providers.splice(base.activeProviderIndex, 1);
  const activeProviderIndex = Math.max(0, Math.min(base.activeProviderIndex, providers.length - 1));
  return saveCurrentSettings(syncActiveSettings({ providers, activeProviderIndex }));
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
