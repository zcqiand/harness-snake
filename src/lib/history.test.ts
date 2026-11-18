import { describe, expect, it } from "vitest";
import { DEFAULT_SKIN_ID } from "../config/skins";
import { createInitialState, step, type DeathCause } from "./game";
import { createRecording, finishRecording, recordTick, type Recording } from "./recorder";
import { bestScore, LAST_RUN_KEY, loadLastRun, loadScores, loadSkinId, MemoryStorage, safeLocalStorage, saveLastRun, saveScore, saveSkinId, SCORES_KEY, SKIN_KEY, type ScoreEntry } from "./history";

/** 内存假 Storage——Map 实现，2048 同款手写，零依赖。 */
class FakeStorage implements Storage {
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

/** 从开局走到撞墙的真 Recording——loadLastRun 往返测试用。 */
function realRecording(): Recording {
  const rec = createRecording("classic", 1000);
  const rng = () => 0;
  let prev = createInitialState(rng);
  let r = step(prev, rng);
  while (r.event !== "wall") {
    recordTick(rec, prev, r.state);
    prev = r.state;
    r = step(prev, rng);
  }
  finishRecording(rec, r.state, 9999, "wall");
  return rec;
}

/** 版本/皮肤/数组/事件全合法、唯独 frames 带 tail:2 的畸形 Recording。tail:2 出不了 0|1 类型，对象字面量后 as 断言。 */
function badTailRecording(): Recording {
  return {
    version: 1,
    skinId: "classic",
    startedAt: 0,
    endedAt: 0,
    start: [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }],
    events: [{ type: "start", tick: 0 }],
    frames: [{ t: 1, d: "right", h: { x: 10, y: 10 }, tail: 2, f: { x: 0, y: 0 }, s: 0 }],
    final: { status: "dead", cause: "wall", score: 0, ticks: 1 },
  } as unknown as Recording;
}

const entry = (overrides: Partial<ScoreEntry> = {}): ScoreEntry => ({
  skinId: "classic",
  score: 30,
  ticks: 12,
  endedAt: 100,
  cause: "wall" as DeathCause | "win",
  ...overrides,
});

describe("loadScores", () => {
  it("空 storage 缺键→[]", () => {
    expect(loadScores(new FakeStorage())).toEqual([]);
  });

  it("乱 JSON 'not-json'→[]", () => {
    const s = new FakeStorage();
    s.setItem(SCORES_KEY, "not-json");
    expect(loadScores(s)).toEqual([]);
  });

  it("JSON 但非数组→[]", () => {
    const s = new FakeStorage();
    s.setItem(SCORES_KEY, JSON.stringify({ skinId: "classic" }));
    expect(loadScores(s)).toEqual([]);
  });

  it("净化：skinId 非串/缺 score/score 字符串/cause 非法的条目剔除，良构条目保序保留", () => {
    const s = new FakeStorage();
    s.setItem(
      SCORES_KEY,
      JSON.stringify([
        { skinId: 7, score: 10, ticks: 1, endedAt: 1, cause: "wall" }, // skinId 非串
        { skinId: "classic", ticks: 1, endedAt: 1, cause: "wall" }, // 缺 score
        { skinId: "classic", score: "10", ticks: 1, endedAt: 1, cause: "wall" }, // score 字符串
        { skinId: "classic", score: 10, ticks: 1, endedAt: 1, cause: "meteor" }, // cause 非法
        entry({ score: 20, ticks: 5, endedAt: 50 }), // 良构 1
        entry({ skinId: "snake", score: 40, ticks: 9, endedAt: 90, cause: "win" }), // 良构 2
      ]),
    );
    expect(loadScores(s)).toEqual([
      entry({ score: 20, ticks: 5, endedAt: 50 }),
      entry({ skinId: "snake", score: 40, ticks: 9, endedAt: 90, cause: "win" }),
    ]);
  });
});

describe("saveScore / loadScores 往返", () => {
  it("写一条→读回相等", () => {
    const s = new FakeStorage();
    const e = entry({ score: 70, ticks: 22, endedAt: 222 });
    saveScore(s, e);
    expect(loadScores(s)).toEqual([e]);
  });

  it("多条追加不覆盖", () => {
    const s = new FakeStorage();
    const a = entry({ score: 10, endedAt: 1 });
    const b = entry({ score: 20, endedAt: 2 });
    const c = entry({ skinId: "snake", score: 30, endedAt: 3 });
    saveScore(s, a);
    saveScore(s, b);
    saveScore(s, c);
    expect(loadScores(s)).toEqual([a, b, c]);
  });

  it("写侧 setItem 抛错（quota）静默不炸", () => {
    const s = new FakeStorage();
    s.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveScore(s, entry())).not.toThrow();
    expect(() => saveLastRun(s, realRecording())).not.toThrow();
  });
});

describe("bestScore", () => {
  it("按 skinId 过滤取 max", () => {
    const scores = [
      entry({ score: 10 }),
      entry({ score: 50 }),
      entry({ score: 30 }),
    ];
    expect(bestScore(scores, "classic")).toBe(50);
  });

  it("异皮肤不串账", () => {
    const scores = [
      entry({ skinId: "classic", score: 10 }),
      entry({ skinId: "snake", score: 99 }),
    ];
    expect(bestScore(scores, "classic")).toBe(10);
    expect(bestScore(scores, "snake")).toBe(99);
    expect(bestScore(scores, "none")).toBe(0);
  });

  it("空数组→0", () => {
    expect(bestScore([], "classic")).toBe(0);
  });
});

describe("loadSkinId / saveSkinId", () => {
  it("缺键→DEFAULT_SKIN_ID", () => {
    expect(loadSkinId(new FakeStorage())).toBe(DEFAULT_SKIN_ID);
  });

  it("合法皮肤 id 原样读回", () => {
    const s = new FakeStorage();
    s.setItem(SKIN_KEY, "handheld");
    expect(loadSkinId(s)).toBe("handheld");
  });

  it("非法值（不在 SKINS 中）→DEFAULT_SKIN_ID", () => {
    const s = new FakeStorage();
    s.setItem(SKIN_KEY, "classic");
    expect(loadSkinId(s)).toBe(DEFAULT_SKIN_ID);
    s.setItem(SKIN_KEY, "not-a-skin");
    expect(loadSkinId(s)).toBe(DEFAULT_SKIN_ID);
  });

  it("saveSkinId→loadSkinId 往返", () => {
    const s = new FakeStorage();
    saveSkinId(s, "handheld");
    expect(loadSkinId(s)).toBe("handheld");
  });

  it("写侧 setItem 抛错（quota）静默不炸", () => {
    const s = new FakeStorage();
    s.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveSkinId(s, "handheld")).not.toThrow();
  });
});

describe("loadLastRun / saveLastRun", () => {
  it("缺键→null", () => {
    expect(loadLastRun(new FakeStorage())).toBeNull();
  });

  it("乱 JSON→null", () => {
    const s = new FakeStorage();
    s.setItem(LAST_RUN_KEY, "not-json");
    expect(loadLastRun(s)).toBeNull();
  });

  it("isWellFormedRecording 不过（帧 tail=2）→null", () => {
    const s = new FakeStorage();
    s.setItem(LAST_RUN_KEY, JSON.stringify(badTailRecording()));
    expect(loadLastRun(s)).toBeNull();
  });

  it("真 Recording 往返相等", () => {
    const s = new FakeStorage();
    const rec = realRecording();
    saveLastRun(s, rec);
    expect(loadLastRun(s)).toEqual(rec);
  });
});

describe("MemoryStorage 假件", () => {
  it("缺键 getItem→null；set/get 往返", () => {
    const s = new MemoryStorage();
    expect(s.getItem("k")).toBeNull();
    s.setItem("k", "v1");
    expect(s.getItem("k")).toBe("v1");
    s.setItem("k", "v2");
    expect(s.getItem("k")).toBe("v2");
  });

  it("removeItem 后回到缺键；length 随键数变化；key(i) 按 key 序取", () => {
    const s = new MemoryStorage();
    s.setItem("a", "1");
    s.setItem("b", "2");
    expect(s.length).toBe(2);
    expect(s.key(0)).toBe("a");
    expect(s.key(1)).toBe("b");
    expect(s.key(2)).toBeNull();
    s.removeItem("a");
    expect(s.getItem("a")).toBeNull();
    expect(s.length).toBe(1);
    s.clear();
    expect(s.length).toBe(0);
    expect(s.getItem("b")).toBeNull();
  });
});

describe("safeLocalStorage", () => {
  /** 把 globalThis.localStorage 换成「属性访问即抛」的 getter——浏览器阻止所有 cookie 同形状。 */
  function stubThrowingLocalStorage(): void {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: blocked cookies");
      },
    });
  }

  function restoreLocalStorage(): void {
    // delete 后回到环境原状（node 无此键=undefined）
    Reflect.deleteProperty(globalThis, "localStorage");
  }

  it("localStorage 访问抛错→回落 MemoryStorage", () => {
    stubThrowingLocalStorage();
    try {
      const s = safeLocalStorage();
      expect(s).toBeInstanceOf(MemoryStorage);
    } finally {
      restoreLocalStorage();
    }
  });

  it("回落假件上 loadSkinId/loadScores/loadLastRun 全部安全返回默认值", () => {
    stubThrowingLocalStorage();
    try {
      const s = safeLocalStorage();
      expect(loadSkinId(s)).toBe(DEFAULT_SKIN_ID);
      expect(loadScores(s)).toEqual([]);
      expect(loadLastRun(s)).toBeNull();
    } finally {
      restoreLocalStorage();
    }
  });

  it("回落假件可用（读写不抛）", () => {
    stubThrowingLocalStorage();
    try {
      const s = safeLocalStorage();
      expect(() => saveScore(s, entry())).not.toThrow();
      expect(loadScores(s)).toEqual([entry()]);
    } finally {
      restoreLocalStorage();
    }
  });
});
