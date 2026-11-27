import { searchMemoryMove } from './memory-ai.mjs';

const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const LINE_LENGTH = 5;

export function createMemoryGame(size = 15) {
  if (!Number.isInteger(size) || size < LINE_LENGTH) {
    throw new RangeError('A Gomoku board must be at least 5 × 5.');
  }

  return {
    size,
    board: Array(size ** 2).fill(null),
    turn: 0,
    result: null,
    lastMove: null,
    moveCount: 0,
  };
}

function scanSide(game, player, row, column, rowStep, columnStep) {
  const { board, size } = game;
  const indices = [];
  row += rowStep;
  column += columnStep;

  while (row >= 0 && row < size && column >= 0 && column < size) {
    const index = row * size + column;
    if (board[index] !== player) break;
    indices.push(index);
    row += rowStep;
    column += columnStep;
  }

  return indices;
}

function linesThrough(game, index, player) {
  const row = Math.floor(index / game.size);
  const column = index % game.size;

  return DIRECTIONS.map(([rowStep, columnStep]) => {
    const before = scanSide(game, player, row, column, -rowStep, -columnStep);
    const after = scanSide(game, player, row, column, rowStep, columnStep);

    return [...before.reverse(), index, ...after];
  });
}

export function playMemoryMove(game, index) {
  if (game.result || !Number.isInteger(index) || game.board[index] !== null) {
    return false;
  }

  game.board[index] = game.turn;
  game.lastMove = index;
  game.moveCount += 1;

  const winningLine = linesThrough(game, index, game.turn).find((line) => line.length >= LINE_LENGTH);
  if (winningLine) {
    game.result = { winner: game.turn, line: winningLine };
  } else if (game.moveCount === game.board.length) {
    game.result = { winner: null, line: [] };
  } else {
    game.turn = 1 - game.turn;
  }

  return true;
}

export function getMemoryView(game) {
  return {
    ...game,
    board: game.board.map((stone) => stone === null || game.result ? stone : 'covered'),
    result: game.result && { ...game.result, line: [...game.result.line] },
  };
}

export function chooseMemoryMove(game) {
  return game.result ? null : searchMemoryMove(game);
}
