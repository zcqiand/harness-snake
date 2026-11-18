/** 事故报告卡——终局面板：死因中文文案 + 分数/tick + 回放/再来两按钮。配色全走 skin.colors，零硬编码色值。 */
import type { SkinConfig } from "./config/skins";
import type { Recording } from "./lib/recorder";

export interface ReportCardProps {
  recording: Recording; // finishRecording 产出的 Recording（final 已落）
  skin: SkinConfig;
  onReplay: () => void;
  onRestart: () => void;
}

const CAUSE_TEXT: Record<string, string> = {
  wall: "撞上边界",
  self: "咬到自己",
  win: "通关达成",
};

export default function ReportCard({ recording, skin, onReplay, onRestart }: ReportCardProps) {
  const final = recording.final;
  const causeText =
    final?.cause !== undefined ? (CAUSE_TEXT[final.cause] ?? "本局结束") : "本局结束";

  const btnStyle = { borderColor: skin.colors.hudAccent, color: skin.colors.hudAccent };

  return (
    <div
      className="w-full max-w-xs border-2 p-4"
      style={{ borderColor: skin.colors.hudAccent, color: skin.colors.hudAccent }}
    >
      <p className="font-mono text-sm font-bold tracking-[0.3em]">事故报告</p>
      <p className="mt-3 font-mono text-base">{causeText}</p>
      <div className="mt-3 flex justify-center gap-6 font-mono text-sm">
        <span>
          分数 <b className="text-lg">{final?.score ?? 0}</b>
        </span>
        <span>
          tick <b className="text-lg">{final?.ticks ?? 0}</b>
        </span>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={onReplay}
          className="border px-2 py-1 font-mono text-xs"
          style={btnStyle}
        >
          回放案发经过
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="border px-2 py-1 font-mono text-xs"
          style={btnStyle}
        >
          再来一局
        </button>
      </div>
    </div>
  );
}
