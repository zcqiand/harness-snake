/** 仪表盘壳——局状态机与主循环只此一处持有 SnakeState。UI 层是唯一允许 Date.now/Math.random 的地方。 */
import { useCallback, useEffect, useRef, useState } from "react";
import BoardView from "./BoardView";
import Hud from "./Hud";
import ReportCard from "./ReportCard";
import ReplayPlayer from "./ReplayPlayer";
import {
  DEFAULT_SKIN_ID,
  SKINS,
  getSkin,
  tickIntervalMs,
  type SkinConfig,
} from "./config/skins";
import {
  createInitialState,
  filterInput,
  step,
  turn,
  type DeathCause,
  type Direction,
  type SnakeState,
} from "./lib/game";
import {
  createRecording,
  finishRecording,
  recordEvent,
  recordTick,
  type Recording,
} from "./lib/recorder";
import { saveLastRun, saveScore } from "./lib/history";

// 模块边界处取一次——history 层 Storage 参数注入
const storage: Storage = globalThis.localStorage;
// UI 层是唯一允许 Math.random 的地方——包装成注入 rng
const rng = () => Math.random();

type Phase = "idle" | "running" | "paused" | "ended";

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

interface Session {
  state: SnakeState;
  rec: Recording;
}

export default function App() {
  const [skinId, setSkinId] = useState<string>(DEFAULT_SKIN_ID);
  const skin: SkinConfig = getSkin(skinId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [replayOpen, setReplayOpen] = useState(false);
  const [view, setView] = useState<SnakeState | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const bufferedRef = useRef<Direction | null>(null); // 单缓冲：最后一次有效键下一 tick 生效
  const phaseRef = useRef<Phase>("idle");

  const gotoPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // 开局：createInitialState + createRecording + recordEvent("start", 0)
  const startGame = useCallback(
    (firstDir?: Direction) => {
      const state = createInitialState(rng);
      const rec = createRecording(skin.id, Date.now());
      recordEvent(rec, "start", 0);
      bufferedRef.current = firstDir ? filterInput(state.dir, firstDir) : null;
      sessionRef.current = { state, rec };
      setView(state);
      gotoPhase("running");
    },
    [skin.id, gotoPhase],
  );

  // 单个 tick：turn(缓冲键)+step；非终局 recordTick；终局蛇身不动不记帧，收尾落盘
  const runTick = useCallback(() => {
    const session = sessionRef.current;
    if (!session || phaseRef.current !== "running") return;

    const buffered = bufferedRef.current;
    bufferedRef.current = null;
    const prev = buffered ? turn(session.state, buffered) : session.state;
    const { state: next, event } = step(prev, rng);
    session.state = next;

    if (event === "move" || event === "food") {
      recordTick(session.rec, prev, next); // 仅 move/food 帧入记录
      setView(next);
      return;
    }

    // 终局 tick：蛇身不动、不记帧；end 事件 + 收官 + 成绩册 + 最近一局
    const cause: DeathCause | "win" = event === "win" ? "win" : event;
    recordEvent(session.rec, "end", next.tick, cause);
    finishRecording(session.rec, next, Date.now(), cause);
    saveScore(storage, {
      skinId: skin.id,
      score: next.score,
      ticks: next.tick,
      endedAt: Date.now(),
      cause,
    });
    saveLastRun(storage, session.rec);
    setView(next);
    gotoPhase("ended");
  }, [skin.id, gotoPhase]);

  const togglePause = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (phaseRef.current === "running") {
      session.state = { ...session.state, status: "paused" };
      recordEvent(session.rec, "pause", session.state.tick);
      setView(session.state);
      gotoPhase("paused"); // 暂停=清 interval
    } else if (phaseRef.current === "paused") {
      session.state = { ...session.state, status: "running" };
      recordEvent(session.rec, "resume", session.state.tick);
      setView(session.state);
      gotoPhase("running"); // 恢复=重建 interval，不追帧
    }
  }, [gotoPhase]);

  // 再来一局：回放面板关闭 + 会话清空，回到待机（按方向键开局）
  const restartToIdle = useCallback(() => {
    setReplayOpen(false);
    sessionRef.current = null;
    bufferedRef.current = null;
    setView(null);
    gotoPhase("idle");
  }, [gotoPhase]);

  // interval 周期=tickIntervalMs(skin, score)——score 变化（吃食物）即重建；卸载清理
  const intervalMs = tickIntervalMs(skin, view ? view.score : 0);
  useEffect(() => {
    if (phase !== "running") return; // 待机/暂停/终局无 interval
    const id = setInterval(runTick, intervalMs);
    return () => clearInterval(id);
  }, [phase, intervalMs, runTick]);

  // 键盘：Arrow/WASD 经 filterInput 入单缓冲；Space/P 暂停/恢复；待机/终局按方向键开局。
  // 回放面板打开期间键盘不接局——方向键不再开局，主循环本就无 interval（ended 相）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (replayOpen) return;
      const dir = KEY_TO_DIR[e.key];
      if (dir !== undefined) {
        e.preventDefault();
        const current = phaseRef.current;
        if (current === "idle" || current === "ended") {
          startGame(dir);
          return;
        }
        const session = sessionRef.current;
        if (session) {
          const valid = filterInput(session.state.dir, dir);
          if (valid !== null) bufferedRef.current = valid; // 同向/180° 忽略
        }
        return;
      }
      if (e.key === " " || e.key === "p" || e.key === "P") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startGame, togglePause, replayOpen]);

  const ended = phase === "ended" && view !== null;
  const endRec = ended && sessionRef.current ? sessionRef.current.rec : null;

  const overlayText =
    phase === "idle"
      ? "行车记录仪就绪——按方向键开局"
      : phase === "paused"
        ? "已暂停——按 Space/P 继续"
        : null;

  const skinButtons = (
    <div className="flex gap-2">
      {SKINS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setSkinId(s.id)}
          className="border px-2 py-1 font-mono text-xs"
          style={{
            borderColor: s.colors.hudAccent,
            color: s.colors.hudAccent,
            ...(s.id === skin.id ? { backgroundColor: s.colors.grid } : {}),
          }}
        >
          {s.name}
        </button>
      ))}
    </div>
  );

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-3 p-4 select-none"
      style={{ backgroundColor: skin.colors.bg, color: skin.colors.hudAccent }}
    >
      <h1 className="text-lg font-bold tracking-widest">贪吃蛇 · 行车记录仪</h1>

      <Hud
        score={view ? view.score : 0}
        tick={view ? view.tick : 0}
        skin={skin}
        paused={phase === "paused"}
      />

      <div className="relative">
        <BoardView cells={view ? view.cells : null} food={view ? view.food : null} skin={skin} />
        {ended && endRec !== null ? (
          replayOpen ? (
            <ReplayPlayer
              recording={endRec}
              skin={skin}
              onClose={() => setReplayOpen(false)}
            />
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
              style={{ backgroundColor: skin.colors.bg }}
            >
              <ReportCard
                recording={endRec}
                skin={skin}
                onReplay={() => setReplayOpen(true)}
                onRestart={restartToIdle}
              />
              {skinButtons}
            </div>
          )
        ) : overlayText !== null ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 text-center opacity-90"
            style={{ backgroundColor: skin.colors.board, color: skin.colors.hudAccent }}
          >
            <p className="font-mono text-sm tracking-wider">{overlayText}</p>
            {phase === "idle" && skinButtons}
          </div>
        ) : null}
      </div>

      <p className="font-mono text-xs opacity-70" style={{ color: skin.colors.hudAccent }}>
        方向键 / WASD 转向 · Space / P 暂停 · 本局全程记录在案
      </p>
    </main>
  );
}
