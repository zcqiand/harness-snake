import { describe, it, expect } from "vitest";
import { FOOD_POINTS } from "../lib/game";
import { SKINS, DEFAULT_SKIN_ID, getSkin, tickIntervalMs } from "./skins";

const COLOR_KEYS = [
  "bg",
  "board",
  "grid",
  "snake",
  "snakeHead",
  "food",
  "hudAccent",
  "rec",
] as const;

describe("SKINS", () => {
  it("恰两款皮肤，id 含 dashcam 与 handheld", () => {
    expect(SKINS).toHaveLength(2);
    const ids = SKINS.map((s) => s.id);
    expect(ids).toContain("dashcam");
    expect(ids).toContain("handheld");
  });

  it("每款 colors 8 键齐全且都是 # 开头 hex", () => {
    for (const skin of SKINS) {
      expect(Object.keys(skin.colors).sort()).toEqual([...COLOR_KEYS].sort());
      for (const key of COLOR_KEYS) {
        expect(skin.colors[key]).toMatch(/^#[0-9a-fA-F]+$/);
      }
    }
  });

  it("每款有中文显示名", () => {
    for (const skin of SKINS) {
      expect(skin.name.length).toBeGreaterThan(0);
    }
  });
});

describe("getSkin", () => {
  it("undefined 回落 dashcam", () => {
    expect(getSkin(undefined).id).toBe("dashcam");
  });

  it("未知 id 回落 dashcam", () => {
    expect(getSkin("nope").id).toBe("dashcam");
  });

  it("handheld 命中 handheld", () => {
    expect(getSkin("handheld").id).toBe("handheld");
  });
});

describe("tickIntervalMs", () => {
  const dashcam = getSkin("dashcam");

  it("score 0 → 初始 160ms", () => {
    expect(tickIntervalMs(dashcam, 0)).toBe(160);
  });

  it(`score 100（${FOOD_POINTS} 点/食 → 10 食物）→ 130ms`, () => {
    expect(tickIntervalMs(dashcam, 100)).toBe(130);
  });

  it("score 10000 → 触底 60ms 不穿", () => {
    expect(tickIntervalMs(dashcam, 10000)).toBe(60);
  });
});

describe("DEFAULT_SKIN_ID", () => {
  it("指向 dashcam", () => {
    expect(DEFAULT_SKIN_ID).toBe("dashcam");
    expect(getSkin(DEFAULT_SKIN_ID).id).toBe("dashcam");
  });
});
