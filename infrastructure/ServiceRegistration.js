// infrastructure/ServiceRegistration.js
"use strict";

import { Container } from './Container.js';
import { EventBus } from '../common/EventBus.js';
import { GameRules } from '../domain/services/GameRules.js';
import { CellInteractionService } from '../domain/services/CellInteractionService.js';
import { NeighborService } from '../domain/services/NeighborService.js';
import { Board } from '../domain/entities/Board.js';
import { Cell } from '../domain/entities/Cell.js';
import { Position } from '../domain/value-objects/Position.js';
import { MinesweeperGameService } from '../application/MinesweeperGameService.js';
import { CellRenderer } from '../presentation/CellRenderer.js';
import { GameOverService } from './GameOverService.js';
import { GAME_CONSTANTS } from '../common/GameConstants.js';
import { Result } from '../common/Result.js';

// 新規追加：無推測モード用ロジックソルバー
import { LogicSolver } from '../domain/services/LogicSolver.js';

export function createContainer() {
  const container = new Container();
  
  // Core infrastructure
  container.register('eventBus', () => new EventBus(), { singleton: true });
  container.register('gameOverService', () => new GameOverService(), { singleton: true });
  
  // Domain services
  container.register('gameRules', () => new GameRules(), { singleton: true });
  container.register('neighborService', () => new NeighborService(), { singleton: true });
  container.register('cellInteractionService', (gameRules) => new CellInteractionService(gameRules), { 
    dependencies: ['gameRules'] 
  });
  
  // Presentation services
  container.register('cellRenderer', (gameOverService) => new CellRenderer(gameOverService), { 
    dependencies: ['gameOverService'],
    singleton: true 
  });
  
  // Board factory
  container.register('boardFactory', () => {
    return (config) => {
      const bounds = { rows: config.rows, cols: config.cols };
      const cellFactory = (position) => {
        const cellId = `${GAME_CONSTANTS.CELL_ID_PREFIX}${position.x}_${position.y}`;
        const cell = new Cell(cellId, false, position);
        return cell;
      };
      return new Board(bounds, cellFactory);
    };
  }, { singleton: true });
  
  // Game service factory (無推測モード向けに修正)
  container.register('gameServiceFactory', (boardFactory, gameRules, cellInteractionService, eventBus, gameOverService) => {
    return (config) => {
      let board;
      let neighborsResult;
      let isSolvable = false;
      let attemptCount = 0;
      const MAX_ATTEMPTS = 500; // ブラウザのフリーズを防ぐための生成上限
      
      // 論理的に解ける盤面が生成されるまで繰り返す
      while (!isSolvable && attemptCount < MAX_ATTEMPTS) {
        attemptCount++;
        
        // 1. 盤面を初期化
        board = boardFactory(config);
        
        // 2. 地雷を配置
        const minePositions = generateMinePositions(config);
        placeMinesOnBoard(board, minePositions);
        
        // 3. 周囲の地雷数を計算
        neighborsResult = NeighborService.calculateMineCountsForBoard(board);
        if (neighborsResult.isFailure) {
          throw new Error(`Failed to calculate mine counts: ${neighborsResult.error}`);
        }
        
        // 4. 検証のスタート地点として「周囲に地雷がないマス(0マス)」を探す
        const startPosition = findZeroMineCell(board, config);
        
        // 5. ソルバーで検証（完全に解ける場合のみループを抜ける）
        if (startPosition) {
          isSolvable = LogicSolver.isSolvable(board, startPosition);
        }
      }
      
      if (attemptCount >= MAX_ATTEMPTS) {
        console.warn(`[警告] ${MAX_ATTEMPTS}回試行しましたが、完全な無推測盤面を生成できませんでした。妥協して開始します。`);
      } else {
        console.log(`[生成完了] 無推測モード盤面が生成されました。試行回数: ${attemptCount}`);
      }
      
      return new MinesweeperGameService(board, gameRules, cellInteractionService, eventBus, gameOverService);
    };
  }, { 
    dependencies: ['boardFactory', 'gameRules', 'cellInteractionService', 'eventBus', 'gameOverService'] 
  });
  
  return container;
}

// 追加機能：検証を開始するための安全な「0」マスを見つける
function findZeroMineCell(board, config) {
  // シャッフルしてランダムな0を探すことも可能ですが、ここではシンプルに左上から走査します
  for (let x = 0; x < config.rows; x++) {
    for (let y = 0; y < config.cols; y++) {
      const cellResult = board.getCellAt({ x, y });
      if (cellResult.isSuccess) {
        const cell = cellResult.value;
        // 地雷ではなく、かつ周囲の地雷数が0であること
        if (!cell.containsMine && (cell.adjacentMines === 0)) {
          return { x, y };
        }
      }
    }
  }
  return null; // 盤面に0マスが一つも存在しない場合
}

function generateMinePositions(config) {
  const positions = [];
  const totalCells = config.rows * config.cols;
  
  if (config.minesNumber >= totalCells) {
    throw new Error('Mine count cannot exceed total cells');
  }
  
  while (positions.length < config.minesNumber) {
    const x = Math.floor(Math.random() * config.rows);
    const y = Math.floor(Math.random() * config.cols);
    const positionKey = `${x},${y}`;
    
    if (!positions.some(pos => `${pos.x},${pos.y}` === positionKey)) {
      positions.push({ x, y });
    }
  }
  
  return positions;
}

function placeMinesOnBoard(board, minePositions) {
  const result = board.placeMines(minePositions);
  if (result.isFailure) {
    throw new Error(result.error);
  }
  return result.value;
}

export function registerDevelopmentServices(container) {
  container.register('logger', () => {
    return {
      log: (...args) => console.log('[MINESWEEPER]', ...args),
      warn: (...args) => console.warn('[MINESWEEPER]', ...args),
      error: (...args) => console.error('[MINESWEEPER]', ...args)
    };
  }, { singleton: true });
  
  return container;
}

export function registerProductionServices(container) {
  container.register('logger', () => {
    return {
      log: () => {}, // No-op in production
      warn: (...args) => console.warn('[MINESWEEPER]', ...args),
      error: (...args) => console.error('[MINESWEEPER]', ...args)
    };
  }, { singleton: true });
  
  return container;
}
