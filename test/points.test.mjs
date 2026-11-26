import assert from 'node:assert/strict';
import test from 'node:test';
import {
  choosePointBid,
  choosePointTrio,
  createPointGame,
  getPointView,
  listPointTrios,
  selectPointTrio,
  submitPointBid,
} from '../public/points.mjs';

function playRound(game, trio, firstBid, secondBid) {
  assert.equal(selectPointTrio(game, trio), true);
  assert.equal(submitPointBid(game, 0, firstBid), true);
  assert.equal(submitPointBid(game, 1, secondBid), true);
}

test('a point game starts with an empty 15 by 15 board and ten points each', () => {
  const view = getPointView(createPointGame());
  assert.equal(view.size, 15);
  assert.deepEqual(view.board, Array(225).fill(null));
  assert.equal(view.phase, 'select');
  assert.deepEqual(view.budgets, [10, 10]);
});

test('a point round can settle all three intersections at the bottom-right edge', () => {
  const game = createPointGame();
  const bottomRightTrio = [222, 223, 224];
  assert.equal(listPointTrios(game).some((trio) => trio.join(',') === bottomRightTrio.join(',')), true);
  playRound(game, bottomRightTrio, [3, 1, 1], [1, 1, 1]);
  assert.deepEqual(getPointView(game).board.slice(-3), [0, 1, 1]);
});

test('the selector must pick three consecutive empty intersections on one line', () => {
  const game = createPointGame(7);
  assert.equal(listPointTrios(game).some((trio) => trio.join(',') === '6,12,18'), true);
  assert.equal(selectPointTrio(game, [5, 6, 7]), false);
  assert.equal(selectPointTrio(game, [0, 1, 3]), false);
  assert.equal(selectPointTrio(game, [0, 1, 1]), false);
  assert.equal(selectPointTrio(game, [0, 1, Symbol()]), false);
  playRound(game, [12, 6, 18], [1, 1, 1], [1, 1, 1]);
  assert.deepEqual(getPointView(game).lastRound.trio, [12, 6, 18]);
  assert.equal(listPointTrios(game).some((trio) => trio.includes(18)), false);
  assert.equal(selectPointTrio(game, [18, 19, 20]), false);
});

test('players secretly allocate whole points within budget and can only submit once', () => {
  const game = createPointGame();
  assert.equal(submitPointBid(game, 0, [4, 2, 1]), false);
  assert.equal(selectPointTrio(game, [0, 1, 2]), true);
  for (const invalid of [[0, 5, 5], [1.5, 1, 1], [1, 1], [8, 2, 1], null]) {
    assert.equal(submitPointBid(game, 0, invalid), false);
  }
  assert.equal(submitPointBid(game, 1, [1, 3, 1]), true);
  const pending = getPointView(game);
  assert.deepEqual(pending.submitted, [false, true]);
  assert.deepEqual(pending.budgets, [10, 10]);
  assert.equal(pending.lastRound, null);
  assert.equal(Object.hasOwn(pending, 'bids'), false);
  assert.deepEqual(pending.board.slice(0, 3), [null, null, null]);
  assert.equal(submitPointBid(game, 1, [1, 1, 1]), false);
  assert.equal(submitPointBid(game, 0, [4, 2, 1]), true);
  assert.equal(Object.hasOwn(getPointView(game).lastRound, 'bids'), false);
});

test('each spot resolves on its own and ties favor the player who did not select it', () => {
  const game = createPointGame();
  playRound(game, [2, 0, 1], [3, 1, 2], [2, 1, 2]);
  let view = getPointView(game);
  assert.deepEqual(view.lastRound.owners, [0, 1, 1]);
  assert.deepEqual(view.board.slice(0, 3), [1, 1, 0]);
  assert.equal(view.selector, 1);
  assert.equal(view.round, 2);
  playRound(game, [3, 4, 5], [1, 1, 1], [1, 1, 1]);
  view = getPointView(game);
  assert.deepEqual(view.lastRound.owners, [0, 0, 0]);
  assert.equal(view.selector, 0);
});

test('half the unspent points rounded down are added to each new ten-point budget', () => {
  const game = createPointGame();
  playRound(game, [0, 1, 2], [1, 1, 3], [8, 1, 1]);
  assert.deepEqual(getPointView(game).budgets, [12, 10]);
});

test('a run of six wins once after all three intersections are awarded', () => {
  const game = createPointGame(7);
  playRound(game, [0, 1, 2], [3, 3, 3], [1, 1, 1]);
  playRound(game, [3, 4, 5], [3, 3, 3], [1, 1, 1]);
  const view = getPointView(game);
  assert.equal(view.phase, 'finished');
  assert.equal(view.result.winner, 0);
  assert.deepEqual(view.result.line, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(view.result.lines.map((lines) => lines.length), [1, 0]);
  assert.equal(selectPointTrio(game, [7, 8, 9]), false);
  assert.equal(submitPointBid(game, 0, [1, 1, 1]), false);
});

test('simultaneous equal lines draw after all three intersections are awarded', () => {
  const game = createPointGame(7);
  playRound(game, [0, 7, 14], [3, 3, 3], [1, 1, 1]);
  playRound(game, [1, 8, 15], [1, 1, 1], [3, 3, 3]);
  playRound(game, [21, 22, 23], [3, 1, 1], [1, 3, 3]);
  playRound(game, [28, 29, 30], [3, 1, 1], [1, 3, 1]);
  const { result } = getPointView(game);
  assert.equal(result.winner, null);
  assert.equal(result.reason, 'simultaneous');
  assert.deepEqual(result.lines, [[[0, 7, 14, 21, 28]], [[1, 8, 15, 22, 29]]]);
});

test('a player making more lines in the same round wins', () => {
  const game = createPointGame();
  playRound(game, [60, 61, 62], [3, 3, 3], [1, 1, 1]);
  playRound(game, [4, 19, 34], [3, 3, 3], [1, 1, 1]);
  playRound(game, [5, 20, 35], [1, 1, 1], [3, 3, 3]);
  playRound(game, [48, 49, 50], [5, 5, 1], [1, 1, 5]);
  playRound(game, [63, 78, 93], [3, 3, 3], [1, 1, 1]);
  playRound(game, [64, 65, 66], [3, 1, 1], [1, 3, 3]);
  const { result } = getPointView(game);
  assert.equal(result.winner, 0);
  assert.deepEqual(result.lines.map((lines) => lines.length), [2, 1]);
});

test('a board with vacancies but no remaining legal trio ends in a draw', () => {
  const game = createPointGame(5);
  for (let col = 0; col < 5; col++) {
    const [black, white] = col % 2 === 0 ? [[3, 3, 3], [1, 1, 1]] : [[1, 1, 1], [3, 3, 3]];
    playRound(game, [5 + col, 10 + col, 15 + col], black, white);
  }
  playRound(game, [1, 2, 3], [3, 1, 3], [1, 3, 1]);
  playRound(game, [21, 22, 23], [1, 3, 1], [3, 1, 3]);
  const view = getPointView(game);
  assert.equal(view.board.filter((point) => point === null).length, 4);
  assert.equal(view.result.winner, null);
  assert.equal(view.result.reason, 'blocked');
  assert.equal(choosePointTrio(game), null);
});

test('the beginner computer selects a central trio over extending a three-stone line', () => {
  const game = createPointGame(7);
  playRound(game, [0, 1, 2], [3, 3, 3], [1, 1, 1]);
  playRound(game, [42, 43, 44], [1, 1, 1], [3, 3, 3]);
  assert.equal(choosePointTrio(game).includes(24), true);
});

test('the beginner computer keeps bidding modest on a three-stone line', () => {
  const game = createPointGame(7);
  playRound(game, [0, 1, 2], [3, 3, 3], [1, 1, 1]);
  assert.equal(selectPointTrio(game, [3, 4, 5]), true);
  assert.deepEqual(choosePointBid(game, 0).toSorted(), [2, 3, 3]);
});

test('computer selects an immediate winning opportunity and prioritizes its bid', () => {
  const game = createPointGame(7);
  playRound(game, [0, 1, 2], [3, 3, 3], [1, 1, 1]);
  playRound(game, [3, 11, 19], [3, 3, 3], [1, 1, 1]);
  const trio = choosePointTrio(game);
  assert.equal(trio.includes(4), true);
  assert.equal(selectPointTrio(game, trio), true);
  const computerBid = choosePointBid(game, 0);
  assert.equal(computerBid[trio.indexOf(4)], 4);
  assert.equal(submitPointBid(game, 1, [1, 1, 1]), true);
  assert.deepEqual(choosePointBid(game, 0), computerBid);
  assert.equal(submitPointBid(game, 0, computerBid), true);
  assert.equal(getPointView(game).result.winner, 0);
});
