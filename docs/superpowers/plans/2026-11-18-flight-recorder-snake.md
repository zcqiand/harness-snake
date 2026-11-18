# harness-snake 行车记录仪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把骨架写成完整可玩贪吃蛇，突出点=行车记录仪（tick 级增量快照捕获→死亡回放→断言从捕获数据写出）+ 换皮参数化基础件。

**Architecture:** `src/lib/` 纯逻辑五模块（game/recorder/skins(history 依赖 skins 仅类型)/history）+ `src/config/skins.ts` 换皮配置 + `src/` UI 三组件（App/BoardView/Hud/ReplayPlayer）。逻辑层不知道 setInterval 与 DOM 存在：时间由 UI 驱动 step，随机数由 `rng: () => number` 注入，localStorage 经 `Storage` 参数注入。

**Tech Stack:** React 19 + Tailwind 4 + TS strict + Vite + vitest（钉 version-lock.json，零新增依赖）

**Spec:** `docs/superpowers/specs/2026-11-18-flight-recorder-design.md`（含六条语义裁定，冲突以此为准）

## Global Constraints

- 零新增依赖；依赖与 version-lock.json 一致；npm 一律 `--registry=https://registry.npmmirror.com`
- TDD：`src/lib/` 每模块先写失败测试→确认失败→实现→确认绿→commit；`npm test` 无 Key 无网全绿
- 只增不改：不动 `src/lib/board.ts` 导出签名（新模块独立；App.tsx 可重写——骨架壳本就是占位）
- 换皮参数只进 `src/config/skins.ts`，禁止硬编码进逻辑（仓 CLAUDE.md 铁律）
- localStorage 键一律带版本前缀 `hsnake.v1.*`
- 读侧守卫前置：所有 localStorage 读路径必须净化/守卫，畸形数据不得引发渲染层异常（2048 白屏事故教训）
- 反向输入（180° 掉头）在输入层忽略；单缓冲，每 tick 取最后一个有效键
- 生命周期事件（start/pause/resume/end）入记录，tick 帧仅运行中产生
- 满板 400 格=通关终态；计分=每食物固定 +10（`FOOD_POINTS` 配置常量）
- 中文 UI 文案；视觉=行车记录仪仪表盘风（黑底荧光绿 HUD、REC 红点、死亡=事故报告卡）

## Review Focus

- 畸形 localStorage 数据（scores 乱形状/lastrun 帧越界/tail 非 0|1）→ 读侧守卫剔除，渲染层永不白屏 → Task 4 守卫测试钉死
- 同 tick 连按多键与 180° 反向键 → 最后有效键生效、反向被滤 → Task 1 `filterInput` 测试钉死
- 板近满食物生成 → 唯一空格能命中；0 空格 → won 终态 food=null → Task 1 测试钉死
- 游玩中切皮肤或跨局 → 录像内嵌 skinId、成绩册按 skinId 分段过滤，不串账 → Task 4 + Task 7 钉死
- 局中暂停 → interval 停推、不计帧、恢复不跳帧，回放时间轴暂停处只有标记 → Task 5 步骤钉死（UI 层语义，无 dom 测，终验人工过一次）

---

### Task 1: 核心游戏逻辑——移动/三分支碰撞/食物/终态

**Files:**
- Create: `src/lib/game.ts`
- Test: `src/lib/game.test.ts`

**Interfaces:**
- Consumes: 无（独立模块；`BOARD_ROWS`=20/`BOARD_COLS`=20 直接在本模块定义坐标界，不复用 board.ts——网格语义不同，board.ts 保持不动）
- Produces（后续所有任务依赖，逐字使用）:

```ts
export type Direction = "up" | "down" | "left" | "right";
export const DIRECTIONS: readonly Direction[];
export interface Cell { x: number; y: number }        // x=列 0..19, y=行 0..19
export type DeathCause = "wall" | "self";
export type GameStatus = "running" | "paused" | "dead" | "won";
export interface SnakeState {
  cells: Cell[];            // index 0 = 头
  dir: Direction;
  food: Cell | null;        // null 仅当 won
  score: number;
  status: GameStatus;
  tick: number;
}
export type TickEvent = "move" | "food" | "wall" | "self" | "win";
export interface StepResult { state: SnakeState; event: TickEvent }
export const FOOD_POINTS = 10;
export const INITIAL_DIR: Direction = "right";
export const INITIAL_CELLS: readonly Cell[];   // 头 {x:9,y:10}，身 {x:8,y:10}、{x:7,y:10}，长 3
export function createInitialState(rng: () => number): SnakeState;
export function filterInput(current: Direction, next: Direction): Direction | null;  // null=忽略（同向或 180°）
export function turn(state: SnakeState, dir: Direction): SnakeState;                 // 内部走 filterInput，running 才生效
export function placeFood(occupied: readonly Cell[], rng: () => number): Cell | null; // 空格均匀抽样；0 空格 → null
export function step(state: SnakeState, rng: () => number): StepResult;
```

- [ ] **Step 1: 写失败测试** `src/lib/game.test.ts`，用例名与断言如下（rng 用手写可微调的假件，如 `const rng = () => 0`（取第一个空格）或按索引返回递增分数）：
  - `createInitialState`：初始 3 节、头 {x:9,y:10}、dir right、score 0、tick 0、status running、food 不在蛇身上
  - `filterInput`：right→left 返回 null；right→right 返回 null；right→up 返回 "up"；四种 180° 组合全 null
  - `turn`：running 时合法转向生效、反向不变；paused 时转向不生效
  - `step` 前进：普通 tick 头进一格、尾格移除、tick+1、event "move"
  - `step` 撞墙：头在 {x:19,y:10} dir right 时 step → status dead、event "wall"、cells 不变（死时蛇身不动）
  - `step` 咬自身：构造蛇身 U 形弯（如 cells 头下左右包夹），step 进身格 → dead、"self"
  - `step` 咬尾尖豁免：追尾形态（新头格==当前尾格且不进食）→ 存活，尾格让位
  - `step` 吃食物：头进食物格 → score +10（FOOD_POINTS）、长度 +1（尾不移除）、event "food"、食物换新位且不在身上
  - `step` 通关边界：构造长 399 蛇+最后 1 空格放食物，step 吃下 → status won、food null、event "win"
  - `step` 非 running 原样返回：dead/paused 状态 step → 同一 state 引用语义（深相等即可）、event "move"
  - `placeFood`：唯一空格命中该格；0 空格返回 null；结果必不在 occupied
- [ ] **Step 2: 跑测试确认失败** — `npm test`，预期 FAIL（模块不存在）
- [ ] **Step 3: 实现 `src/lib/game.ts`**。要点：`step` 内新头格计算→越界判 wall→`eating = 新头==food`→判咬身时尾格豁免（不进食时 `cells.slice(0, -1)`）→进食则 `placeFood(新蛇身, rng)`，null 则 won。全部纯函数，无 Date/Math.random 直接调用（一律经注入 rng）
- [ ] **Step 4: 跑测试确认全绿** — `npm test`
- [ ] **Step 5: Commit** — `git add src/lib/game.ts src/lib/game.test.ts && git commit -m "feat(game): 核心逻辑——移动/三分支碰撞/食物/通关终态"`

### Task 2: 行车记录仪——捕获器与记录格式 + 按捕获数据写断言

**Files:**
- Create: `src/lib/recorder.ts`
- Test: `src/lib/recorder.test.ts`、`src/lib/captured-assertions.test.ts`

**Interfaces:**
- Consumes: Task 1 全部导出（`Cell`/`SnakeState`/`DeathCause`/`TickEvent`/`GameStatus`/`INITIAL_CELLS`）
- Produces:

```ts
export type LifeEventType = "start" | "pause" | "resume" | "end";
export interface LifeEvent { type: LifeEventType; tick: number; cause?: DeathCause | "win" }
export interface TickFrame {
  t: number;          // tick 号
  h: Cell;            // 本 tick 新头格
  tail: 0 | 1;        // 1=尾格移除（未进食），0=生长（进食）
  f: Cell | null;     // 本 tick 后食物位（进食 tick=新食物；win 后 null）
  s: number;          // 本 tick 后分数
}
export interface Recording {
  version: 1;
  skinId: string;
  startedAt: number;
  endedAt: number | null;
  start: Cell[];        // 开局蛇身（=INITIAL_CELLS 快照，防御未来可变）
  events: LifeEvent[];
  frames: TickFrame[];
  final: { status: GameStatus; cause?: DeathCause | "win"; score: number; ticks: number } | null;
}
export interface ReplayFrame { tick: number; cells: Cell[]; food: Cell | null; score: number }
export function createRecording(skinId: string, startedAt: number): Recording;
export function recordTick(rec: Recording, prev: SnakeState, next: SnakeState, event: TickEvent): void;
export function recordEvent(rec: Recording, type: LifeEventType, tick: number, cause?: DeathCause | "win"): void;
export function finishRecording(rec: Recording, state: SnakeState, endedAt: number, cause?: DeathCause | "win"): void;
export function expandRecording(rec: Recording): ReplayFrame[];   // start 蛇身 + 增量逐帧展开全蛇身
export function isWellFormedRecording(r: unknown): r is Recording; // 读侧守卫：version/skinId/帧形状（h 在 0..19 界内、tail∈{0,1}、s 数值）/事件类型合法
```

- [ ] **Step 1: 写失败测试** `src/lib/recorder.test.ts`：
  - `createRecording`：version 1、start 深等于 INITIAL_CELLS、frames/events 空、final null
  - `recordTick` move 帧：prev/next 用 Task 1 step 真跑一格，断言帧 `{t:1, h:新头, tail:1, f:食物原位, s:0}`
  - `recordTick` food 帧：进食 tick 断言 `tail:0`、`s:10`、`f` 为新食物位
  - `recordEvent`/`finishRecording`：pause/resume 入 events；finish 后 final=`{status:"dead", cause:"wall", score, ticks}`、endedAt 落值
  - `expandRecording`：3 帧记录展开后每帧 cells 长度正确（move 长 3→3→3，food 后 4）、头一致、food 逐帧正确
  - `isWellFormedRecording` 拒绝面：非对象/null、version≠1、帧 h 越界（如 {x:99,y:0}）、tail=2、events 含非法 type、frames 非数组——全部 false；良构真记录 true
- [ ] **Step 2: 写失败测试** `src/lib/captured-assertions.test.ts`（书 ch8 原题「按捕获数据写断言」，独立 describe 注明）：用 Task 1+2 组合跑**三局脚本化模拟**（种子化 rng、逐 tick `turn`+`step`+`recordTick`），断言只针对捕获序列：
  - 撞墙局：expand 后最后一帧 status 语义经 final 断言 `cause:"wall"`，且死亡帧的 `h` 在界外方向的前一格
  - 咬自身局：final `cause:"self"`，死亡帧 `h` 与该帧 cells 除头外的某格重合
  - 吃食物局：捕获序列中存在 `tail:0` 帧，且其 `s` 比前一帧恰 +10
- [ ] **Step 3: 跑测试确认失败** — `npm test`
- [ ] **Step 4: 实现 `src/lib/recorder.ts`**。要点：`recordTick` 从 prev/next 差分推帧（h=next.cells[0]、tail=长度未变?0:1、s、f）；`expandRecording` 从 rec.start 起，按帧顺序推蛇身数组（shift/push），纯函数无副作用
- [ ] **Step 5: 跑测试确认全绿** — `npm test`
- [ ] **Step 6: Commit** — `git add src/lib/recorder.ts src/lib/recorder.test.ts src/lib/captured-assertions.test.ts && git commit -m "feat(recorder): 行车记录仪——增量捕获/展开/守卫+按捕获数据三分支断言"`

### Task 3: 换皮配置——规则参数与双皮肤

**Files:**
- Create: `src/config/skins.ts`
- Test: `src/config/skins.test.ts`

**Interfaces:**
- Consumes: `FOOD_POINTS`（Task 1，速度公式按食物数折算）
- Produces:

```ts
export interface SkinRules {
  initialSpeedMs: number;   // 初始 tick 间隔
  minSpeedMs: number;       // 加速下限
  accelPerFoodMs: number;   // 每吃一食物加快的毫秒数（正数，做减法）
}
export interface SkinConfig {
  id: string;
  name: string;             // 中文显示名
  rules: SkinRules;
  colors: {                 // 全部为具体 hex 值（此处给默认皮肤值，示例皮肤由实现者给观感反差大的值）
    bg: string; board: string; grid: string;
    snake: string; snakeHead: string; food: string;
    hudAccent: string; rec: string;
  };
}
export const SKINS: readonly SkinConfig[];      // 恰两款：dashcam（行车记录仪默认）+ handheld（掌机灰绿示例）
export const DEFAULT_SKIN_ID = "dashcam";
export function getSkin(id: string | undefined): SkinConfig;   // 未知/缺失 id 回落默认
export function tickIntervalMs(skin: SkinConfig, score: number): number;
//   = max(rules.minSpeedMs, rules.initialSpeedMs - (score / FOOD_POINTS) * rules.accelPerFoodMs)
```

- [ ] **Step 1: 写失败测试** `src/config/skins.test.ts`：
  - `SKINS` 恰 2 款、id 含 "dashcam" 与 "handheld"、每款 colors 8 键齐全且都是 `#` 开头 hex
  - `getSkin`：undefined→dashcam；"nope"→dashcam；"handheld"→handheld
  - `tickIntervalMs`：dashcam（initial 160/min 60/accel 3）score 0→160；score 100（10 食物）→130；score 10000→60（触底不穿）
- [ ] **Step 2: 跑测试确认失败** — `npm test`
- [ ] **Step 3: 实现 `src/config/skins.ts`**。dashcam 颜色方向：bg 近黑 `#0a0f0a`、snake 荧光绿、food 亮红、hudAccent 荧光绿；handheld：灰绿 LCD 系（`#8a9a7b` 系），值实现者定，观感反差大即可
- [ ] **Step 4: 跑测试确认全绿** — `npm test`
- [ ] **Step 5: Commit** — `git add src/config/skins.ts src/config/skins.test.ts && git commit -m "feat(skins): 换皮配置——双皮肤规则参数+tick 间隔公式"`

### Task 4: 成绩册与录像存取——读侧守卫前置

**Files:**
- Create: `src/lib/history.ts`
- Test: `src/lib/history.test.ts`

**Interfaces:**
- Consumes: Task 2 `Recording`/`isWellFormedRecording`；`DeathCause`（Task 1）
- Produces:

```ts
export interface ScoreEntry {
  skinId: string;
  score: number;
  ticks: number;
  endedAt: number;
  cause: DeathCause | "win";
}
export const SCORES_KEY = "hsnake.v1.scores";     // JSON: ScoreEntry[]（不分段存储，按 skinId 字段过滤）
export const LAST_RUN_KEY = "hsnake.v1.lastrun";  // JSON: Recording
export function loadScores(storage: Storage): ScoreEntry[];           // 读侧净化：畸形条目剔除、乱 JSON→[]
export function saveScore(storage: Storage, entry: ScoreEntry): void;
export function bestScore(scores: readonly ScoreEntry[], skinId: string): number;  // 无记录→0
export function loadLastRun(storage: Storage): Recording | null;      // 守卫不过→null
export function saveLastRun(storage: Storage, rec: Recording): void;
```

- [ ] **Step 1: 写失败测试** `src/lib/history.test.ts`（Storage 用内存假件 Map 实现，2048 同款手写，零依赖）：
  - `loadScores` 空/缺键→[]；乱 JSON "not-json"→[]
  - `loadScores` 净化：混入 `{skinId:7}`、缺 score、score 字符串、cause 非法值的条目被剔除；良构条目保序保留
  - `saveScore`→`loadScores` 往返相等；多条追加不覆盖
  - `bestScore`：按 skinId 过滤取 max；异皮肤不串账（两条不同 skinId，各自最佳正确）；空→0
  - `loadLastRun` 缺键→null；乱 JSON→null；`isWellFormedRecording` 不过的畸形（帧 tail=2）→null；真 Recording 往返相等
- [ ] **Step 2: 跑测试确认失败** — `npm test`
- [ ] **Step 3: 实现 `src/lib/history.ts`**。要点：写侧 try/catch（quota/序列化失败静默不炸 UI）；`isWellFormedScoreEntry` 私有形状判定（skinId string、score/ticks/endedAt number、cause∈{"wall","self","win"}）
- [ ] **Step 4: 跑测试确认全绿** — `npm test`
- [ ] **Step 5: Commit** — `git add src/lib/history.ts src/lib/history.test.ts && git commit -m "feat(history): 成绩册/录像存取——读侧守卫前置+按皮肤分段 bestScore"`

### Task 5: 游戏主循环与棋盘 UI——仪表盘壳

**Files:**
- Modify: `src/App.tsx`（重写骨架壳）
- Create: `src/BoardView.tsx`、`src/Hud.tsx`
- Modify: `src/index.css`（主题 token 与 REC 闪烁动画）
- Test: 无新增 dom 测（UI 层；逻辑全在 Task 1-4 已测）——本任务门=`npm run build` 绿

**Interfaces:**
- Consumes: Task 1 `game.ts` 全部、Task 2 recorder 全部、Task 3 `getSkin`/`DEFAULT_SKIN_ID`/`tickIntervalMs`、Task 4 history 全部
- Produces: App 内聚的局状态机（UI 只此一处持有 SnakeState），`BoardView({cells, food, skin})`、`Hud({score, tick, skin, paused})` 纯渲染组件（Task 6 的 ReplayPlayer 复用 BoardView）

- [ ] **Step 1: 实现 BoardView**：CSS grid 20×20 渲染蛇身/食物/空格；配色全走 `skin.colors`，无硬编码色值；蛇头节用 snakeHead 区分
- [ ] **Step 2: 实现 Hud**：分数、tick 码表、速度档（当前 interval ms）、REC 红点（CSS 闪烁动画，paused 时停闪变灰）、皮肤名；事故报告前的常驻 HUD
- [ ] **Step 3: 重写 App 主循环**：
  - 键盘：Arrow/WASD 经 `filterInput` 单缓冲（最后一次有效键在下一 tick 生效）；Space/P 暂停/恢复
  - 局状态机：待机（按键开局，`createRecording`+`recordEvent("start")`）→running→paused→dead/won
  - interval 驱动：`setInterval` 周期=`tickIntervalMs(skin, score)`，score 变化时重建 interval；**暂停=清 interval**，恢复=重建，不追帧
  - 每 tick：`turn`+`step`+`recordTick`；终局 `finishRecording`+`saveScore`+`saveLastRun`
  - 待机/终局时清除 interval；组件卸载清 interval
- [ ] **Step 4: 验证** — `npm run build` 绿（tsc strict + vite）；`npm test` 仍全绿（无回归）
- [ ] **Step 5: Commit** — `git add src/App.tsx src/BoardView.tsx src/Hud.tsx src/index.css && git commit -m "feat(ui): 仪表盘壳——主循环/HUD/REC/暂停语义"`

### Task 6: 事故报告与回放播放器

**Files:**
- Create: `src/ReplayPlayer.tsx`、`src/ReportCard.tsx`
- Modify: `src/App.tsx`（接线终局面板）
- Test: 无新增 dom 测——门=`npm run build`

**Interfaces:**
- Consumes: Task 2 `expandRecording`/`Recording`/`ReplayFrame`；Task 4 `loadLastRun`；Task 5 `BoardView`
- Produces: `ReportCard({recording, skin, onReplay, onRestart})`（死因中文文案：wall=撞墙/self=咬到自己/win=通关）、`ReplayPlayer({recording, skin, onClose})`

- [ ] **Step 1: 实现 ReportCard**：事故报告卡样式（荧光绿描边/黑底）、死因判定文案、分数+tick 数、「回放案发经过」「再来一局」两按钮（中文）
- [ ] **Step 2: 实现 ReplayPlayer**：`expandRecording` 逐帧渲染（复用 BoardView）；控制条=上一步/下一步/播放暂停/倍速（1×/2×/4×）/关闭；帧序号显示；事件标记：暂停/恢复在时间轴位置显示「⏸ 已暂停」标记（不重复帧）；播放用 setInterval 按倍速推帧，卸载清理
- [ ] **Step 3: App 接线**：dead/won 后渲染 ReportCard，数据=`finishRecording` 产出的 Recording；回放打开时主循环保持停止；再来一局回到待机
- [ ] **Step 4: 验证** — `npm run build` 绿；`npm test` 无回归
- [ ] **Step 5: Commit** — `git add src/ReplayPlayer.tsx src/ReportCard.tsx src/App.tsx && git commit -m "feat(ui): 事故报告+逐帧回放播放器"`

### Task 7: 成绩册面板/换皮切换/触屏——收官接线

**Files:**
- Create: `src/ScoreBook.tsx`
- Modify: `src/App.tsx`、`src/Hud.tsx`（皮肤切换控件入 Hud 或头部）
- Test: 无新增 dom 测——门=`npm run build` + 全量 `npm test`

**Interfaces:**
- Consumes: Task 4 `loadScores`/`bestScore`/`loadLastRun`；Task 3 `SKINS`/`getSkin`；Task 6 ReplayPlayer
- Produces: 完整可玩收口

- [ ] **Step 1: 成绩册面板 ScoreBook**：`loadScores` 按 skinId 分段（默认皮肤与所选皮肤两个 tab 或分组列表），每组显示最佳与历史（分数/tick/死因/时间）；「回放最近一局」入口=当前皮肤 `loadLastRun`，有则开 ReplayPlayer，无则入口置灰
- [ ] **Step 2: 换皮切换**：头部 segmented control 两款皮肤；切换=重置回待机开新局（防局中换规则串账）；皮肤 id 落 localStorage `hsnake.v1.skin`（读侧守卫：非法值回落 DEFAULT_SKIN_ID，模式同 Task 4）
- [ ] **Step 3: 触屏滑动**：touchstart/touchend 位移判向（阈值 24px），经同一 `filterInput` 单缓冲入口；页面禁滚动（`touch-none`）
- [ ] **Step 4: 终验** — `npm test` 全绿 + `npm run build` 绿；`npm run dev` 人工过一遍：开局→吃食物加速→暂停（REC 停闪）→撞死→事故报告→回放逐帧→切皮肤重开→成绩册分段正确（本次人工终验留待用户，实现者只跑门）
- [ ] **Step 5: Commit** — `git add src/ScoreBook.tsx src/App.tsx src/Hud.tsx && git commit -m "feat(ui): 成绩册分段/换皮切换/触屏滑动——行车记录仪批次收口"`

---

## 任务模型与依赖

| Task | 内容 | 建议模型 |
|---|---|---|
| 1 | 核心逻辑 game.ts | sonnet（全仓类型地基，接口错则全批返工） |
| 2 | recorder + 捕获断言 | sonnet（书教学原题，差分/展开易错） |
| 3 | skins 配置 | haiku（机械：常量+公式） |
| 4 | history 守卫 | haiku（机械：2048 同款模式照抄） |
| 5 | 主循环+棋盘 UI | sonnet（interval 生命周期/暂停语义易错） |
| 6 | 事故报告+回放 | sonnet |
| 7 | 成绩册+换皮+触屏 | sonnet |

依赖线性：1→2→(3,4 可并行但 SDD 单流串行)→5→6→7。终审后修复波次→finishing-a-development-branch（本地合回 master）→部署批另起（tag `v0.1.0-YYYYMMDD` 格式，五件套照 harness-2048 web-only 变体，端口另议）。
