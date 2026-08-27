import { fetch, storage } from "./tsimports";

const GITHUB_TOKEN_STORAGE_KEY = "toolbox_github_access_token_v1";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const ACTIVE_REPOSITORY_KEY = "__hyperbiliGithubActiveRepository";
const ACTIVE_WORKFLOW_KEY = "__hyperbiliGithubActiveWorkflow";

export interface GithubProfile {
  login: string;
  name: string;
  avatarUrl: string;
}

export interface GithubRepository {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string;
  defaultBranch: string;
  stars: number;
  private: boolean;
  updatedAt: string;
}

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  author: string;
  updatedAt: string;
  isPullRequest: boolean;
}

export interface GithubWorkflow {
  id: string;
  name: string;
  path: string;
  state: string;
}

export interface GithubWorkflowInput {
  id: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue: string;
  options: string[];
}

export interface GithubWorkflowDefinition {
  dispatchable: boolean;
  inputs: GithubWorkflowInput[];
}

function stringValue(value: any): string {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeRepository(value: any): GithubRepository | null {
  if (!value || !value.name || !value.owner || !value.owner.login) return null;
  return {
    id: Number(value.id || 0),
    name: stringValue(value.name),
    fullName: stringValue(value.full_name || value.name),
    owner: stringValue(value.owner.login),
    description: stringValue(value.description),
    defaultBranch: stringValue(value.default_branch || "main"),
    stars: Number(value.stargazers_count || 0),
    private: value.private === true,
    updatedAt: stringValue(value.updated_at)
  };
}

function normalizeProfile(value: any): GithubProfile {
  return {
    login: stringValue(value && value.login),
    name: stringValue(value && (value.name || value.login)),
    avatarUrl: stringValue(value && value.avatar_url)
  };
}

function normalizeWorkflow(value: any): GithubWorkflow | null {
  if (!value || (!value.id && !value.path)) return null;
  return {
    id: stringValue(value.id || value.path),
    name: stringValue(value.name || value.path),
    path: stringValue(value.path),
    state: stringValue(value.state || "")
  };
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(stringValue(value).trim());
}

function createGithubError(code: string): Error {
  return new Error(code || "github-error");
}

function unwrapResponse(response: any): any {
  let transport = response;
  if (transport && transport.data && typeof transport.data === "object" &&
    (typeof transport.data.code === "number" || transport.data.data !== undefined || transport.data.headers)) {
    transport = transport.data;
  }

  const status = transport && typeof transport.code === "number" ? transport.code : 0;
  let body = transport && transport.data !== undefined ? transport.data : transport;
  if (typeof body === "string" && body) {
    try {
      body = JSON.parse(body);
    } catch (error) {
      // GitHub 的 204 响应与少量纯文本响应无需再解析。
    }
  }

  if (status && (status < 200 || status >= 300)) {
    throw createGithubError("http-" + status);
  }
  return body;
}

async function loadGithubToken(): Promise<string> {
  return new Promise((resolve) => {
    storage.get({
      key: GITHUB_TOKEN_STORAGE_KEY,
      success: (value: any) => resolve(stringValue(value).trim()),
      fail: () => resolve("")
    });
  });
}

async function githubRequest(path: string, method: string = "GET", body?: any): Promise<any> {
  const token = await loadGithubToken();
  if (!token) throw createGithubError("missing-token");

  const options: any = {
    url: GITHUB_API_BASE + path,
    method,
    responseType: "json",
    header: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "HyperBilibili-Vela"
    }
  };
  if (body !== undefined) {
    options.data = JSON.stringify(body);
    options.header["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch.fetch(options);
    return unwrapResponse(response);
  } catch (error) {
    const text = stringValue(error && (error.message || error.code));
    if (text.indexOf("http-") === 0 || text === "missing-token") throw error;
    throw createGithubError("network");
  }
}

function decodeBase64Utf8(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const source = stringValue(value).replace(/[\r\n\s]/g, "");
  let buffer = 0;
  let bits = 0;
  let binary = "";

  for (let index = 0; index < source.length; index++) {
    const char = source.charAt(index);
    if (char === "=") break;
    const alphabetIndex = alphabet.indexOf(char);
    if (alphabetIndex < 0) continue;
    buffer = (buffer << 6) | alphabetIndex;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      binary += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  try {
    let encoded = "";
    for (let index = 0; index < binary.length; index++) {
      encoded += "%" + ("0" + binary.charCodeAt(index).toString(16)).slice(-2);
    }
    return decodeURIComponent(encoded);
  } catch (error) {
    return binary;
  }
}

function normalizeYamlText(value: string): string {
  const text = stringValue(value).trim();
  if ((text.charAt(0) === "\"" && text.charAt(text.length - 1) === "\"") ||
    (text.charAt(0) === "'" && text.charAt(text.length - 1) === "'")) {
    return text.slice(1, -1);
  }
  return text;
}

function indentation(line: string): number {
  const match = String(line || "").match(/^\s*/);
  return match ? match[0].length : 0;
}

function parseInlineOptions(value: string): string[] {
  const source = normalizeYamlText(value);
  if (source.charAt(0) !== "[" || source.charAt(source.length - 1) !== "]") return [];
  return source.slice(1, -1).split(",").map((item) => normalizeYamlText(item)).filter((item) => !!item);
}

export function supportsWorkflowDispatch(yaml: string): boolean {
  const source = stringValue(yaml);
  return /(^|\n)\s*workflow_dispatch\s*:/m.test(source) ||
    /(^|\n)\s*(?:on|['\"]on['\"])\s*:\s*workflow_dispatch\s*(?:#|$)/m.test(source) ||
    /(^|\n)\s*(?:on|['\"]on['\"])\s*:\s*\[[^\]]*\bworkflow_dispatch\b[^\]]*\]/m.test(source);
}

export function parseWorkflowDispatchInputs(yaml: string): GithubWorkflowInput[] {
  const lines = stringValue(yaml).replace(/\r/g, "").split("\n");
  let dispatchIndex = -1;
  let dispatchIndent = 0;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(\s*)workflow_dispatch\s*:\s*(?:#.*)?$/);
    if (match) {
      dispatchIndex = index;
      dispatchIndent = match[1].length;
      break;
    }
  }
  if (dispatchIndex < 0) return [];

  let inputsIndex = -1;
  let inputsIndent = 0;
  for (let index = dispatchIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.charAt(0) === "#") continue;
    const indent = indentation(line);
    if (indent <= dispatchIndent) break;
    if (/^inputs\s*:\s*(?:#.*)?$/.test(trimmed)) {
      inputsIndex = index;
      inputsIndent = indent;
      break;
    }
  }
  if (inputsIndex < 0) return [];

  const inputs: GithubWorkflowInput[] = [];
  let current: GithubWorkflowInput | null = null;
  let currentIndent = 0;
  let collectingOptions = false;
  for (let index = inputsIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.charAt(0) === "#") continue;
    const indent = indentation(line);
    if (indent <= inputsIndent) break;

    const keyMatch = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(?:#.*)?$/);
    if (keyMatch && indent === inputsIndent + 2) {
      current = {
        id: keyMatch[2],
        description: "",
        type: "string",
        required: false,
        defaultValue: "",
        options: []
      };
      currentIndent = indent;
      collectingOptions = false;
      inputs.push(current);
      continue;
    }
    if (!current || indent <= currentIndent) continue;

    const propertyMatch = trimmed.match(/^(description|required|default|type|options)\s*:\s*(.*)$/);
    if (propertyMatch) {
      const property = propertyMatch[1];
      const rawValue = propertyMatch[2] || "";
      collectingOptions = property === "options" && !normalizeYamlText(rawValue);
      if (property === "description") current.description = normalizeYamlText(rawValue);
      if (property === "required") current.required = normalizeYamlText(rawValue).toLowerCase() === "true";
      if (property === "default") current.defaultValue = normalizeYamlText(rawValue);
      if (property === "type") current.type = normalizeYamlText(rawValue).toLowerCase() || "string";
      if (property === "options") current.options = parseInlineOptions(rawValue);
      continue;
    }

    if (collectingOptions && /^-\s+/.test(trimmed)) {
      current.options.push(normalizeYamlText(trimmed.replace(/^-\s+/, "")));
    } else if (!/^-\s+/.test(trimmed)) {
      collectingOptions = false;
    }
  }
  return inputs.slice(0, 25);
}

export async function hasGithubToken(): Promise<boolean> {
  return !!(await loadGithubToken());
}

export function saveGithubToken(token: string): Promise<boolean> {
  const value = stringValue(token).trim();
  if (!value) return Promise.resolve(false);
  return new Promise((resolve) => {
    storage.set({
      key: GITHUB_TOKEN_STORAGE_KEY,
      value,
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

export function clearGithubToken(): Promise<void> {
  return new Promise((resolve) => {
    storage.delete({
      key: GITHUB_TOKEN_STORAGE_KEY,
      success: () => resolve(),
      fail: () => resolve()
    });
  });
}

export async function getGithubProfile(): Promise<GithubProfile> {
  return normalizeProfile(await githubRequest("/user"));
}

export async function listGithubRepositories(page: number, ownedOnly: boolean = false): Promise<GithubRepository[]> {
  const pageNumber = Math.max(1, Number(page) || 1);
  const affiliation = ownedOnly ? "owner" : "owner,collaborator,organization_member";
  const path = "/user/repos?affiliation=" + encodeURIComponent(affiliation) +
    "&sort=updated&direction=desc&per_page=10&page=" + pageNumber;
  const data = await githubRequest(path);
  return (Array.isArray(data) ? data : []).map(normalizeRepository).filter((item): item is GithubRepository => !!item);
}

export async function getGithubRepository(owner: string, repository: string): Promise<GithubRepository> {
  const data = await githubRequest("/repos/" + encodePathSegment(owner) + "/" + encodePathSegment(repository));
  const item = normalizeRepository(data);
  if (!item) throw createGithubError("invalid-repository");
  return item;
}

export async function isGithubRepositoryStarred(owner: string, repository: string): Promise<boolean> {
  try {
    await githubRequest("/user/starred/" + encodePathSegment(owner) + "/" + encodePathSegment(repository));
    return true;
  } catch (error) {
    const code = stringValue(error && error.message);
    if (code === "http-404") return false;
    throw error;
  }
}

export async function starGithubRepository(owner: string, repository: string): Promise<void> {
  await githubRequest("/user/starred/" + encodePathSegment(owner) + "/" + encodePathSegment(repository), "PUT");
}

export async function getGithubReadme(owner: string, repository: string): Promise<string> {
  const data = await githubRequest("/repos/" + encodePathSegment(owner) + "/" + encodePathSegment(repository) + "/readme");
  const content = decodeBase64Utf8(data && data.content ? data.content : "");
  if (!content) throw createGithubError("empty-readme");
  return content;
}

export async function listGithubIssues(owner: string, repository: string, page: number): Promise<GithubIssue[]> {
  const pageNumber = Math.max(1, Number(page) || 1);
  const data = await githubRequest("/repos/" + encodePathSegment(owner) + "/" + encodePathSegment(repository) +
    "/issues?state=all&sort=updated&direction=desc&per_page=10&page=" + pageNumber);
  return (Array.isArray(data) ? data : []).map((item: any) => ({
    number: Number(item && item.number || 0),
    title: stringValue(item && item.title),
    body: stringValue(item && (item.body_text || item.body)),
    state: stringValue(item && item.state),
    author: stringValue(item && item.user && item.user.login),
    updatedAt: stringValue(item && item.updated_at),
    isPullRequest: !!(item && item.pull_request)
  })).filter((item: GithubIssue) => !item.isPullRequest && item.number > 0);
}

export async function listGithubWorkflows(owner: string, repository: string): Promise<GithubWorkflow[]> {
  const data = await githubRequest("/repos/" + encodePathSegment(owner) + "/" + encodePathSegment(repository) + "/actions/workflows?per_page=30&page=1");
  return (data && Array.isArray(data.workflows) ? data.workflows : []).map(normalizeWorkflow).filter((item): item is GithubWorkflow => !!item);
}

export async function getGithubWorkflowDefinition(owner: string, repository: string, path: string): Promise<GithubWorkflowDefinition> {
  if (!path) return { dispatchable: false, inputs: [] };
  const data = await githubRequest("/repos/" + encodePathSegment(owner) + "/" + encodePathSegment(repository) + "/contents/" + path.split("/").map(encodePathSegment).join("/"));
  const yaml = decodeBase64Utf8(data && data.content ? data.content : "");
  return {
    dispatchable: supportsWorkflowDispatch(yaml),
    inputs: parseWorkflowDispatchInputs(yaml)
  };
}

export async function dispatchGithubWorkflow(owner: string, repository: string, workflowId: string, ref: string, inputs: Record<string, string>): Promise<void> {
  const cleanInputs: Record<string, string> = {};
  Object.keys(inputs || {}).slice(0, 25).forEach((key) => {
    cleanInputs[key] = stringValue(inputs[key]);
  });
  await githubRequest("/repos/" + encodePathSegment(owner) + "/" + encodePathSegment(repository) +
    "/actions/workflows/" + encodePathSegment(workflowId) + "/dispatches", "POST", {
      ref: stringValue(ref).trim() || "main",
      inputs: cleanInputs
    });
}

export function setActiveGithubRepository(repository: GithubRepository): void {
  global[ACTIVE_REPOSITORY_KEY] = repository;
}

export function getActiveGithubRepository(): GithubRepository | null {
  const value = global[ACTIVE_REPOSITORY_KEY];
  return normalizeRepository({
    ...value,
    owner: value && value.owner ? { login: value.owner } : null,
    stargazers_count: value && value.stars,
    default_branch: value && value.defaultBranch,
    full_name: value && value.fullName,
    updated_at: value && value.updatedAt
  });
}

export function setActiveGithubWorkflow(workflow: GithubWorkflow): void {
  global[ACTIVE_WORKFLOW_KEY] = workflow;
}

export function getActiveGithubWorkflow(): GithubWorkflow | null {
  const value = global[ACTIVE_WORKFLOW_KEY];
  return normalizeWorkflow(value);
}
