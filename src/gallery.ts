import { storage } from "./tsimports";
import { asyncFile } from "./asyncapi/file";

export interface GalleryItem {
  id: string;
  name: string;
  uri: string;
  mime: string;
  size: number;
  createdAt: string;
}

interface GalleryVault {
  version: number;
  items: GalleryItem[];
}

interface IncomingGalleryTransfer {
  id: string;
  name: string;
  mime: string;
  totalBytes: number;
  totalChunks: number;
  nextIndex: number;
  receivedBytes: number;
  uri: string;
  createdAt: string;
}

const GALLERY_STORAGE_KEY = "toolbox_gallery_v1";
const GALLERY_DIRECTORY = "internal://files/gallery/";
const GALLERY_RUNTIME_KEY = "__hyperbiliGalleryRuntimeState";

interface GalleryRuntimeState {
  activeItemId: string;
  incoming: { [id: string]: IncomingGalleryTransfer };
}

function getRuntimeState(): GalleryRuntimeState {
  if (!global[GALLERY_RUNTIME_KEY]) {
    global[GALLERY_RUNTIME_KEY] = { activeItemId: "", incoming: {} };
  }
  return global[GALLERY_RUNTIME_KEY] as GalleryRuntimeState;
}

function emptyVault(): GalleryVault {
  return { version: 1, items: [] };
}

function safeFileName(value: string): string {
  const name = String(value || "image").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return name || "image";
}

function timestampText(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = ("0" + (now.getMonth() + 1)).slice(-2);
  const day = ("0" + now.getDate()).slice(-2);
  const hour = ("0" + now.getHours()).slice(-2);
  const minute = ("0" + now.getMinutes()).slice(-2);
  return year + "-" + month + "-" + day + " " + hour + ":" + minute;
}

function normalizeItem(value: any): GalleryItem | null {
  if (!value || !value.id || !value.uri) return null;
  return {
    id: String(value.id),
    name: String(value.name || "图片"),
    uri: String(value.uri),
    mime: String(value.mime || "image/jpeg"),
    size: Math.max(0, Number(value.size || 0)),
    createdAt: String(value.createdAt || timestampText())
  };
}

function normalizeVault(value: any): GalleryVault {
  const source = value || {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeItem).filter((item: any) => !!item) : [];
  return { version: 1, items };
}

function saveVault(vault: GalleryVault): Promise<GalleryVault> {
  const next = normalizeVault(vault);
  return new Promise((resolve) => {
    storage.set({
      key: GALLERY_STORAGE_KEY,
      value: JSON.stringify(next),
      success: () => resolve(next),
      fail: () => resolve(next)
    });
  });
}

export function loadGallery(): Promise<GalleryVault> {
  return new Promise((resolve) => {
    storage.get({
      key: GALLERY_STORAGE_KEY,
      success: (data: any) => {
        try {
          resolve(normalizeVault(data ? JSON.parse(data) : emptyVault()));
        } catch (error) {
          resolve(emptyVault());
        }
      },
      fail: () => resolve(emptyVault())
    });
  });
}

export async function listGalleryItems(): Promise<GalleryItem[]> {
  const vault = await loadGallery();
  return vault.items.slice();
}

export function setActiveGalleryItemId(id: string): void {
  getRuntimeState().activeItemId = String(id || "");
}

export function getActiveGalleryItemId(): string {
  return getRuntimeState().activeItemId;
}

export async function getGalleryItem(id: string): Promise<GalleryItem | null> {
  const items = await listGalleryItems();
  const item = items.filter((current) => current.id === String(id || ""))[0];
  return item ? { ...item } : null;
}

export async function deleteGalleryItem(id: string): Promise<boolean> {
  const vault = await loadGallery();
  const item = vault.items.filter((current) => current.id === String(id || ""))[0];
  if (!item) return false;
  try {
    await asyncFile.delete({ uri: item.uri });
  } catch (error) {}
  await saveVault({ ...vault, items: vault.items.filter((current) => current.id !== item.id) });
  if (getActiveGalleryItemId() === item.id) setActiveGalleryItemId("");
  return true;
}

function base64ToBytes(base64: string): Uint8Array {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(base64 || "").replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < clean.length; index++) {
    const char = clean.charAt(index);
    if (char === "=") break;
    const value = table.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function transferUri(id: string, name: string): string {
  return GALLERY_DIRECTORY + id + "-" + safeFileName(name);
}

export async function beginGalleryTransfer(payload: any): Promise<IncomingGalleryTransfer | null> {
  const id = String(payload && payload.id ? payload.id : "");
  const name = safeFileName(payload && payload.name ? payload.name : "image");
  const totalChunks = Math.max(1, Number(payload && payload.totalChunks ? payload.totalChunks : 0));
  if (!id || totalChunks > 8192) return null;
  const incoming: IncomingGalleryTransfer = {
    id,
    name,
    mime: String(payload && payload.mime ? payload.mime : "image/jpeg"),
    totalBytes: Math.max(0, Number(payload && payload.totalBytes ? payload.totalBytes : 0)),
    totalChunks,
    nextIndex: 0,
    receivedBytes: 0,
    uri: transferUri(id, name),
    createdAt: timestampText()
  };
  try {
    await asyncFile.mkdir({ uri: GALLERY_DIRECTORY, recursive: true });
    try { await asyncFile.delete({ uri: incoming.uri }); } catch (error) {}
    getRuntimeState().incoming[id] = incoming;
    return incoming;
  } catch (error) {
    return null;
  }
}

export async function appendGalleryTransferChunk(payload: any): Promise<{ ok: boolean; id: string; index: number }> {
  const id = String(payload && payload.id ? payload.id : "");
  const index = Number(payload && payload.index !== undefined ? payload.index : -1);
  const transfer = getRuntimeState().incoming[id];
  if (!transfer || index !== transfer.nextIndex) return { ok: false, id, index };
  try {
    const bytes = base64ToBytes(String(payload && payload.data ? payload.data : ""));
    if (!bytes.length && transfer.totalBytes > 0) return { ok: false, id, index };
    await asyncFile.writeArrayBuffer({ uri: transfer.uri, buffer: bytes, append: index > 0 });
    transfer.nextIndex += 1;
    transfer.receivedBytes += bytes.length;
    return { ok: true, id, index };
  } catch (error) {
    return { ok: false, id, index };
  }
}

export async function finishGalleryTransfer(payload: any): Promise<GalleryItem | null> {
  const id = String(payload && payload.id ? payload.id : "");
  const transfer = getRuntimeState().incoming[id];
  if (!transfer || transfer.nextIndex !== transfer.totalChunks) return null;
  delete getRuntimeState().incoming[id];
  const item: GalleryItem = {
    id: transfer.id,
    name: transfer.name,
    uri: transfer.uri,
    mime: transfer.mime,
    size: transfer.receivedBytes,
    createdAt: transfer.createdAt
  };
  const vault = await loadGallery();
  await saveVault({ ...vault, items: [item].concat(vault.items.filter((current) => current.id !== item.id)) });
  return item;
}

export async function abortGalleryTransfer(id: string): Promise<void> {
  const transfer = getRuntimeState().incoming[String(id || "")];
  if (!transfer) return;
  delete getRuntimeState().incoming[transfer.id];
  try { await asyncFile.delete({ uri: transfer.uri }); } catch (error) {}
}

export function galleryTransferProgress(id: string): number {
  const transfer = getRuntimeState().incoming[String(id || "")];
  if (!transfer || !transfer.totalChunks) return 0;
  return Math.floor((transfer.nextIndex / transfer.totalChunks) * 100);
}
