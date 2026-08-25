import { storage } from "./tsimports";

export interface CourseItem {
  id: string;
  title: string;
  weekday: number;
  time: string;
  location: string;
  createdAt: string;
}

export interface TodoItem {
  id: string;
  title: string;
  dueText: string;
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
  courses: CourseItem[];
  todos: TodoItem[];
  countdowns: CountdownItem[];
}

const STORAGE_KEY = "toolbox_organizer_v1";
const MAX_COURSES = 120;
const MAX_TODOS = 120;
const MAX_COUNTDOWNS = 60;

function makeId(prefix: string): string {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function todayText(): string {
  const now = new Date();
  return now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
}

function cleanText(value: any, fallback: string): string {
  return String(value === undefined || value === null ? "" : value).trim() || fallback;
}

function cleanDate(value: any): string {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : todayText();
}

function cleanTime(value: any): string {
  const text = String(value || "").trim().replace(/\s/g, "");
  return /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(text) ? text : "09:00-10:00";
}

function normalizeCourse(value: any): CourseItem | null {
  if (!value || !value.id) return null;
  const weekday = Math.max(1, Math.min(7, Number(value.weekday) || 1));
  return {
    id: String(value.id),
    title: cleanText(value.title, "未命名课程"),
    weekday,
    time: cleanTime(value.time),
    location: cleanText(value.location, "未填写地点"),
    createdAt: cleanDate(value.createdAt)
  };
}

function normalizeTodo(value: any): TodoItem | null {
  if (!value || !value.id) return null;
  return {
    id: String(value.id),
    title: cleanText(value.title, "未命名待办"),
    dueText: cleanText(value.dueText, "今天"),
    completed: !!value.completed,
    createdAt: cleanDate(value.createdAt)
  };
}

function normalizeCountdown(value: any): CountdownItem | null {
  if (!value || !value.id) return null;
  return {
    id: String(value.id),
    title: cleanText(value.title, "重要日子"),
    date: cleanDate(value.date),
    createdAt: cleanDate(value.createdAt)
  };
}

function emptyData(): OrganizerData {
  return { version: 1, courses: [], todos: [], countdowns: [] };
}

function normalizeData(value: any): OrganizerData {
  const source = value || {};
  const courses = Array.isArray(source.courses) ? source.courses.map(normalizeCourse).filter((item: any) => !!item).slice(0, MAX_COURSES) : [];
  const todos = Array.isArray(source.todos) ? source.todos.map(normalizeTodo).filter((item: any) => !!item).slice(0, MAX_TODOS) : [];
  const countdowns = Array.isArray(source.countdowns) ? source.countdowns.map(normalizeCountdown).filter((item: any) => !!item).slice(0, MAX_COUNTDOWNS) : [];
  return { version: 1, courses, todos, countdowns };
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

export function courseSort(a: CourseItem, b: CourseItem): number {
  if (a.weekday !== b.weekday) return a.weekday - b.weekday;
  return a.time.localeCompare(b.time);
}

export async function createCourse(input: Partial<CourseItem>): Promise<CourseItem> {
  const data = await loadOrganizerData();
  if (data.courses.length >= MAX_COURSES) throw new Error("course-limit");
  const course: CourseItem = {
    id: makeId("course"),
    title: cleanText(input.title, "未命名课程"),
    weekday: Math.max(1, Math.min(7, Number(input.weekday) || 1)),
    time: cleanTime(input.time),
    location: cleanText(input.location, "未填写地点"),
    createdAt: todayText()
  };
  await saveData({ ...data, courses: data.courses.concat([course]).sort(courseSort) });
  return course;
}

export async function removeCourse(id: string): Promise<void> {
  const data = await loadOrganizerData();
  await saveData({ ...data, courses: data.courses.filter((item) => item.id !== String(id || "")) });
}

export async function createTodo(title: string, dueText: string): Promise<TodoItem> {
  const data = await loadOrganizerData();
  if (data.todos.length >= MAX_TODOS) throw new Error("todo-limit");
  const todo: TodoItem = {
    id: makeId("todo"),
    title: cleanText(title, "未命名待办"),
    dueText: cleanText(dueText, "今天"),
    completed: false,
    createdAt: todayText()
  };
  await saveData({ ...data, todos: data.todos.concat([todo]) });
  return todo;
}

export async function toggleTodo(id: string): Promise<TodoItem | null> {
  const data = await loadOrganizerData();
  let changed: TodoItem | null = null;
  const todos = data.todos.map((item) => {
    if (item.id !== String(id || "")) return item;
    changed = { ...item, completed: !item.completed };
    return changed as TodoItem;
  });
  await saveData({ ...data, todos });
  return changed;
}

export async function removeTodo(id: string): Promise<void> {
  const data = await loadOrganizerData();
  await saveData({ ...data, todos: data.todos.filter((item) => item.id !== String(id || "")) });
}

export function daysUntil(date: string): number {
  const target = new Date(cleanDate(date) + "T00:00:00");
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target.getTime() - start) / 86400000);
}

export async function createCountdown(title: string, date: string): Promise<CountdownItem> {
  const cleanedDate = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanedDate)) throw new Error("invalid-date");
  const data = await loadOrganizerData();
  if (data.countdowns.length >= MAX_COUNTDOWNS) throw new Error("countdown-limit");
  const countdown: CountdownItem = {
    id: makeId("countdown"),
    title: cleanText(title, "重要日子"),
    date: cleanedDate,
    createdAt: todayText()
  };
  await saveData({ ...data, countdowns: data.countdowns.concat([countdown]) });
  return countdown;
}

export async function removeCountdown(id: string): Promise<void> {
  const data = await loadOrganizerData();
  await saveData({ ...data, countdowns: data.countdowns.filter((item) => item.id !== String(id || "")) });
}
