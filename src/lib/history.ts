/** 成绩册与最近一局录像的 localStorage 存取——读侧守卫前置（畸形数据不得引发渲染层异常）。Storage 参数注入，不直调 window.localStorage。 */
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
