/** 行车记录仪——增量捕获/逐帧展开/读侧守卫。纯函数模块，时间一律参数注入。 */
import {
  DIRECTIONS,
  INITIAL_CELLS,
  type Cell,
  type DeathCause,
  type Direction,
  type GameStatus,
  type SnakeState,
} from "./game";

export type LifeEventType = "start" | "pause" | "resume" | "end";

export interface LifeEvent {
  type: LifeEventType;
  tick: number;
  cause?: DeathCause | "win";
}

export interface TickFrame {
  t: number; // tick 号
  d: Direction; // 本 tick 后朝向
  h: Cell; // 本 tick 新头格
  tail: 0 | 1; // 1=尾格移除（未进食），0=生长或蛇身无尾变化
  f: Cell | null; // 本 tick 后食物位（进食 tick=新食物；win 后 null）
  s: number; // 本 tick 后分数
}

export interface Recording {
  version: 1;
  skinId: string;
  startedAt: number;
  endedAt: number | null;
  start: Cell[]; // 开局蛇身（=INITIAL_CELLS 快照，防御未来可变）
  events: LifeEvent[];
  frames: TickFrame[];
  final: { status: GameStatus; cause?: DeathCause | "win"; score: number; ticks: number } | null;
}

export interface ReplayFrame {
  tick: number;
  cells: Cell[];
  dir: Direction;
  food: Cell | null;
  score: number;
}

const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/** 界内格判定——isWellFormed 的 h/f 检查共用（与 game.ts 同一 0..19 网格语义）。 */
const inBoundsCell = (c: unknown): c is Cell =>
  typeof c === "object" &&
  c !== null &&
  typeof (c as Cell).x === "number" &&
  typeof (c as Cell).y === "number" &&
  Number.isInteger((c as Cell).x) &&
  Number.isInteger((c as Cell).y) &&
  (c as Cell).x >= 0 &&
  (c as Cell).x <= 19 &&
  (c as Cell).y >= 0 &&
  (c as Cell).y <= 19;

export function createRecording(skinId: string, startedAt: number): Recording {
  return {
    version: 1,
    skinId,
    startedAt,
    endedAt: null,
    // 逐格拷贝：rec.start 是独立快照，不与 INITIAL_CELLS 共享引用
    start: INITIAL_CELLS.map((c) => ({ ...c })),
    events: [],
    frames: [],
    final: null,
  };
}

/**
 * 从 prev/next 差分推帧。tail=「prev 尾格与 next 尾格深比较不同→1 否则 0」——
 * 不是长度差分。终局 tick 蛇身不动，正常调用纪律是「仅非终局 tick（move/food）调用」；
 * 误传终局对（dead/won）时这里兜底不记帧——终局 tick 不产生 TickFrame 是硬不变量。
 */
export function recordTick(rec: Recording, prev: SnakeState, next: SnakeState): void {
  if (next.status !== "running") return; // 终局 tick 蛇身不动，无可记增量
  const prevTail = prev.cells[prev.cells.length - 1];
  const nextTail = next.cells[next.cells.length - 1];
  rec.frames.push({
    t: next.tick,
    d: next.dir,
    h: { ...next.cells[0] },
    tail: sameCell(prevTail, nextTail) ? 0 : 1,
    f: next.food ? { ...next.food } : null,
    s: next.score,
  });
}

export function recordEvent(
  rec: Recording,
  type: LifeEventType,
  tick: number,
  cause?: DeathCause | "win",
): void {
  rec.events.push(cause === undefined ? { type, tick } : { type, tick, cause });
}

export function finishRecording(
  rec: Recording,
  state: SnakeState,
  endedAt: number,
  cause?: DeathCause | "win",
): void {
  rec.endedAt = endedAt;
  rec.final = {
    status: state.status,
    ...(cause === undefined ? {} : { cause }),
    score: state.score,
    ticks: state.tick,
  };
}

/** start 蛇身 + 增量逐帧展开全蛇身。纯函数：不 mutate rec，输出帧引用独立。 */
export function expandRecording(rec: Recording): ReplayFrame[] {
  const out: ReplayFrame[] = [];
  let cells = rec.start.map((c) => ({ ...c }));
  for (const f of rec.frames) {
    // 新头插队首；未进食（tail=1）则尾格让位
    cells = [f.h, ...cells];
    if (f.tail === 1) cells.pop();
    out.push({
      tick: f.t,
      cells: cells.map((c) => ({ ...c })),
      dir: f.d,
      food: f.f ? { ...f.f } : null,
      score: f.s,
    });
  }
  return out;
}

/** 读侧守卫：version/skinId/帧形状/事件类型合法才放行。 */
export function isWellFormedRecording(r: unknown): r is Recording {
  if (typeof r !== "object" || r === null) return false;
  const rec = r as Recording;
  if (rec.version !== 1) return false;
  if (typeof rec.skinId !== "string") return false;
  if (!Array.isArray(rec.frames)) return false;
  if (!Array.isArray(rec.events)) return false;
  if (!Array.isArray(rec.start) || !rec.start.every(inBoundsCell)) return false;
  const legalTypes: readonly LifeEventType[] = ["start", "pause", "resume", "end"];
  for (const e of rec.events) {
    if (typeof e !== "object" || e === null) return false;
    if (!legalTypes.includes(e.type)) return false;
    if (typeof e.tick !== "number") return false;
  }
  for (const f of rec.frames) {
    if (typeof f !== "object" || f === null) return false;
    if (!inBoundsCell(f.h)) return false;
    if (f.tail !== 0 && f.tail !== 1) return false;
    if (!DIRECTIONS.includes(f.d)) return false;
    if (typeof f.s !== "number") return false;
    if (typeof f.t !== "number") return false;
    if (f.f !== null && !inBoundsCell(f.f)) return false;
  }
  return true;
}
