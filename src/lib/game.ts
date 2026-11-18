/** 贪吃蛇核心纯逻辑——移动/三分支碰撞/食物/终态。随机一律经注入 rng，模块内不直接调 Math.random/Date.now。 */

export type Direction = "up" | "down" | "left" | "right";

export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

/** x=列 0..19, y=行 0..19 */
export interface Cell {
  x: number;
  y: number;
}

export type DeathCause = "wall" | "self";

export type GameStatus = "running" | "paused" | "dead" | "won";

export interface SnakeState {
  cells: Cell[]; // index 0 = 头
  dir: Direction;
  food: Cell | null; // null 仅当 won
  score: number;
  status: GameStatus;
  tick: number;
}

export type TickEvent = "move" | "food" | "wall" | "self" | "win";

export interface StepResult {
  state: SnakeState;
  event: TickEvent;
}

export const FOOD_POINTS = 10;
export const INITIAL_DIR: Direction = "right";
export const INITIAL_CELLS: readonly Cell[] = [
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
];

// 坐标界在本模块定义——网格语义与 board.ts 不同，不动骨架模块
const BOARD_ROWS = 20;
const BOARD_COLS = 20;

const DELTA: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const cellKey = (c: Cell) => `${c.x},${c.y}`;

const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export function createInitialState(rng: () => number): SnakeState {
  return {
    // 拷贝一份，避免状态变更污染常量
    cells: [...INITIAL_CELLS],
    dir: INITIAL_DIR,
    food: placeFood(INITIAL_CELLS, rng),
    score: 0,
    status: "running",
    tick: 0,
  };
}

/** 同向或 180° 都忽略（返回 null），其余放行。 */
export function filterInput(current: Direction, next: Direction): Direction | null {
  if (next === current || next === OPPOSITE[current]) return null;
  return next;
}

export function turn(state: SnakeState, dir: Direction): SnakeState {
  if (state.status !== "running") return state;
  const next = filterInput(state.dir, dir);
  if (next === null) return state;
  return { ...state, dir: next };
}

/** 在空格中均匀抽样；0 空格（满板）→ null。 */
export function placeFood(occupied: readonly Cell[], rng: () => number): Cell | null {
  const taken = new Set(occupied.map(cellKey));
  const empty: Cell[] = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (!taken.has(cellKey({ x, y }))) empty.push({ x, y });
    }
  }
  if (empty.length === 0) return null;
  // 注入 rng 契约面下极端值（rng()=1 / 负数）clamp 落界内，不越界 undefined
  return empty[Math.min(empty.length - 1, Math.max(0, Math.floor(rng() * empty.length)))];
}

export function step(state: SnakeState, rng: () => number): StepResult {
  if (state.status !== "running") return { state, event: "move" };

  const d = DELTA[state.dir];
  const head = state.cells[0];
  const newHead = { x: head.x + d.x, y: head.y + d.y };

  // 分支一：越界即撞墙，蛇身不动
  if (newHead.x < 0 || newHead.x >= BOARD_COLS || newHead.y < 0 || newHead.y >= BOARD_ROWS) {
    return { state: { ...state, status: "dead", tick: state.tick + 1 }, event: "wall" };
  }

  const eating = state.food !== null && sameCell(newHead, state.food);

  // 分支二：咬身——不进食时尾格让位，追尾不算咬到自己
  const bodyCells = eating ? state.cells : state.cells.slice(0, -1);
  if (bodyCells.some((c) => sameCell(newHead, c))) {
    return { state: { ...state, status: "dead", tick: state.tick + 1 }, event: "self" };
  }

  const cells = [newHead, ...bodyCells];
  if (!eating) {
    return { state: { ...state, cells, tick: state.tick + 1 }, event: "move" };
  }

  // 分支三：进食——尾不移除，换新食物；满板无空格即通关
  const score = state.score + FOOD_POINTS;
  const food = placeFood(cells, rng);
  if (food === null) {
    return {
      state: { ...state, cells, score, food: null, status: "won", tick: state.tick + 1 },
      event: "win",
    };
  }
  return { state: { ...state, cells, score, food, tick: state.tick + 1 }, event: "food" };
}
