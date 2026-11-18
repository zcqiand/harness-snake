/** 换皮配置——规则参数（速度曲线）+ 双皮肤颜色。换皮参数只进本文件，禁止硬编码进逻辑。 */
import { FOOD_POINTS } from "../lib/game";

export interface SkinRules {
  initialSpeedMs: number; // 初始 tick 间隔
  minSpeedMs: number; // 加速下限
  accelPerFoodMs: number; // 每吃一食物加快的毫秒数（正数，做减法）
}

export interface SkinConfig {
  id: string;
  name: string; // 中文显示名
  rules: SkinRules;
  colors: {
    bg: string;
    board: string;
    grid: string;
    snake: string;
    snakeHead: string;
    food: string;
    hudAccent: string;
    rec: string;
  };
}

export const SKINS: readonly SkinConfig[] = [
  {
    // 行车记录仪默认皮肤：近黑底 + 荧光绿蛇 + 亮红食物，rec 红点醒目
    id: "dashcam",
    name: "行车记录仪",
    rules: { initialSpeedMs: 160, minSpeedMs: 60, accelPerFoodMs: 3 },
    colors: {
      bg: "#0a0f0a",
      board: "#111a11",
      grid: "#1e2a1e",
      snake: "#39ff6a",
      snakeHead: "#c8ffd8",
      food: "#ff2d2d",
      hudAccent: "#39ff6a",
      rec: "#ff2d2d",
    },
  },
  {
    // 掌机灰绿 LCD 皮肤：浅灰绿底 + 深墨绿蛇，与记录仪观感反差拉满
    id: "handheld",
    name: "掌机灰绿",
    rules: { initialSpeedMs: 180, minSpeedMs: 80, accelPerFoodMs: 2 },
    colors: {
      bg: "#6b7a5e",
      board: "#8a9a7b",
      grid: "#7d8d6f",
      snake: "#2d3a26",
      snakeHead: "#141c10",
      food: "#3d2c1e",
      hudAccent: "#141c10",
      rec: "#8c2f1e",
    },
  },
];

export const DEFAULT_SKIN_ID = "dashcam";

// 默认皮肤直查不递归——getSkin 回落路径零自引用，缺默认配置时显式炸而非栈溢出
const defaultSkin = (): SkinConfig => {
  const hit = SKINS.find((s) => s.id === DEFAULT_SKIN_ID);
  if (!hit) throw new Error(`默认皮肤 ${DEFAULT_SKIN_ID} 不在 SKINS 中`);
  return hit;
};

/** 未知/缺失 id 一律回落默认皮肤——调用方无需自己兜底 */
export function getSkin(id: string | undefined): SkinConfig {
  return SKINS.find((s) => s.id === id) ?? defaultSkin();
}

/** tick 间隔 = max(下限, 初始 − 食物数×加速)，触底不穿 */
export function tickIntervalMs(skin: SkinConfig, score: number): number {
  const foods = score / FOOD_POINTS;
  return Math.max(skin.rules.minSpeedMs, skin.rules.initialSpeedMs - foods * skin.rules.accelPerFoodMs);
}
