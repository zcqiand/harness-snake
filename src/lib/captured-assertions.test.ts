import { describe, expect, it } from "vitest";
import {
  createInitialState,
  step,
  turn,
  type Cell,
  type Direction,
  type SnakeState,
} from "./game";
import {
  createRecording,
  expandRecording,
  finishRecording,
  recordEvent,
  recordTick,
  type Recording,
} from "./recorder";

/** mulberry32 种子化 rng——三局模拟全部确定性，无 Math.random。 */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

const outOfBounds = (c: Cell) => c.x < 0 || c.x > 19 || c.y < 0 || c.y > 19;

/**
 * 朝目标贪心走：优先未对齐轴里不被 180° 滤掉的那个；
 * 两轴都被滤（一轴已对齐、另一轴需掉头）→ 垂直方向蹭一格制造错位。
 * 目标恒在界内、路径单调 → 不会撞墙。
 */
function toward(head: Cell, target: Cell, dir: Direction): Direction {
  const xWant = target.x > head.x ? "right" : target.x < head.x ? "left" : null;
  const yWant = target.y > head.y ? "down" : target.y < head.y ? "up" : null;
  if (xWant && xWant !== OPPOSITE[dir]) return xWant;
  if (yWant && yWant !== OPPOSITE[dir]) return yWant;
  if (xWant === null) return head.x === 0 ? "right" : "left"; // y 需掉头：横向蹭
  return head.y === 0 ? "down" : "up"; // x 需掉头：纵向蹭
}

/**
 * 三局共用驱动：种子化 rng，逐 tick turn+step；
 * 非终局 tick（move/food）recordTick，终局 tick 蛇身不动——走 end 事件 + finishRecording 路径。
 */
function playScripted(
  seed: number,
  policy: (s: SnakeState) => Direction,
  maxTicks = 500,
): Recording {
  const rng = seededRng(seed);
  const rec = createRecording("scripted", 0);
  recordEvent(rec, "start", 0);
  let s = createInitialState(rng);
  for (let i = 0; i < maxTicks && s.status === "running"; i++) {
    s = turn(s, policy(s));
    const r = step(s, rng);
    if (r.event === "move" || r.event === "food") {
      recordTick(rec, s, r.state);
    } else {
      const cause = r.event === "win" ? "win" : r.event;
      recordEvent(rec, "end", r.state.tick, cause);
      finishRecording(rec, r.state, i + 1, cause);
    }
    s = r.state;
  }
  return rec;
}

describe("书 ch8 原题「按捕获数据写断言」——三局脚本化模拟", () => {
  it("撞墙局：final cause=wall，末帧 h 沿末帧 d 前进一格出界", () => {
    const rec = playScripted(20261118, () => "right");
    expect(rec.final).not.toBeNull();
    expect(rec.final!.cause).toBe("wall");
    expect(rec.frames.length).toBeGreaterThan(0);

    const lastF = rec.frames[rec.frames.length - 1];
    const nh = { x: lastF.h.x + DELTA[lastF.d].x, y: lastF.h.y + DELTA[lastF.d].y };
    expect(outOfBounds(nh)).toBe(true);
    // 死亡帧蛇身不动：末帧展开蛇身即终局蛇身
    const replay = expandRecording(rec);
    expect(replay[replay.length - 1].cells[0]).toEqual(lastF.h);
  });

  it("咬自身局：final cause=self，末帧 h 沿末帧 d 前进一格落入该帧蛇身（除头）", () => {
    // 脚本：吃到 9 口（长 12）→ 沿 y=6 从 x=3 铺到 x=12（横排）→ 上 4 → 左 1 →
    // 直落 x=11 列，第 4 步踩回横排 {11,6}（距首次到访 10 步 < 长 12-1）→ 咬死。
    // 死亡 tick 无转向（直行），末帧 h+d 前进一格 == 死亡落点。
    const T0: Cell = { x: 1, y: 6 };
    const T1: Cell = { x: 2, y: 6 };
    let phase: "chase" | "goto" | "pattern" = "chase";
    let pt = 0;
    const rec = playScripted(20261118, (s) => {
      const head = s.cells[0];
      if (s.score < 90) return toward(head, s.food ?? { x: 10, y: 10 }, s.dir);
      if (phase === "chase") phase = "goto"; // 满 9 口：先驶到横排西端
      if (phase === "goto") {
        if (head.x === T0.x && head.y === T0.y) return toward(head, T1, s.dir);
        if (head.x === T1.x && head.y === T1.y) phase = "pattern"; // 已向右进入起点
        else return toward(head, T0, s.dir);
      }
      // pattern 相：右 10 / 上 4 / 左 1 / 直落——死亡落在下落段的直行 tick
      const d: Direction = pt < 10 ? "right" : pt < 14 ? "up" : pt === 14 ? "left" : "down";
      pt++;
      return d;
    });

    expect(rec.final).not.toBeNull();
    expect(rec.final!.cause).toBe("self");

    const lastF = rec.frames[rec.frames.length - 1];
    const nh = { x: lastF.h.x + DELTA[lastF.d].x, y: lastF.h.y + DELTA[lastF.d].y };
    const replay = expandRecording(rec);
    const bodyExceptHead = replay[replay.length - 1].cells.slice(1);
    expect(bodyExceptHead.some((c) => c.x === nh.x && c.y === nh.y)).toBe(true);
  });

  it("吃食物局：存在 tail:0 帧，且其 s 比前一帧恰 +10", () => {
    // 脚本：追食物吃到 3 口后直行收尾（直行不咬身，必以撞墙终局）
    const rec = playScripted(20261118, (s) => {
      if (s.score >= 30) return s.dir;
      return toward(s.cells[0], s.food ?? { x: 10, y: 10 }, s.dir);
    });

    expect(rec.final).not.toBeNull();
    const idx = rec.frames.findIndex(
      (f, i) => i > 0 && f.tail === 0 && f.s === rec.frames[i - 1].s + 10,
    );
    expect(idx).toBeGreaterThan(0);
    // 该帧确实是进食帧：展开后蛇身比上一帧多 1
    const replay = expandRecording(rec);
    expect(replay[idx].cells.length).toBe(replay[idx - 1].cells.length + 1);
  });
});
