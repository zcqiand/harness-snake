/** 成绩册面板——按皮肤分段（默认皮肤 + 当前所选皮肤 tab），显示最佳与历史；「回放最近一局」入口挂当前皮肤录像。纯渲染，配色全走 skin.colors。 @impl M03.F02.I01 */
import { useState } from "react";
import { DEFAULT_SKIN_ID, getSkin, type SkinConfig } from "./config/skins";
import { bestScore, type ScoreEntry } from "./lib/history";
import type { Recording } from "./lib/recorder";

export interface ScoreBookProps {
  scores: ScoreEntry[]; // 全量成绩（未分段），组件内按 tab skinId 过滤
  skin: SkinConfig; // 当前所选皮肤——决定 tab 集与控件配色
  lastRun: Recording | null; // 全局最近一局录像（按当前 tab 皮肤点亮），null 或 skinId ≠ 当前 tab 皮肤时回放入口置灰
  onReplayLast: () => void;
  onClose: () => void;
}

const CAUSE_TEXT: Record<string, string> = {
  wall: "撞上边界",
  self: "咬到自己",
  win: "通关达成",
};

const causeText = (cause: ScoreEntry["cause"]): string => CAUSE_TEXT[cause] ?? "本局结束";

const timeText = (endedAt: number): string => new Date(endedAt).toLocaleString();

export default function ScoreBook({ scores, skin, lastRun, onReplayLast, onClose }: ScoreBookProps) {
  // tab 集合 = 默认皮肤 + 当前所选皮肤去重；单皮肤时只剩一段
  const tabSkinIds = DEFAULT_SKIN_ID === skin.id ? [DEFAULT_SKIN_ID] : [DEFAULT_SKIN_ID, skin.id];
  const [tabIdx, setTabIdx] = useState(0);
  const activeSkin = getSkin(tabSkinIds[Math.min(tabIdx, tabSkinIds.length - 1)]);
  const activeScores = scores.filter((e) => e.skinId === activeSkin.id);
  const best = bestScore(scores, activeSkin.id);

  const btnStyle = { borderColor: skin.colors.hudAccent, color: skin.colors.hudAccent };
  const btnCls = "border px-2 py-1 font-mono text-xs disabled:opacity-40";

  return (
    <div
      className="absolute inset-0 flex flex-col gap-2 p-3"
      style={{ backgroundColor: skin.colors.bg, color: skin.colors.hudAccent }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm font-bold tracking-[0.3em]">成绩册</p>
        <button type="button" onClick={onClose} className={btnCls} style={btnStyle}>
          关闭
        </button>
      </div>

      <div className="flex gap-2">
        {tabSkinIds.map((id, i) => {
          const tabSkin = getSkin(id);
          const active = i === Math.min(tabIdx, tabSkinIds.length - 1);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTabIdx(i)}
              className="border px-2 py-1 font-mono text-xs"
              style={{
                borderColor: tabSkin.colors.hudAccent,
                color: tabSkin.colors.hudAccent,
                ...(active ? { backgroundColor: tabSkin.colors.grid } : {}),
              }}
            >
              {tabSkin.name}
            </button>
          );
        })}
      </div>

      <p className="font-mono text-sm">
        最佳 <b className="text-base">{best}</b> · 共 {activeScores.length} 局
      </p>

      <div
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto border p-2 font-mono text-xs"
        style={{ borderColor: skin.colors.grid }}
      >
        {activeScores.length === 0 ? (
          <p className="opacity-70">本皮肤还没有记录——先跑一局</p>
        ) : (
          [...activeScores].reverse().map((e, i) => (
            <p key={`${e.endedAt}-${i}`}>
              {String(i + 1).padStart(2, "0")} · 分数 {e.score} · tick {e.ticks} · {causeText(e.cause)} ·{" "}
              {timeText(e.endedAt)}
            </p>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onReplayLast}
        disabled={lastRun === null || lastRun.skinId !== activeSkin.id}
        className={btnCls}
        style={btnStyle}
      >
        {lastRun === null ? "回放最近一局（无录像）" : "回放最近一局"}
      </button>
    </div>
  );
}
