import { storage, crypto } from "./tsimports";

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface NotesVault {
  version: number;
  passwordSalt: string;
  passwordHash: string;
  notes: NoteItem[];
}

const NOTES_STORAGE_KEY = "toolbox_secure_notes_v1";
let notesSessionUnlocked = false;
let activeNoteId = "";

function emptyVault(): NotesVault {
  return {
    version: 1,
    passwordSalt: "",
    passwordHash: "",
    notes: []
  };
}

function dateText(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = ("0" + (now.getMonth() + 1)).slice(-2);
  const day = ("0" + now.getDate()).slice(-2);
  return year + "-" + month + "-" + day;
}

function normalizeNote(value: any): NoteItem | null {
  if (!value || !value.id) return null;
  const createdAt = String(value.createdAt || dateText());
  return {
    id: String(value.id),
    title: String(value.title || "未命名便签").trim() || "未命名便签",
    content: String(value.content || ""),
    createdAt,
    updatedAt: String(value.updatedAt || createdAt)
  };
}

function normalizeVault(value: any): NotesVault {
  const source = value || {};
  const notes = Array.isArray(source.notes) ? source.notes.map(normalizeNote).filter((item: any) => !!item) : [];
  return {
    version: 1,
    passwordSalt: String(source.passwordSalt || ""),
    passwordHash: String(source.passwordHash || ""),
    notes
  };
}

function digestPin(pin: string, salt: string): string {
  return crypto.hashDigest({
    data: "hyperbili-notes|" + salt + "|" + String(pin || ""),
    algo: "MD5"
  });
}

function makeSalt(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

function saveVault(vault: NotesVault): Promise<NotesVault> {
  const next = normalizeVault(vault);
  return new Promise((resolve) => {
    storage.set({
      key: NOTES_STORAGE_KEY,
      value: JSON.stringify(next),
      success: () => resolve(next),
      fail: () => resolve(next)
    });
  });
}

export function loadNotesVault(): Promise<NotesVault> {
  return new Promise((resolve) => {
    storage.get({
      key: NOTES_STORAGE_KEY,
      success: (data: any) => {
        if (!data) {
          resolve(emptyVault());
          return;
        }
        try {
          resolve(normalizeVault(JSON.parse(data)));
        } catch (error) {
          resolve(emptyVault());
        }
      },
      fail: () => resolve(emptyVault())
    });
  });
}

export function isValidNotesPin(pin: string): boolean {
  return /^\d{4,8}$/.test(String(pin || ""));
}

export function hasNotesPassword(vault: NotesVault): boolean {
  return !!(vault && vault.passwordSalt && vault.passwordHash);
}

export async function setNotesPassword(pin: string): Promise<NotesVault> {
  if (!isValidNotesPin(pin)) throw new Error("invalid-pin");
  const vault = await loadNotesVault();
  const passwordSalt = makeSalt();
  const saved = await saveVault({
    ...vault,
    passwordSalt,
    passwordHash: digestPin(pin, passwordSalt)
  });
  notesSessionUnlocked = true;
  return saved;
}

export async function verifyNotesPassword(pin: string): Promise<boolean> {
  const vault = await loadNotesVault();
  if (!hasNotesPassword(vault)) return false;
  const passed = digestPin(pin, vault.passwordSalt) === vault.passwordHash;
  if (passed) notesSessionUnlocked = true;
  return passed;
}

export function isNotesSessionUnlocked(): boolean {
  return notesSessionUnlocked;
}

export function lockNotesSession(): void {
  notesSessionUnlocked = false;
  activeNoteId = "";
}

export function setActiveNoteId(noteId: string): void {
  activeNoteId = String(noteId || "");
}

export function getActiveNoteId(): string {
  return activeNoteId;
}

export async function createNote(title: string): Promise<NoteItem> {
  const name = String(title || "").trim();
  if (!name) throw new Error("empty-title");
  const vault = await loadNotesVault();
  const date = dateText();
  const note: NoteItem = {
    id: "note-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    title: name,
    content: "",
    createdAt: date,
    updatedAt: date
  };
  await saveVault({ ...vault, notes: [note].concat(vault.notes) });
  return note;
}

export async function getNote(noteId: string): Promise<NoteItem | null> {
  const vault = await loadNotesVault();
  const note = vault.notes.filter((item) => item.id === String(noteId || ""))[0];
  return note ? { ...note } : null;
}

export async function updateNote(noteId: string, changes: Partial<NoteItem>): Promise<NoteItem | null> {
  const vault = await loadNotesVault();
  let updated: NoteItem | null = null;
  const notes = vault.notes.map((item) => {
    if (item.id !== String(noteId || "")) return item;
    updated = {
      ...item,
      title: changes.title === undefined ? item.title : (String(changes.title || "").trim() || item.title),
      content: changes.content === undefined ? item.content : String(changes.content || ""),
      updatedAt: dateText()
    };
    return updated as NoteItem;
  });
  if (!updated) return null;
  await saveVault({ ...vault, notes });
  return updated;
}

export async function changeNotesPassword(oldPin: string, newPin: string): Promise<boolean> {
  if (!isValidNotesPin(newPin)) throw new Error("invalid-pin");
  const passed = await verifyNotesPassword(oldPin);
  if (!passed) return false;
  await setNotesPassword(newPin);
  notesSessionUnlocked = true;
  return true;
}
