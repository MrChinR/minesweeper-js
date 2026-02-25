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
  
  // Game service factory
  container.register('gameServiceFactory', (boardFactory, gameRules, cellInteractionService, eventBus, gameOverService) => {
    return (config) => {
      // 1. 初始化空棋盘（此时不放雷）
      const board = boardFactory(config);
      
      // 2. 传递 config.minesNumber，保证 UI 计数器正确显示
      const service = new MinesweeperGameService(board, gameRules, cellInteractionService, eventBus, gameOverService, config.minesNumber);
      
      // 3. 将布雷逻辑延迟到玩家的“第一击”
      service.setFirstMoveInitialization((firstClickPos) => {
        // 生成地雷时，完美避开第一击的位置及其周围8个格子
        const minePositions = generateSafeMinePositions(config, firstClickPos);
        placeMinesOnBoard(board, minePositions);
        
        // 布雷完毕后，计算周围的数字
        const neighborsResult = NeighborService.calculateMineCountsForBoard(board);
        if (neighborsResult.isFailure) {
          throw new Error(`Failed to calculate mine counts: ${neighborsResult.error}`);
        }
      });
      
      return service;
    };
  }, { 
    dependencies: ['boardFactory', 'gameRules', 'cellInteractionService', 'eventBus', 'gameOverService'] 
  });
  
  return container;
}

// 核心功能：生成绝对安全的地雷坐标（避开首击 3x3 区域）
function generateSafeMinePositions(config, firstClickPos) {
  const positions = [];
  const totalCells = config.rows * config.cols;
  
  if (config.minesNumber >= totalCells) {
    throw new Error('Mine count cannot exceed total cells');
  }

  // 如果剩余格子足够多，则避开玩家点击格子及其周围一圈（共9格），确保点击中心必定是 0 并引发大面积连爆
  const canAvoidNeighbors = config.minesNumber <= (totalCells - 9);

  while (positions.length < config.minesNumber) {
    const x = Math.floor(Math.random() * config.rows);
    const y = Math.floor(Math.random() * config.cols);
    
    if (canAvoidNeighbors) {
      // 避开 3x3 区域
      if (Math.abs(x - firstClickPos.x) <= 1 && Math.abs(y - firstClickPos.y) <= 1) {
        continue;
      }
    } else {
      // 极端高密度情况（极少发生）：仅避开正中心
      if (x === firstClickPos.x && y === firstClickPos.y) {
        continue;
      }
    }
    
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
      log: () => {}, 
      warn: (...args) => console.warn('[MINESWEEPER]', ...args),
      error: (...args) => console.error('[MINESWEEPER]', ...args)
    };
  }, { singleton: true });
  
  return container;
}
