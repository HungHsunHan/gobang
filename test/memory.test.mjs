import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseMemoryMove,
  createMemoryGame,
  getMemoryView,
  playMemoryMove,
} from '../public/memory.mjs';

function playMoves(game, moves) {
  for (const index of moves) {
    assert.equal(playMemoryMove(game, index), true, `expected to place at ${index}`);
  }
  return game;
}

function alternate(first, second) {
  return first.flatMap((index, move) => move < second.length ? [index, second[move]] : [index]);
}

test('a new game has a 15 × 15 empty board and player 0 moves first', () => {
  const game = createMemoryGame();
  assert.deepEqual(game, {
    size: 15,
    board: Array(225).fill(null),
    turn: 0,
    result: null,
    lastMove: null,
    moveCount: 0,
  });
});

test('illegal moves leave the board, turn, and last move unchanged', () => {
  const game = playMoves(createMemoryGame(), [112]);
  const previous = structuredClone(game);

  for (const index of [112, -1, 225, 2.5, '0', null]) {
    assert.equal(playMemoryMove(game, index), false);
  }
  assert.deepEqual(game, previous);
});

test('both players have identical covered stones during play', () => {
  const game = playMoves(createMemoryGame(7), [24, 25]);
  const view = getMemoryView(game);

  assert.deepEqual(view.board, Array(49).fill(null).with(24, 'covered').with(25, 'covered'));
  assert.equal(view.turn, 0);
  assert.equal(view.lastMove, 25);
  assert.equal(view.moveCount, 2);
  assert.deepEqual(game.board.slice(24, 26), [0, 1]);
});

const winningLines = {
  horizontal: [10, 11, 12, 13, 14],
  vertical: [10, 19, 28, 37, 46],
  'down-right diagonal': [10, 20, 30, 40, 50],
  'down-left diagonal': [14, 22, 30, 38, 46],
};

for (const [direction, line] of Object.entries(winningLines)) {
  test(`five contiguous stones win on a ${direction} line`, () => {
    const game = playMoves(createMemoryGame(9), alternate(line, [72, 74, 76, 78]));
    assert.deepEqual(game.result, { winner: 0, line });
  });
}

test('six contiguous stones win when a move fills the gap', () => {
  const game = playMoves(createMemoryGame(9), alternate([28, 29, 31, 32, 33, 30], [0, 2, 4, 6, 8]));
  assert.deepEqual(game.result, { winner: 0, line: [28, 29, 30, 31, 32, 33] });
});

test('indices that cross the board boundary do not count as a row', () => {
  const game = playMoves(createMemoryGame(9), alternate([7, 8, 9, 10, 11], [72, 74, 76, 78]));
  assert.equal(game.result, null);
});

test('a finished game reveals stone owners and refuses further moves', () => {
  const line = [18, 19, 20, 21, 22];
  const game = playMoves(createMemoryGame(9), alternate([0, 2, 4, 6, 8], line));
  const reveal = getMemoryView(game);

  assert.deepEqual(reveal.result, { winner: 1, line });
  assert.deepEqual(reveal.board, game.board);
  assert.equal(playMemoryMove(game, 9), false);
  assert.equal(chooseMemoryMove(game), null);
});

test('a full board without a winning line ends in a draw and reveals the board', () => {
  const game = createMemoryGame(5);
  const indices = [[], []];
  for (let row = 0; row < game.size; row += 1) {
    for (let column = 0; column < game.size; column += 1) {
      const player = (row + Math.floor(column / 2)) % 2;
      indices[player].push(row * game.size + column);
    }
  }

  playMoves(game, alternate(...indices));
  assert.deepEqual(game.result, { winner: null, line: [] });
  assert.deepEqual(getMemoryView(game).board, game.board);
});

test('the computer takes the center of an empty board', () => {
  assert.equal(chooseMemoryMove(createMemoryGame()), 112);
});

test('the computer prefers an immediate win to blocking and leaves state untouched', () => {
  const game = playMoves(createMemoryGame(9), [0, 9, 1, 10, 2, 11, 3, 12, 80]);
  const previous = structuredClone(game);

  assert.equal(chooseMemoryMove(game), 13);
  assert.deepEqual(game, previous);
});

test('the computer blocks a rival four with a single winning end', () => {
  const game = playMoves(createMemoryGame(9), [0, 72, 1, 74, 2, 76, 3]);
  assert.equal(chooseMemoryMove(game), 4);
});
