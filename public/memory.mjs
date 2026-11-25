const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const LINE_LENGTH = 5;
const OPEN_END_SCORES = [
  [0, 0, 0],
  [0, 0, 2],
  [0, 3, 22],
  [0, 18, 180],
  [0, 115, 900],
];

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
    if (board[index] !== player) {
      return { indices, open: board[index] === null };
    }
    indices.push(index);
    row += rowStep;
    column += columnStep;
  }

  return { indices, open: false };
}

function linesThrough(game, index, player) {
  const row = Math.floor(index / game.size);
  const column = index % game.size;

  return DIRECTIONS.map(([rowStep, columnStep]) => {
    const before = scanSide(game, player, row, column, -rowStep, -columnStep);
    const after = scanSide(game, player, row, column, rowStep, columnStep);

    return {
      indices: [...before.indices.reverse(), index, ...after.indices],
      openEnds: Number(before.open) + Number(after.open),
    };
  });
}

export function playMemoryMove(game, index) {
  if (game.result || !Number.isInteger(index) || game.board[index] !== null) {
    return false;
  }

  game.board[index] = game.turn;
  game.lastMove = index;
  game.moveCount += 1;

  const winningLine = linesThrough(game, index, game.turn).find(({ indices }) => indices.length >= LINE_LENGTH);
  if (winningLine) {
    game.result = { winner: game.turn, line: winningLine.indices };
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

function scoreLines(lines) {
  return lines.reduce((score, { indices, openEnds }) => score + OPEN_END_SCORES[indices.length][openEnds], 0);
}

export function chooseMemoryMove(game) {
  if (game.result) return null;

  const center = (game.size - 1) / 2;
  let bestMove = null;
  let bestScore = -Infinity;

  for (let index = 0; index < game.board.length; index += 1) {
    if (game.board[index] !== null) continue;

    const attack = linesThrough(game, index, game.turn);
    if (attack.some(({ indices }) => indices.length >= LINE_LENGTH)) return index;

    const defense = linesThrough(game, index, 1 - game.turn);
    const blocksWin = defense.some(({ indices }) => indices.length >= LINE_LENGTH);
    const row = Math.floor(index / game.size);
    const column = index % game.size;
    const distance = Math.abs(row - center) + Math.abs(column - center);
    const defenseScore = blocksWin ? 10_000 : scoreLines(defense) * 0.85;
    const score = scoreLines(attack) + defenseScore + 1 / (1 + distance);

    if (score > bestScore) {
      bestMove = index;
      bestScore = score;
    }
  }

  return bestMove;
}
