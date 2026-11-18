/** 逐帧回放播放器——expandRecording 展开 + BoardView 复用渲染；棋盘按录制时皮肤忠实回放。 */
import { useEffect, useMemo, useRef, useState } from "react";
import BoardView from "./BoardView";
import { getSkin, type SkinConfig } from "./config/skins";
import { expandRecording, type Recording } from "./lib/recorder";

export interface ReplayPlayerProps {
  recording: Recording;
  skin: SkinConfig; // 控制条走当前所选皮肤；棋盘用 getSkin(recording.skinId) 忠实渲染
  onClose: () => void;
}

const BASE_FRAME_MS = 250; // 1× 回放节拍：每 250ms 一帧
const SPEEDS = [1, 2, 4] as const;

export default function ReplayPlayer({ recording, skin, onClose }: ReplayPlayerProps) {
  const frames = useMemo(() => expandRecording(recording), [recording]);
  // 回放皮肤忠实渲染：录制时皮肤，未知 id 由 getSkin 回落默认
  const replaySkin = getSkin(recording.skinId);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speed = SPEEDS[speedIdx];
  const last = frames.length - 1;
  const lastRef = useRef(last);
  lastRef.current = last; // interval 闭包免随末帧重建

  // 播放=定时推帧（倍速=节拍除速）；speed 变化重建 interval；卸载清理
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIdx((i) => Math.min(i + 1, Math.max(lastRef.current, 0)));
    }, BASE_FRAME_MS / speed);
    return () => clearInterval(id);
  }, [playing, speed]);

  // 到末帧自动停
  useEffect(() => {
    if (playing && idx >= last) setPlaying(false);
  }, [playing, idx, last]);

  const current = frames[idx] ?? null;
  // 事件标记：暂停/恢复在到达对应 tick 时显示——时间轴不重复帧，只加标记
  const marker = current
    ? recording.events.find(
        (e) => (e.type === "pause" || e.type === "resume") && e.tick === current.tick,
      )
    : undefined;

  const stepBy = (delta: number) => {
    setPlaying(false);
    setIdx((i) => Math.min(Math.max(i + delta, 0), Math.max(last, 0)));
  };

  const togglePlay = () => {
    if (!playing && last >= 0 && idx >= last) setIdx(0); // 末帧再按播放=从头重放
    setPlaying((p) => !p);
  };

  const btnStyle = { borderColor: skin.colors.hudAccent, color: skin.colors.hudAccent };
  const btnCls = "border px-2 py-1 font-mono text-xs disabled:opacity-40";

  return (
    <div
      className="absolute inset-0 flex flex-col gap-2 p-2"
      style={{ backgroundColor: skin.colors.bg, color: skin.colors.hudAccent }}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {current ? (
          <div className="aspect-square h-full max-w-full">
            <BoardView cells={current.cells} food={current.food} skin={replaySkin} />
          </div>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center border font-mono text-sm"
            style={{ borderColor: skin.colors.grid }}
          >
            本局无帧记录
          </div>
        )}
      </div>

      {marker && (
        <p
          className="font-mono text-sm"
          style={{ color: marker.type === "pause" ? replaySkin.colors.rec : skin.colors.hudAccent }}
        >
          {marker.type === "pause" ? "⏸ 已暂停" : "▶ 已恢复"}
        </p>
      )}

      <div className="flex items-center justify-between font-mono text-sm">
        <span>
          帧 {last < 0 ? 0 : idx + 1}/{frames.length}
        </span>
        {current && <span>分数 {current.score}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => stepBy(-1)} disabled={idx <= 0} className={btnCls} style={btnStyle}>
          上一步
        </button>
        <button type="button" onClick={togglePlay} disabled={last < 0} className={btnCls} style={btnStyle}>
          {playing ? "暂停" : "播放"}
        </button>
        <button type="button" onClick={() => stepBy(1)} disabled={idx >= last} className={btnCls} style={btnStyle}>
          下一步
        </button>
        <button
          type="button"
          onClick={() => setSpeedIdx((s) => (s + 1) % SPEEDS.length)}
          className={btnCls}
          style={btnStyle}
        >
          倍速 {speed}×
        </button>
        <button type="button" onClick={onClose} className={btnCls} style={btnStyle}>
          关闭
        </button>
      </div>
    </div>
  );
}
