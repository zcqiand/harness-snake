# harness-snake — 仓库工作约定（供 Claude Code）

本仓为书《Harness 工程：Codex 智能游戏开发入门》（xr-know-022）配套仓，
是书稿代码块的 **source of truth**。绑定章节：ch8（贪吃蛇游戏）、ch20（批量换皮生产，模板线）。

## 项目定位

可上架 H5 小游戏贪吃蛇：ch8 落边界断言（撞墙/咬到自己）+状态捕获（运行/暂停/结束）+计分上报+本地存储+换皮参数化；ch20 以本仓为模板线做规约模板+批量换皮（关卡/剧情模板复用 harness-maze/harness-textrpg）。

## 铁律

- **版本钉死**：依赖与 `version-lock.json` 的 `version_lock` 一致；不引入 lock 外的库；npm 一律走 `registry.npmmirror.com`
- **TDD**：`src/lib/` 游戏逻辑（移动/碰撞/食物/状态机）先写失败测试 → 确认失败 → 实现 → 确认绿 → commit；`npm test` 无 Key、无网全绿
- **只增不改**：随章节扩仓时不动现有模块签名/行为；新模块独立测试
- **零伪代码**：禁止 `TODO`/`...` 占位，每段代码必须可运行
- **换皮参数化**：皮肤/速度等可变参数只进配置文件（`src/theme.ts` 或 `config/`），禁止硬编码到逻辑

## 验收

```bash
npm install --registry=https://registry.npmmirror.com
npm run build    # tsc strict + vite 构建门
npm test         # vitest 断言门
```

## 正式区 / 临时区（2026-10-24 人定，全产品线通用）

- 过程件（换皮实验、批量生成产物、调试日志）进 `_work/`，不与正式件混放
- 正式区同名正式件有且仅有一个；`_work/` 整目录 .gitignore

## 细则（docs/conventions/，按需引用）

- 目录结构与章节绑定 → `docs/conventions/structure.md`
- Tag 规约：Release 格式 `v<MAJOR>.<MINOR>.<PATCH>-<YYYYMMDD>`，禁止删/覆盖，禁止 `git push --tags` → `docs/conventions/tagging.md`
