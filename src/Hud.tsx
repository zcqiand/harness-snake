/** 仪表盘 HUD——REC 红点/分数/tick 码表/速度档/皮肤名。纯渲染，配色全走 skin.colors，零硬编码色值。 */
import { tickIntervalMs, type SkinConfig } from "./config/skins";

export interface HudProps {
  score: number;
  tick: number;
  skin: SkinConfig;
  paused: boolean; // 暂停时 REC 停闪变灰
}

export default function Hud({ score, tick, skin, paused }: HudProps) {
  const intervalMs = tickIntervalMs(skin, score);
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-sm"
      style={{ color: skin.colors.hudAccent }}
    >
      <span className="flex items-center gap-2 font-bold tracking-widest">
        <span
          aria-label={paused ? "已暂停" : "录制中"}
          className={`inline-block h-3 w-3 rounded-full ${paused ? "" : "rec-blink"}`}
          style={{ backgroundColor: paused ? skin.colors.grid : skin.colors.rec }}
        />
        REC
      </span>
      <span>
        分数 <b className="text-base">{score}</b>
      </span>
      <span>
        tick <b className="text-base">{String(tick).padStart(4, "0")}</b>
      </span>
      <span>
        速度档 <b className="text-base">{intervalMs}ms</b>
      </span>
      <span>
        皮肤 <b className="text-base">{skin.name}</b>
      </span>
    </div>
  );
}
