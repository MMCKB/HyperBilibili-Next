import { storage } from "./tsimports";

export interface TodoItem {
  id: string;
  title: string;
  date: string;
  time: string;
  completed: boolean;
  createdAt: string;
}

export interface CountdownItem {
  id: string;
  title: string;
  date: string;
  createdAt: string;
}

export interface OrganizerData {
  version: number;
  todos: TodoItem[];
  countdowns: CountdownItem[];
}

const STORAGE_KEY = "toolbox_organizer_v1";
const TODO_LIMIT = 120;
const COUNTDOWN_LIMIT = 60;
const RUNTIME_KEY = "__hyperbiliOrganizerRuntime";

interface OrganizerRuntime {
  activeTodoId: string;
  activeCountdownId: string;
}

function runtime(): OrganizerRuntime {
  if (!global[RUNTIME_KEY]) {
    global[RUNTIME_KEY] = { activeTodoId: "", activeCountdownId: "" };
  }
  return global[RUNTIME_KEY] as OrganizerRuntime;
}

function makeId(prefix: string): string {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function todayDateText(): string {
  const now = new Date();
  return formatDate(now);
}

export function formatDate(value: Date): string {
  return value.getFullYear() + "-" + ("0" + (value.getMonth() + 1)).slice(-2) + "-" + ("0" + value.getDate()).slice(-2);
}

export function isValidDate(value: string): boolean {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function isValidDayCount(value: string): boolean {
  return /^\d{1,5}$/.test(String(value || "").trim()) && Number(value) <= 36500;
}

export function dateFromDayOffset(days: number, direction: "after" | "before"): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + (direction === "before" ? -days : days));
  return formatDate(date);
}

function cleanText(value: any, fallback: string): string {
  return String(value === undefined || value === null ? "" : value).trim() || fallback;
}

function normalizeTodo(value: any): TodoItem | null {
  if (!value || !value.id) return null;
  return {
    id: String(value.id),
    title: cleanText(value.title, "未命名待办"),
    // 兼容旧版本的 dueText 数据；旧事项迁移为今天 09:00。
    date: isValidDate(String(value.date || "")) ? String(value.date) : todayDateText(),
    time: isValidTime(String(value.time || "")) ? String(value.time) : "09:00",
    completed: !!value.completed,
    createdAt: isValidDate(String(value.createdAt || "")) ? String(value.createdAt) : todayDateText()
  };
}

function normalizeCountdown(value: any): CountdownItem | null {
  if (!value || !value.id) return null;
  return {
    id: String(value.id),
    title: cleanText(value.title, "重要日子"),
    date: isValidDate(String(value.date || "")) ? String(value.date) : todayDateText(),
    createdAt: isValidDate(String(value.createdAt || "")) ? String(value.createdAt) : todayDateText()
  };
}

function emptyData(): OrganizerData {
  return { version: 2, todos: [], countdowns: [] };
}

function normalizeData(value: any): OrganizerData {
  const source = value || {};
  const todos = Array.isArray(source.todos) ? source.todos.map(normalizeTodo).filter((item: any) => !!item).slice(0, TODO_LIMIT) : [];
  const countdowns = Array.isArray(source.countdowns) ? source.countdowns.map(normalizeCountdown).filter((item: any) => !!item).slice(0, COUNTDOWN_LIMIT) : [];
  return { version: 2, todos, countdowns };
}

function saveData(data: OrganizerData): Promise<OrganizerData> {
  const normalized = normalizeData(data);
  return new Promise((resolve) => {
    storage.set({
      key: STORAGE_KEY,
      value: JSON.stringify(normalized),
      success: () => resolve(normalized),
      fail: () => resolve(normalized)
    });
  });
}

export function loadOrganizerData(): Promise<OrganizerData> {
  return new Promise((resolve) => {
    storage.get({
      key: STORAGE_KEY,
      success: (data: any) => {
        try {
          resolve(normalizeData(data ? JSON.parse(data) : emptyData()));
        } catch (error) {
          resolve(emptyData());
        }
      },
      fail: () => resolve(emptyData())
    });
  });
}

export function todoSort(a: TodoItem, b: TodoItem): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  const left = a.date + " " + a.time;
  const right = b.date + " " + b.time;
  return left.localeCompare(right);
}

export function setActiveTodoId(id: string): void {
  runtime().activeTodoId = String(id || "");
}

export function getActiveTodoId(): string {
  return runtime().activeTodoId;
}

export function setActiveCountdownId(id: string): void {
  runtime().activeCountdownId = String(id || "");
}

export function getActiveCountdownId(): string {
  return runtime().activeCountdownId;
}

export async function getTodo(id: string): Promise<TodoItem | null> {
  const data = await loadOrganizerData();
  return data.todos.filter((item) => item.id === String(id || ""))[0] || null;
}

export async function createTodo(input: Partial<TodoItem>): Promise<TodoItem> {
  const data = await loadOrganizerData();
  if (data.todos.length >= TODO_LIMIT) throw new Error("todo-limit");
  const date = String(input.date || "").trim();
  const time = String(input.time || "").trim();
  if (!isValidDate(date)) throw new Error("invalid-date");
  if (!isValidTime(time)) throw new Error("invalid-time");
  const todo: TodoItem = {
    id: makeId("todo"),
    title: cleanText(input.title, "未命名待办"),
    date,
    time,
    completed: false,
    createdAt: todayDateText()
  };
  await saveData({ ...data, todos: data.todos.concat([todo]).sort(todoSort) });
  return todo;
}

export async function updateTodo(id: string, input: Partial<TodoItem>): Promise<TodoItem | null> {
  const data = await loadOrganizerData();
  let updated: TodoItem | null = null;
  const todos = data.todos.map((item) => {
    if (item.id !== String(id || "")) return item;
    const date = input.date === undefined ? item.date : String(input.date).trim();
    const time = input.time === undefined ? item.time : String(input.time).trim();
    if (!isValidDate(date)) throw new Error("invalid-date");
    if (!isValidTime(time)) throw new Error("invalid-time");
    updated = {
      ...item,
      title: input.title === undefined ? item.title : cleanText(input.title, item.title),
      date,
      time,
      completed: input.completed === undefined ? item.completed : !!input.completed
    };
    return updated as TodoItem;
  });
  if (!updated) return null;
  await saveData({ ...data, todos: todos.sort(todoSort) });
  return updated;
}

export async function toggleTodo(id: string): Promise<TodoItem | null> {
  const item = await getTodo(id);
  return item ? updateTodo(id, { completed: !item.completed }) : null;
}

export async function removeTodo(id: string): Promise<void> {
  const data = await loadOrganizerData();
  await saveData({ ...data, todos: data.todos.filter((item) => item.id !== String(id || "")) });
}

export function daysUntil(date: string): number {
  if (!isValidDate(date)) return 0;
  const target = new Date(date + "T00:00:00");
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target.getTime() - start) / 86400000);
}

export async function getCountdown(id: string): Promise<CountdownItem | null> {
  const data = await loadOrganizerData();
  return data.countdowns.filter((item) => item.id === String(id || ""))[0] || null;
}

export async function createCountdown(title: string, date: string): Promise<CountdownItem> {
  const data = await loadOrganizerData();
  if (data.countdowns.length >= COUNTDOWN_LIMIT) throw new Error("countdown-limit");
  if (!isValidDate(date)) throw new Error("invalid-date");
  const countdown: CountdownItem = {
    id: makeId("countdown"),
    title: cleanText(title, "重要日子"),
    date: String(date).trim(),
    createdAt: todayDateText()
  };
  await saveData({ ...data, countdowns: data.countdowns.concat([countdown]) });
  return countdown;
}

export async function updateCountdown(id: string, input: Partial<CountdownItem>): Promise<CountdownItem | null> {
  const data = await loadOrganizerData();
  let updated: CountdownItem | null = null;
  const countdowns = data.countdowns.map((item) => {
    if (item.id !== String(id || "")) return item;
    const date = input.date === undefined ? item.date : String(input.date).trim();
    if (!isValidDate(date)) throw new Error("invalid-date");
    updated = { ...item, title: input.title === undefined ? item.title : cleanText(input.title, item.title), date };
    return updated as CountdownItem;
  });
  if (!updated) return null;
  await saveData({ ...data, countdowns });
  return updated;
}

export async function removeCountdown(id: string): Promise<void> {
  const data = await loadOrganizerData();
  await saveData({ ...data, countdowns: data.countdowns.filter((item) => item.id !== String(id || "")) });
}
