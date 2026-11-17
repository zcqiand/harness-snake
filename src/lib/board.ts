/** 棋盘纯逻辑模块——骨架层：尺寸常量与空板派生。移动/碰撞逻辑随 ch8 灌入。 */

export const BOARD_ROWS = 20;
export const BOARD_COLS = 20;

/** 空棋盘：全 false 的 ROWS×COLS 网格（false=空格）。 */
export function emptyBoard(): boolean[][] {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => false),
  );
}
