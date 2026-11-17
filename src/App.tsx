import { BOARD_COLS, BOARD_ROWS, emptyBoard } from "./lib/board";

/** 页面壳：贪吃蛇棋盘骨架。移动/碰撞/状态机随 ch8 章节灌入。 */
export default function App() {
  const board = emptyBoard();
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold mb-4">贪吃蛇</h1>
      <p className="text-sm text-gray-500 mb-4">
        骨架壳：移动与碰撞断言逻辑随章节灌入
      </p>
      <div
        aria-label="board"
        className="grid gap-px bg-gray-300 border border-gray-400"
        style={{
          gridTemplateColumns: `repeat(${BOARD_COLS}, 20px)`,
          gridTemplateRows: `repeat(${BOARD_ROWS}, 20px)`,
        }}
      >
        {board.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className={cell ? "bg-green-600" : "bg-white"}
            />
          )),
        )}
      </div>
    </main>
  );
}
