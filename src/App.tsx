/** 仪表盘壳——局状态机与主循环只此一处持有 SnakeState。UI 层是唯一允许 Date.now/Math.random 的地方。 */
import { useCallback, useEffect, useRef, useState } from "react";
import BoardView from "./BoardView";
import Hud from "./Hud";
import ReportCard from "./ReportCard";
import ReplayPlayer from "./ReplayPlayer";
import ScoreBook from "./ScoreBook";
import {
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
import {
  loadLastRun,
  loadScores,
  loadSkinId,
  safeLocalStorage,
  saveLastRun,
  saveScore,
  saveSkinId,
  type ScoreEntry,
} from "./lib/history";

// 模块边界处取一次——history 层 Storage 参数注入；localStorage 不可用（阻止所有 cookie）回落内存假件，不炸模块加载
const storage: Storage = safeLocalStorage();
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

const TOUCH_THRESHOLD_PX = 24; // 触屏滑动有效位移阈值，主轴取向

interface Session {
  state: SnakeState;
  rec: Recording;
}

export default function App() {
  // 换皮持久化：读侧守卫（非法值/缺失回落默认）在 history 层 loadSkinId
  const [skinId, setSkinId] = useState<string>(() => loadSkinId(storage));
  const skin: SkinConfig = getSkin(skinId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [replayRec, setReplayRec] = useState<Recording | null>(null); // 非空=回放面板盖在棋盘上
  const [bookOpen, setBookOpen] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [lastRun, setLastRun] = useState<Recording | null>(() => loadLastRun(storage));
  const [view, setView] = useState<SnakeState | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const bufferedRef = useRef<Direction | null>(null); // 单缓冲：最后一次有效键下一 tick 生效
  const phaseRef = useRef<Phase>("idle");
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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
    setLastRun(session.rec); // 成绩册「回放最近一局」入口即时可用
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

  // 回待机：回放/成绩册关、会话清空（换皮与「再来一局」共用，防局中换规则串账）
  const restartToIdle = useCallback(() => {
    setReplayRec(null);
    setBookOpen(false);
    sessionRef.current = null;
    bufferedRef.current = null;
    setView(null);
    gotoPhase("idle");
  }, [gotoPhase]);

  // 换皮：落 localStorage + 重置回待机开新局
  const changeSkin = useCallback(
    (id: string) => {
      if (id === skinId) return;
      saveSkinId(storage, id);
      setSkinId(id);
      restartToIdle();
    },
    [skinId, restartToIdle],
  );

  // 开成绩册：局中打开先自动暂停（面板盖住棋盘不能盲打）；开面板时现读 scores 与 lastRun（localStorage 是真源）
  const openScoreBook = useCallback(() => {
    if (phaseRef.current === "running") togglePause();
    setScores(loadScores(storage));
    setLastRun(loadLastRun(storage));
    setBookOpen(true);
  }, [togglePause]);

  // 收起成绩册：只关面板——局中打开前已自动暂停，收起后 Space/P 继续本局，不清会话
  const closeScoreBook = useCallback(() => {
    setBookOpen(false);
  }, []);

  // interval 周期=tickIntervalMs(skin, score)——score 变化（吃食物）即重建；卸载清理
  const intervalMs = tickIntervalMs(skin, view ? view.score : 0);
  useEffect(() => {
    if (phase !== "running") return; // 待机/暂停/终局无 interval
    const id = setInterval(runTick, intervalMs);
    return () => clearInterval(id);
  }, [phase, intervalMs, runTick]);

  // 方向输入统一入口：待机/终局按方向=开局；局中经 filterInput 入单缓冲（同向/180° 忽略）。
  // 键盘与触屏滑动都走这里——同一 filterInput 入口，双输入零分叉。
  const handleDirInput = useCallback(
    (dir: Direction) => {
      const current = phaseRef.current;
      if (current === "idle" || current === "ended") {
        startGame(dir);
        return;
      }
      const session = sessionRef.current;
      if (session) {
        const valid = filterInput(session.state.dir, dir);
        if (valid !== null) bufferedRef.current = valid;
      }
    },
    [startGame],
  );

  // 键盘：Arrow/WASD 经 handleDirInput；Space/P 暂停/恢复。
  // 回放/成绩册面板打开期间键盘不接局，但 dir/space 仍先 preventDefault——不吃浏览器默认滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_TO_DIR[e.key];
      const isPauseKey = e.key === " " || e.key === "p" || e.key === "P";
      if (dir !== undefined || isPauseKey) e.preventDefault();
      if (replayRec !== null || bookOpen) return;
      if (dir !== undefined) {
        handleDirInput(dir);
        return;
      }
      if (isPauseKey) {
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDirInput, togglePause, replayRec, bookOpen]);

  const ended = phase === "ended" && view !== null;
  const endRec = ended && sessionRef.current ? sessionRef.current.rec : null;

  const overlayText =
    phase === "idle"
      ? "行车记录仪就绪——按方向键或滑动开局"
      : phase === "paused"
        ? "已暂停——按 Space/P 继续"
        : null;

  // 触屏滑动：touchstart 记起点，touchend 位移 ≥24px 主轴取向，经同一 handleDirInput
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || replayRec !== null || bookOpen) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < TOUCH_THRESHOLD_PX) return; // 位移不足=无效滑动
    const dir: Direction = adx >= ady ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    handleDirInput(dir);
  };

  const skinButtons = (
    <div className="flex gap-2">
      {SKINS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => changeSkin(s.id)}
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

  const btnStyle = { borderColor: skin.colors.hudAccent, color: skin.colors.hudAccent };

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-3 p-4 select-none"
      style={{ backgroundColor: skin.colors.bg, color: skin.colors.hudAccent }}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-widest">贪吃蛇 · 行车记录仪</h1>
        <button
          type="button"
          onClick={bookOpen ? closeScoreBook : openScoreBook}
          className="border px-2 py-1 font-mono text-xs"
          style={btnStyle}
        >
          {bookOpen ? "收起成绩册" : "成绩册"}
        </button>
      </div>

      <Hud score={view ? view.score : 0} tick={view ? view.tick : 0} skin={skin} running={phase === "running"} />

      <div className="relative touch-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <BoardView cells={view ? view.cells : null} food={view ? view.food : null} skin={skin} />
        {replayRec !== null ? (
          <ReplayPlayer recording={replayRec} skin={skin} onClose={() => setReplayRec(null)} />
        ) : bookOpen ? (
          <ScoreBook
            scores={scores}
            skin={skin}
            lastRun={lastRun}
            onReplayLast={() => setReplayRec(lastRun)}
            onClose={closeScoreBook}
          />
        ) : ended && endRec !== null ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
            style={{ backgroundColor: skin.colors.bg }}
          >
            <ReportCard
              recording={endRec}
              skin={skin}
              onReplay={() => setReplayRec(endRec)}
              onRestart={restartToIdle}
            />
            {skinButtons}
          </div>
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
        方向键 / WASD / 滑动 转向 · Space / P 暂停 · 本局全程记录在案
      </p>
    </main>
  );
}
