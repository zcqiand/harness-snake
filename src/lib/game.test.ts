import { describe, expect, it } from "vitest";
import {
  createInitialState,
  filterInput,
  FOOD_POINTS,
  placeFood,
  step,
  turn,
  type Cell,
  type SnakeState,
} from "./game";

/** 恒取第 0 个候选的假 rng（可微调：按索引返回递增分数）。 */
const rng0 = () => 0;

/** 撞墙态：头 {19,10} dir right，再走一步出界。 */
function wallState(): SnakeState {
  return {
    cells: [
      { x: 19, y: 10 },
      { x: 18, y: 10 },
      { x: 17, y: 10 },
    ],
    dir: "right",
    food: { x: 2, y: 2 },
    score: 0,
    status: "running",
    tick: 5,
  };
}

/** 咬身态：U 形弯，头 {5,10} dir down，新头格 {5,11} 已是身格（非尾）。 */
function selfBiteState(): SnakeState {
  return {
    cells: [
      { x: 5, y: 10 },
      { x: 4, y: 10 },
      { x: 4, y: 11 },
      { x: 5, y: 11 },
      { x: 6, y: 11 },
    ],
    dir: "down",
    food: { x: 15, y: 5 },
    score: 0,
    status: "running",
    tick: 0,
  };
}

/** 追尾态：头 {5,10} dir right，新头格 {6,10} 恰为当前尾格；不吃食物。 */
function tailChaseState(): SnakeState {
  return {
    cells: [
      { x: 5, y: 10 },
      { x: 4, y: 10 },
      { x: 4, y: 9 },
      { x: 5, y: 9 },
      { x: 6, y: 9 },
      { x: 6, y: 10 },
    ],
    dir: "right",
    food: { x: 0, y: 0 },
    score: 0,
    status: "running",
    tick: 0,
  };
}

/** 通关前夜：长 399 蛇占满除 {0,0} 外全板，头 {1,0} dir left，食物在最后空格 {0,0}。 */
function nearWinState(): SnakeState {
  const cells: Cell[] = [{ x: 1, y: 0 }];
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if ((x === 0 && y === 0) || (x === 1 && y === 0)) continue;
      cells.push({ x, y });
    }
  }
  return { cells, dir: "left", food: { x: 0, y: 0 }, score: 3980, status: "running", tick: 100 };
}

describe("createInitialState", () => {
  it("初始 3 节、头 {x:9,y:10}、dir right、score 0、tick 0、status running", () => {
    const s = createInitialState(rng0);
    expect(s.cells).toHaveLength(3);
    expect(s.cells[0]).toEqual({ x: 9, y: 10 });
    expect(s.dir).toBe("right");
    expect(s.score).toBe(0);
    expect(s.tick).toBe(0);
    expect(s.status).toBe("running");
  });

  it("初始食物不在蛇身上", () => {
    const s = createInitialState(rng0);
    expect(s.food).not.toBeNull();
    expect(s.cells.some((c) => c.x === s.food!.x && c.y === s.food!.y)).toBe(false);
  });
});

describe("filterInput", () => {
  it("right→left 返回 null", () => {
    expect(filterInput("right", "left")).toBeNull();
  });

  it("right→right 返回 null", () => {
    expect(filterInput("right", "right")).toBeNull();
  });

  it('right→up 返回 "up"', () => {
    expect(filterInput("right", "up")).toBe("up");
  });

  it("四种 180° 组合全 null", () => {
    expect(filterInput("up", "down")).toBeNull();
    expect(filterInput("down", "up")).toBeNull();
    expect(filterInput("left", "right")).toBeNull();
    expect(filterInput("right", "left")).toBeNull();
  });
});

describe("turn", () => {
  it("running 时合法转向生效", () => {
    const s = createInitialState(rng0);
    expect(turn(s, "up").dir).toBe("up");
  });

  it("running 时反向转向不变", () => {
    const s = createInitialState(rng0);
    expect(turn(s, "left").dir).toBe("right");
  });

  it("paused 时转向不生效", () => {
    const s = { ...createInitialState(rng0), status: "paused" as const };
    expect(turn(s, "up").dir).toBe("right");
  });
});

describe("step 前进", () => {
  it("普通 tick 头进一格、尾格移除、tick+1、event move", () => {
    const s = createInitialState(rng0);
    const { state, event } = step(s, rng0);
    expect(event).toBe("move");
    expect(state.cells[0]).toEqual({ x: 10, y: 10 });
    expect(state.cells).toEqual([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    expect(state.tick).toBe(1);
    expect(state.status).toBe("running");
  });
});

describe("step 撞墙", () => {
  it("出界 → status dead、event wall、cells 不变、tick+1", () => {
    const s = wallState();
    const { state, event } = step(s, rng0);
    expect(event).toBe("wall");
    expect(state.status).toBe("dead");
    expect(state.cells).toEqual(s.cells);
    expect(state.tick).toBe(6);
  });
});

describe("step 咬自身", () => {
  it("新头进身格 → dead、event self、cells 不变", () => {
    const s = selfBiteState();
    const { state, event } = step(s, rng0);
    expect(event).toBe("self");
    expect(state.status).toBe("dead");
    expect(state.cells).toEqual(s.cells);
  });
});

describe("step 咬尾尖豁免", () => {
  it("追尾形态（新头格==当前尾格且不进食）→ 存活，尾格让位", () => {
    const s = tailChaseState();
    const { state, event } = step(s, rng0);
    expect(event).toBe("move");
    expect(state.status).toBe("running");
    expect(state.cells[0]).toEqual({ x: 6, y: 10 });
    expect(state.cells).toHaveLength(6);
  });
});

describe("step 吃食物", () => {
  it("头进食物格 → score +FOOD_POINTS、长度 +1（尾不移除）、event food、食物换新位且不在身上", () => {
    const s = createInitialState(rng0);
    s.food = { x: 10, y: 10 }; // 头进一格即食物格
    const { state, event } = step(s, rng0);
    expect(event).toBe("food");
    expect(state.score).toBe(FOOD_POINTS);
    expect(state.cells).toHaveLength(4);
    expect(state.cells[0]).toEqual({ x: 10, y: 10 });
    expect(state.food).not.toBeNull();
    expect(state.cells.some((c) => c.x === state.food!.x && c.y === state.food!.y)).toBe(false);
    expect(state.tick).toBe(1);
  });
});

describe("step 通关边界", () => {
  it("长 399 蛇吃下最后 1 空格食物 → status won、food null、event win", () => {
    const s = nearWinState();
    const { state, event } = step(s, rng0);
    expect(event).toBe("win");
    expect(state.status).toBe("won");
    expect(state.food).toBeNull();
    expect(state.cells).toHaveLength(400);
    expect(state.score).toBe(3980 + FOOD_POINTS);
  });
});

describe("step 非 running 原样返回", () => {
  it("dead 状态 step → state 深相等、event move", () => {
    const s = { ...createInitialState(rng0), status: "dead" as const };
    const { state, event } = step(s, rng0);
    expect(event).toBe("move");
    expect(state).toEqual(s);
  });

  it("paused 状态 step → state 深相等、event move", () => {
    const s = { ...createInitialState(rng0), status: "paused" as const };
    const { state, event } = step(s, rng0);
    expect(event).toBe("move");
    expect(state).toEqual(s);
  });
});

describe("placeFood", () => {
  it("唯一空格命中该格", () => {
    const occupied: Cell[] = [];
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (!(x === 13 && y === 7)) occupied.push({ x, y });
      }
    }
    expect(placeFood(occupied, rng0)).toEqual({ x: 13, y: 7 });
  });

  it("0 空格返回 null", () => {
    const occupied: Cell[] = [];
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) occupied.push({ x, y });
    }
    expect(placeFood(occupied, rng0)).toBeNull();
  });

  it("结果必不在 occupied", () => {
    const s = createInitialState(rng0);
    for (const r of [0, 0.3, 0.7, 0.999]) {
      const f = placeFood(s.cells, () => r);
      expect(f).not.toBeNull();
      expect(s.cells.some((c) => c.x === f!.x && c.y === f!.y)).toBe(false);
    }
  });
});
