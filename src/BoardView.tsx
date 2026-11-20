/** 棋盘纯渲染组件——20×20 CSS grid，配色全走 skin.colors，零硬编码色值。Task 6 ReplayPlayer 复用本组件。 @impl M05.F02.I01 */
import type { Cell } from "./lib/game";
import type { SkinConfig } from "./config/skins";

// 网格 20×20 来自 game.ts 的坐标界（0..19）——game 不导出该常量，此处对齐同值
const BOARD_ROWS = 20;
const BOARD_COLS = 20;

export interface BoardViewProps {
  cells: readonly Cell[] | null; // index 0=头；null=空板（待机/无帧）
  food: Cell | null;
  skin: SkinConfig;
}

const cellIndex = (c: Cell) => c.y * BOARD_COLS + c.x;

export default function BoardView({ cells, food, skin }: BoardViewProps) {
  const bodyIdx = new Set<number>();
  let headIdx = -1;
  if (cells) {
    cells.forEach((c, i) => {
      const idx = cellIndex(c);
      bodyIdx.add(idx);
      if (i === 0) headIdx = idx;
    });
  }
  const foodIdx = food ? cellIndex(food) : -1;

  const squares = [];
  const total = BOARD_ROWS * BOARD_COLS;
  for (let i = 0; i < total; i++) {
    let bg = skin.colors.board;
    if (i === headIdx) bg = skin.colors.snakeHead;
    else if (bodyIdx.has(i)) bg = skin.colors.snake;
    else if (i === foodIdx) bg = skin.colors.food;
    squares.push(<div key={i} style={{ backgroundColor: bg }} />);
  }

  return (
    <div
      aria-label="board"
      className="grid aspect-square w-full gap-px border"
      style={{
        backgroundColor: skin.colors.grid, // gap 缝隙色即网格线
        borderColor: skin.colors.grid,
        gridTemplateColumns: `repeat(${BOARD_COLS}, 1fr)`,
        gridTemplateRows: `repeat(${BOARD_ROWS}, 1fr)`,
      }}
    >
      {squares}
    </div>
  );
}
