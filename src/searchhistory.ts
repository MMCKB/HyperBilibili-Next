import { asyncStorage } from "./asyncapi/storage";

const SEARCH_HISTORY_KEY = "search_history";
const MAX_HISTORY_COUNT = 20;

class SearchHistoryManagerClass {
  async load(): Promise<string[]> {
    try {
      const raw = await asyncStorage.get({ key: SEARCH_HISTORY_KEY, default: "[]" });
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  async add(keyword: string): Promise<void> {
    if (!keyword) return;
    const trimmed = String(keyword).trim();
    if (!trimmed) return;
    let list = await this.load();
    list = list.filter((item) => item !== trimmed);
    list.unshift(trimmed);
    if (list.length > MAX_HISTORY_COUNT) {
      list = list.slice(0, MAX_HISTORY_COUNT);
    }
    await asyncStorage.set({ key: SEARCH_HISTORY_KEY, value: JSON.stringify(list) });
  }

  async remove(keyword: string): Promise<void> {
    let list = await this.load();
    list = list.filter((item) => item !== keyword);
    await asyncStorage.set({ key: SEARCH_HISTORY_KEY, value: JSON.stringify(list) });
  }

  async clearAll(): Promise<void> {
    await asyncStorage.set({ key: SEARCH_HISTORY_KEY, value: "[]" });
  }
}

export const SearchHistoryManager = new SearchHistoryManagerClass();
