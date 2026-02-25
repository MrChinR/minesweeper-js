// domain/services/LogicSolver.js
"use strict";

export class LogicSolver {
  /**
   * 盤面が論理的（推測なし）に解けるか検証する
   * @param {Board} board 
   * @param {Object} startPosition {x, y}
   * @returns {boolean}
   */
  static isSolvable(board, startPosition) {
    const bounds = board.bounds;
    const grid = [];
    let hiddenSafeCount = 0;

    // 1. 盤面の状態をシミュレーション用にコピーする
    for (let x = 0; x < bounds.rows; x++) {
      grid[x] = [];
      for (let y = 0; y < bounds.cols; y++) {
        const cellResult = board.getCellAt({ x, y });
        const cell = cellResult.isSuccess ? cellResult.value : null;
        
        // 注: Cellクラスのプロパティ名（adjacentMines等）は実際のプロパティに合わせてください
        grid[x][y] = {
          state: 'hidden', // 'hidden', 'revealed', 'flagged'
          isMine: cell ? cell.containsMine : false,
          value: cell ? (cell.adjacentMines || 0) : 0
        };
        
        if (!grid[x][y].isMine) {
          hiddenSafeCount++;
        }
      }
    }

    // 周囲のマスを取得するヘルパー関数
    const getNeighbors = (x, y) => {
      const neighbors = [];
      for (let dx of [-1, 0, 1]) {
        for (let dy of [-1, 0, 1]) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < bounds.rows && ny >= 0 && ny < bounds.cols) {
            neighbors.push({ x: nx, y: ny, cell: grid[nx][ny] });
          }
        }
      }
      return neighbors;
    };

    // 2. 自動展開（0マスを開けた際の連鎖）
    const reveal = (x, y) => {
      const cell = grid[x][y];
      if (cell.state !== 'hidden' || cell.isMine) return;
      
      cell.state = 'revealed';
      hiddenSafeCount--;
      
      // 数字が0の場合、周囲も連鎖して開ける
      if (cell.value === 0) {
        getNeighbors(x, y).forEach(n => reveal(n.x, n.y));
      }
    };

    // 最初のクリック位置（空白マスを想定）を開ける
    if (grid[startPosition.x][startPosition.y].isMine) return false;
    reveal(startPosition.x, startPosition.y);

    // 3. AIによる論理推論ループ
    let changed = true;
    while (changed && hiddenSafeCount > 0) {
      changed = false;
      
      for (let x = 0; x < bounds.rows; x++) {
        for (let y = 0; y < bounds.cols; y++) {
          if (grid[x][y].state === 'revealed') {
            const neighbors = getNeighbors(x, y);
            const hidden = neighbors.filter(n => n.cell.state === 'hidden');
            const flagged = neighbors.filter(n => n.cell.state === 'flagged');
            
            // AIルール1: 未確定マスの数 ＋ 既にフラグが立った数 ＝ そのマスの数字
            // → 残りの未確定マスはすべて地雷（フラグを立てる）
            if (hidden.length > 0 && grid[x][y].value === flagged.length + hidden.length) {
              hidden.forEach(n => {
                n.cell.state = 'flagged';
                changed = true;
              });
            }
            
            // AIルール2: 既にフラグが立った数 ＝ そのマスの数字
            // → 残りの未確定マスはすべて安全（開ける）
            if (hidden.length > 0 && grid[x][y].value === flagged.length) {
              hidden.forEach(n => {
                reveal(n.x, n.y);
                changed = true;
              });
            }
          }
        }
      }
    }

    // すべての安全なマスが開けられていれば、推測なしでクリア可能（true）
    return hiddenSafeCount === 0;
  }
}
