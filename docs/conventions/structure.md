# 目录结构与章节绑定

> 树是文件系统的复写，以仓库实际为准；模块职责与章节绑定在此维护。

```text
harness-snake/
├── CLAUDE.md                       ← 工程约定入口
├── version-lock.json               ← 版本钉死 SSOT
├── src/
│   ├── main.tsx                    ← 挂载入口
│   ├── App.tsx                     ← 页面壳（棋盘画布骨架，逻辑随章节灌）
│   ├── index.css                   ← Tailwind 4 入口
│   └── lib/
│       ├── board.ts                ← 纯逻辑：棋盘/坐标派生（骨架含空板）
│       └── board.test.ts           ← vitest 断言
├── docs/conventions/               ← structure / tagging
└── _work/                          ← 过程件（gitignore）
```

## 章节绑定表

| 章节 | 落点 | 交付物 |
|---|---|---|
| ch8 贪吃蛇游戏 | `src/` | 碰撞断言+状态捕获+换皮参数化+本地存储 |
| ch20 批量换皮 | `config/`+模板 | 规约模板+多套换皮产物与实测记录（关卡/剧情模板复用 harness-maze/harness-textrpg） |
