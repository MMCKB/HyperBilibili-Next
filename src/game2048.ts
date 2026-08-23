import { storage } from "./tsimports"

export type Game2048Direction = "up" | "down" | "left" | "right";

export interface Game2048State {
  board: number[];
  score: number;
  bestScore: number;
  undoBoard?: number[];
  undoScore?: number;
}

export interface Game2048MoveResult {
  state: Game2048State;
  moved: boolean;
  spawnedIndex: number;
}

const GAME_2048_STORAGE_KEY = "toolbox_2048_state";
const BOARD_SIZE = 4;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

function isValidTile(value: any): boolean {
  const number = Number(value);
  return number === 0 || (number >= 2 && (number & (number - 1)) === 0);
}

function normalizeBoard(board: any): number[] {
  if (!Array.isArray(board) || board.length !== CELL_COUNT || !board.every(isValidTile)) return [];
  return board.map((value) => Number(value));
}

function createEmptyBoard(): number[] {
  return Array(CELL_COUNT).fill(0);
}

function addRandomTile(board: number[]): { board: number[]; index: number } {
  const available: number[] = [];
  board.forEach((value, index) => {
    if (!value) available.push(index);
  });
  if (!available.length) return { board: board.slice(), index: -1 };
  const next = board.slice();
  const index = available[Math.floor(Math.random() * available.length)];
  next[index] = Math.random() < 0.9 ? 2 : 4;
  return { board: next, index };
}

function createNewBoard(): number[] {
  return addRandomTile(addRandomTile(createEmptyBoard()).board).board;
}

function normalizeState(value: any): Game2048State {
  const board = normalizeBoard(value && value.board);
  const storedScore = Math.max(0, Number(value && value.score) || 0);
  const storedBestScore = Math.max(storedScore, Number(value && value.bestScore) || 0);
  if (!board.length) {
    return { board: createNewBoard(), score: 0, bestScore: storedBestScore };
  }
  const undoBoard = normalizeBoard(value && value.undoBoard);
  const undoScore = Math.max(0, Number(value && value.undoScore) || 0);
  return undoBoard.length
    ? { board, score: storedScore, bestScore: storedBestScore, undoBoard, undoScore }
    : { board, score: storedScore, bestScore: storedBestScore };
}

function readLine(board: number[], index: number, direction: Game2048Direction): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < BOARD_SIZE; offset += 1) {
    const row = direction === "left" || direction === "right" ? index : offset;
    const column = direction === "left" || direction === "right" ? offset : index;
    const sourceRow = direction === "down" ? BOARD_SIZE - 1 - row : row;
    const sourceColumn = direction === "right" ? BOARD_SIZE - 1 - column : column;
    values.push(board[sourceRow * BOARD_SIZE + sourceColumn]);
  }
  return values;
}

function writeLine(board: number[], values: number[], index: number, direction: Game2048Direction): void {
  for (let offset = 0; offset < BOARD_SIZE; offset += 1) {
    const row = direction === "left" || direction === "right" ? index : offset;
    const column = direction === "left" || direction === "right" ? offset : index;
    const targetRow = direction === "down" ? BOARD_SIZE - 1 - row : row;
    const targetColumn = direction === "right" ? BOARD_SIZE - 1 - column : column;
    board[targetRow * BOARD_SIZE + targetColumn] = values[offset];
  }
}

function mergeLine(values: number[]): { values: number[]; gained: number } {
  const compact = values.filter((value) => value);
  const merged: number[] = [];
  let gained = 0;
  for (let index = 0; index < compact.length; index += 1) {
    if (compact[index] === compact[index + 1]) {
      const value = compact[index] * 2;
      merged.push(value);
      gained += value;
      index += 1;
    } else {
      merged.push(compact[index]);
    }
  }
  while (merged.length < BOARD_SIZE) merged.push(0);
  return { values: merged, gained };
}

export function createGame2048State(previousBestScore: number = 0): Game2048State {
  return { board: createNewBoard(), score: 0, bestScore: Math.max(0, Number(previousBestScore) || 0) };
}

export function moveGame2048(state: Game2048State, direction: Game2048Direction): Game2048MoveResult {
  const source = normalizeState(state);
  const nextBoard = source.board.slice();
  let gained = 0;
  let moved = false;
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const line = readLine(source.board, index, direction);
    const result = mergeLine(line);
    if (line.some((value, offset) => value !== result.values[offset])) moved = true;
    gained += result.gained;
    writeLine(nextBoard, result.values, index, direction);
  }
  if (!moved) return { state: source, moved: false, spawnedIndex: -1 };
  const added = addRandomTile(nextBoard);
  const score = source.score + gained;
  return {
    state: {
      board: added.board,
      score,
      bestScore: Math.max(source.bestScore, score),
      undoBoard: source.board.slice(),
      undoScore: source.score
    },
    moved: true,
    spawnedIndex: added.index
  };
}

export function undoGame2048(state: Game2048State): { state: Game2048State; undone: boolean } {
  const source = normalizeState(state);
  const undoBoard = normalizeBoard(source.undoBoard);
  if (!undoBoard.length) return { state: source, undone: false };
  return {
    state: { board: undoBoard, score: Math.max(0, Number(source.undoScore) || 0), bestScore: source.bestScore },
    undone: true
  };
}

export function isGame2048Over(board: number[]): boolean {
  const values = normalizeBoard(board);
  if (!values.length) return false;
  if (values.some((value) => value === 0)) return false;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const value = values[row * BOARD_SIZE + column];
      if (column < BOARD_SIZE - 1 && value === values[row * BOARD_SIZE + column + 1]) return false;
      if (row < BOARD_SIZE - 1 && value === values[(row + 1) * BOARD_SIZE + column]) return false;
    }
  }
  return true;
}

export function loadGame2048State(): Promise<Game2048State> {
  return new Promise((resolve) => {
    storage.get({
      key: GAME_2048_STORAGE_KEY,
      success: (data: any) => {
        try {
          resolve(normalizeState(data ? JSON.parse(data) : null));
        } catch (error) {
          resolve(createGame2048State());
        }
      },
      fail: () => resolve(createGame2048State())
    });
  });
}

export function saveGame2048State(state: Game2048State): Promise<Game2048State> {
  const normalized = normalizeState(state);
  return new Promise((resolve) => {
    storage.set({
      key: GAME_2048_STORAGE_KEY,
      value: JSON.stringify(normalized),
      success: () => resolve(normalized),
      fail: () => resolve(normalized)
    });
  });
}
