import { describe, expect, it } from "vitest";
import { createInitialState, INITIAL_CELLS, step, type SnakeState } from "./game";
import {
  createRecording,
  expandRecording,
  finishRecording,
  isWellFormedRecording,
  recordEvent,
  recordTick,
} from "./recorder";

/** 恒取第 0 个候选的假 rng（与 game.test.ts 同款）。 */
const rng0 = () => 0;

/** 从开局一直向右走到撞墙，返回终局 step 的 prev/next 对。 */
function wallPrevNext(): { prev: SnakeState; next: SnakeState } {
  let prev = createInitialState(rng0);
  let r = step(prev, rng0);
  while (r.event !== "wall") {
    prev = r.state;
    r = step(prev, rng0);
  }
  return { prev, next: r.state };
}

describe("createRecording", () => {
  it("version 1、start 深等于 INITIAL_CELLS、frames/events 空、final null", () => {
    const rec = createRecording("classic", 1234);
    expect(rec.version).toBe(1);
    expect(rec.skinId).toBe("classic");
    expect(rec.startedAt).toBe(1234);
    expect(rec.endedAt).toBeNull();
    expect(rec.start).toEqual(INITIAL_CELLS);
    expect(rec.frames).toEqual([]);
    expect(rec.events).toEqual([]);
    expect(rec.final).toBeNull();
  });

  it("start 是独立快照——改 rec.start 不污染 INITIAL_CELLS", () => {
    const rec = createRecording("classic", 0);
    rec.start[0].x = 999;
    expect(INITIAL_CELLS[0].x).toBe(9);
  });
});

describe("recordTick", () => {
  it("move 帧：{t:1, d, h:新头, tail:1, f:食物原位, s:0}", () => {
    const prev = createInitialState(rng0);
    const r = step(prev, rng0);
    expect(r.event).toBe("move");
    const rec = createRecording("classic", 0);
    recordTick(rec, prev, r.state);
    expect(rec.frames).toEqual([
      { t: 1, d: "right", h: { x: 10, y: 10 }, tail: 1, f: { x: 0, y: 0 }, s: 0 },
    ]);
  });

  it("food 帧：tail:0、s:10、f 为新食物位（不再是旧食物位）", () => {
    const prev = createInitialState(rng0);
    prev.food = { x: 10, y: 10 }; // 头进一格即食物格
    const r = step(prev, rng0);
    expect(r.event).toBe("food");
    const rec = createRecording("classic", 0);
    recordTick(rec, prev, r.state);
    expect(rec.frames).toHaveLength(1);
    expect(rec.frames[0].tail).toBe(0);
    expect(rec.frames[0].s).toBe(10);
    expect(rec.frames[0].f).toEqual(r.state.food);
    expect(rec.frames[0].f).not.toEqual({ x: 10, y: 10 });
  });

  it("终局 tick 不产生帧——撞墙 step 后 recordTick 不入 frames", () => {
    const { prev, next } = wallPrevNext();
    expect(next.status).toBe("dead");
    const rec = createRecording("classic", 0);
    recordTick(rec, prev, next);
    expect(rec.frames).toEqual([]);
  });
});

describe("recordEvent / finishRecording", () => {
  it("pause/resume 入 events", () => {
    const rec = createRecording("classic", 0);
    recordEvent(rec, "pause", 3);
    recordEvent(rec, "resume", 4);
    expect(rec.events).toEqual([
      { type: "pause", tick: 3 },
      { type: "resume", tick: 4 },
    ]);
  });

  it("终局 end 事件 + finishRecording → final 与 endedAt 落值", () => {
    const { prev, next } = wallPrevNext();
    const rec = createRecording("classic", 0);
    recordEvent(rec, "end", next.tick, "wall");
    finishRecording(rec, next, 5000, "wall");
    expect(rec.events).toEqual([{ type: "end", tick: next.tick, cause: "wall" }]);
    expect(rec.final).toEqual({
      status: "dead",
      cause: "wall",
      score: next.score,
      ticks: next.tick,
    });
    expect(rec.endedAt).toBe(5000);
    // 终局蛇身与 prev 相同（不记帧语义成立的前提）
    expect(next.cells).toEqual(prev.cells);
  });
});

describe("expandRecording", () => {
  it("3 帧记录展开：move 长 3→3→3、food 后 4，头/dir/food/score 逐帧正确", () => {
    const rec = createRecording("classic", 0);
    let prev = createInitialState(rng0);

    // tick1/tick2：普通 move
    for (let i = 0; i < 2; i++) {
      const r = step(prev, rng0);
      expect(r.event).toBe("move");
      recordTick(rec, prev, r.state);
      prev = r.state;
    }
    // tick3：把食物放到正前方一格，制造进食帧
    prev.food = { x: 12, y: 10 };
    const r3 = step(prev, rng0);
    expect(r3.event).toBe("food");
    recordTick(rec, prev, r3.state);

    expect(rec.frames).toHaveLength(3);
    const replay = expandRecording(rec);
    expect(replay).toHaveLength(3);

    // 蛇身长度：move 帧 3，food 帧后 4
    expect(replay[0].cells).toHaveLength(3);
    expect(replay[1].cells).toHaveLength(3);
    expect(replay[2].cells).toHaveLength(4);
    // 连续性：帧间头进尾退 / 进食只进不退
    expect(replay[0].cells).toEqual([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    expect(replay[1].cells).toEqual([
      { x: 11, y: 10 },
      { x: 10, y: 10 },
      { x: 9, y: 10 },
    ]);
    expect(replay[2].cells).toEqual([
      { x: 12, y: 10 },
      { x: 11, y: 10 },
      { x: 10, y: 10 },
      { x: 9, y: 10 },
    ]);
    // 头一致、dir/food/score 逐帧取自捕获帧
    rec.frames.forEach((f, i) => {
      expect(replay[i].cells[0]).toEqual(f.h);
      expect(replay[i].dir).toBe(f.d);
      expect(replay[i].tick).toBe(f.t);
      expect(replay[i].food).toEqual(f.f);
      expect(replay[i].score).toBe(f.s);
    });
    // 纯函数：重复展开结果一致
    expect(expandRecording(rec)).toEqual(replay);
  });
});

describe("isWellFormedRecording", () => {
  /** 良构基线：真跑一局的记录。 */
  function wellFormed() {
    const rec = createRecording("classic", 0);
    const prev = createInitialState(rng0);
    const r = step(prev, rng0);
    recordTick(rec, prev, r.state);
    recordEvent(rec, "end", r.state.tick, "wall");
    finishRecording(rec, r.state, 100, "wall");
    return rec;
  }

  it("良构真记录 → true", () => {
    expect(isWellFormedRecording(wellFormed())).toBe(true);
  });

  it("非对象 / null → false", () => {
    expect(isWellFormedRecording(null)).toBe(false);
    expect(isWellFormedRecording(42)).toBe(false);
    expect(isWellFormedRecording("rec")).toBe(false);
  });

  it("version≠1 → false", () => {
    const bad = { ...wellFormed(), version: 2 };
    expect(isWellFormedRecording(bad)).toBe(false);
  });

  it("帧 h 越界 → false", () => {
    const rec = wellFormed();
    const bad = {
      ...rec,
      frames: [{ ...rec.frames[0], h: { x: 99, y: 0 } }],
    };
    expect(isWellFormedRecording(bad)).toBe(false);
  });

  it("tail=2 → false", () => {
    const rec = wellFormed();
    const bad = { ...rec, frames: [{ ...rec.frames[0], tail: 2 }] };
    expect(isWellFormedRecording(bad)).toBe(false);
  });

  it("d 非法方向 → false", () => {
    const rec = wellFormed();
    const bad = { ...rec, frames: [{ ...rec.frames[0], d: "diagonal" }] };
    expect(isWellFormedRecording(bad)).toBe(false);
  });

  it("events 含非法 type → false", () => {
    const rec = wellFormed();
    const bad = { ...rec, events: [{ type: "rewind", tick: 1 }] };
    expect(isWellFormedRecording(bad)).toBe(false);
  });

  it("frames 非数组 → false", () => {
    const bad = { ...wellFormed(), frames: "nope" };
    expect(isWellFormedRecording(bad)).toBe(false);
  });
});
