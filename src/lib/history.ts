/** 成绩册与最近一局录像的 localStorage 存取——读侧守卫前置（畸形数据不得引发渲染层异常）。Storage 参数注入，不直调 window.localStorage。 @impl M03.F01.I01 */
import { DEFAULT_SKIN_ID, SKINS } from "../config/skins";
import type { DeathCause } from "./game";
import { isWellFormedRecording, type Recording } from "./recorder";

export interface ScoreEntry {
  skinId: string;
  score: number;
  ticks: number;
  endedAt: number;
  cause: DeathCause | "win";
}

/** 成绩册键——JSON: ScoreEntry[]（不分段存储，按 skinId 字段过滤） */
export const SCORES_KEY = "hsnake.v1.scores";
/** 最近一局录像键——JSON: Recording */
export const LAST_RUN_KEY = "hsnake.v1.lastrun";

const LEGAL_CAUSES: readonly (DeathCause | "win")[] = ["wall", "self", "win"];

/** 私有形状判定：skinId string、score/ticks/endedAt number、cause∈{"wall","self","win"}。 */
function isWellFormedScoreEntry(e: unknown): e is ScoreEntry {
  if (typeof e !== "object" || e === null) return false;
  const s = e as ScoreEntry;
  if (typeof s.skinId !== "string") return false;
  if (typeof s.score !== "number") return false;
  if (typeof s.ticks !== "number") return false;
  if (typeof s.endedAt !== "number") return false;
  if (!LEGAL_CAUSES.includes(s.cause)) return false;
  return true;
}

/** 读侧净化：缺键/乱 JSON/非数组→[]，畸形条目剔除，良构条目保序保留。 */
export function loadScores(storage: Storage): ScoreEntry[] {
  const raw = storage.getItem(SCORES_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isWellFormedScoreEntry);
}

/** 追加一条成绩。写侧 try/catch：quota/序列化失败静默不炸 UI。 */
export function saveScore(storage: Storage, entry: ScoreEntry): void {
  try {
    const scores = loadScores(storage);
    scores.push(entry);
    storage.setItem(SCORES_KEY, JSON.stringify(scores));
  } catch {
    // 配额满或序列化失败——静默丢弃，不打断游戏
  }
}

/** 指定皮肤的历史最佳，无记录→0。 */
export function bestScore(scores: readonly ScoreEntry[], skinId: string): number {
  return scores.reduce((max, s) => (s.skinId === skinId && s.score > max ? s.score : max), 0);
}

/** 最近一局录像：缺键/乱 JSON/守卫不过→null（守卫直接复用 recorder 的 isWellFormedRecording）。 */
export function loadLastRun(storage: Storage): Recording | null {
  const raw = storage.getItem(LAST_RUN_KEY);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isWellFormedRecording(parsed)) return null;
  return parsed;
}

/** 存最近一局录像。写侧 try/catch：quota/序列化失败静默不炸 UI。 */
export function saveLastRun(storage: Storage, rec: Recording): void {
  try {
    storage.setItem(LAST_RUN_KEY, JSON.stringify(rec));
  } catch {
    // 配额满或序列化失败——静默丢弃，不打断游戏
  }
}

/** 皮肤选择键——原样存皮肤 id 字符串（非 JSON） */
export const SKIN_KEY = "hsnake.v1.skin";

/** 读侧守卫：缺键/不在 SKINS 中的 id 一律回落 DEFAULT_SKIN_ID（2048 白屏教训，模式同 Task 4）。 */
export function loadSkinId(storage: Storage): string {
  const raw = storage.getItem(SKIN_KEY);
  if (raw === null) return DEFAULT_SKIN_ID;
  return SKINS.some((s) => s.id === raw) ? raw : DEFAULT_SKIN_ID;
}

/** 存皮肤 id。写侧 try/catch：quota 失败静默不炸 UI。 */
export function saveSkinId(storage: Storage, id: string): void {
  try {
    storage.setItem(SKIN_KEY, id);
  } catch {
    // 配额满——静默丢弃，不打断游戏
  }
}

/** 内存假 Storage——Map 版 no-op。localStorage 不可用时的回落假件（数据不持久，但 UI 全链路不炸）。 */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

const memoryStorage = new MemoryStorage();

/**
 * localStorage 安全取用——浏览器「阻止所有 cookie」时属性访问 globalThis.localStorage
 * 本身抛 SecurityError（2048 白屏同族），模块加载期直取会让 App 整体不渲染。
 * 抛错或缺失回落内存假件：loadSkinId/loadScores/loadLastRun 全部安全返回默认值。
 */
export function safeLocalStorage(): Storage {
  try {
    const s = globalThis.localStorage;
    if (s !== null && s !== undefined) return s;
  } catch {
    // SecurityError——阻止所有 cookie 场景，走内存假件
  }
  return memoryStorage;
}
