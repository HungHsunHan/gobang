import assert from 'node:assert/strict';
import test from 'node:test';
import { selectResultDisplay } from '../public/game-result.mjs';

const celebrationImages = [
  'chiikawa-1',
  'chiikawa-2',
  'chiikawa-3',
  'chiikawa-4',
  'chiikawa-5',
  'chiikawa-6',
  'chiikawa-7',
  'chiikawa-8',
  'tamagotchi-1',
  'tamagotchi-2',
];
const devilsPlanImages = ['devils-plan-cast', 'devils-plan-mask'];
const outcomes = [
  { title: '你贏了！', celebration: '優秀！', devilsPlan: ['來挑戰我們吧！', '恭喜你逃脫流配地，去主戰場贏下勝利吧'] },
  { title: '你輸了', celebration: '我們會為你應援的！', devilsPlan: ['等你下次來挑戰', '你是魔鬼的計謀第一位淘汰玩家'] },
];

function buildBoard(size, placements) {
  const board = Array(size * size).fill(null);
  for (const [player, points] of placements) {
    for (const [row, column] of points) {
      board[row * size + column] = player;
    }
  }
  return board;
}

function fillScattered(board, size, player, needed) {
  let placed = board.filter((cell) => cell === player).length;
  for (let row = 0; row < size && placed < needed; row += 2) {
    for (let column = 0; column < size && placed < needed; column += 2) {
      const index = row * size + column;
      if (board[index] === null) {
        board[index] = player;
        placed++;
      }
    }
  }
  return board;
}

function makeBoardWith(winner, {
  size = 15,
  loserPattern = [],
  winnerExtras = [],
  winnerTotal = 12,
  loserTotal = 12,
} = {}) {
  const loser = 1 - winner;
  const winnerLine = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]];
  const board = buildBoard(size, [
    [winner, [...winnerLine, ...winnerExtras]],
    [loser, loserPattern],
  ]);
  fillScattered(board, size, winner, winnerTotal);
  fillScattered(board, size, loser, loserTotal);
  return { size, board };
}

function assertPool(player, mode, view, winner, isFierce) {
  const { title, celebration, devilsPlan } = outcomes[Number(player !== winner)];
  const images = isFierce ? devilsPlanImages : celebrationImages;
  const selected = images.map((_, index) =>
    selectResultDisplay(player, mode, view, () => (index + 0.5) / images.length));

  assert.deepEqual(selected, images.map((name, index) => ({
    image: `./victory/${name}.webp`,
    title,
    message: isFierce ? devilsPlan[index] : celebration,
  })));
}

const blockedFour = (winner) => makeBoardWith(winner, {
  loserPattern: [[7, 4], [7, 5], [7, 6], [7, 7]],
  winnerExtras: [[7, 3], [7, 8]],
});

const brokenFour = (winner) => makeBoardWith(winner, {
  loserPattern: [[7, 4], [7, 5], [7, 7], [7, 8]],
});

const twoThrees = (winner) => makeBoardWith(winner, {
  loserPattern: [[5, 3], [5, 4], [5, 5], [9, 6], [10, 7], [11, 8]],
});

const singleThreeOnly = (winner) => makeBoardWith(winner, {
  loserPattern: [[7, 4], [7, 5], [7, 6]],
});

for (const [label, winner, moveCount, boardFactory, isFierce] of [
  ['a 23-move blind game even with a loser four', 0, 23, blockedFour, false],
  ['a 24-move blind game where the loser only made one three', 0, 24, singleThreeOnly, false],
  ['a 24-move blind game where the loser made a blocked four', 1, 24, blockedFour, true],
  ['a 25-move blind game where the loser threatened a broken four', 0, 25, brokenFour, true],
  ['a 24-move blind game where the loser built two threes', 0, 24, twoThrees, true],
]) {
  for (const player of [0, 1]) {
    test(`${label} shows the right artwork for seat ${player}`, () => {
      const { size, board } = boardFactory(winner);
      assertPool(player, 'memory', { size, board, moveCount, result: { winner } }, winner, isFierce);
    });
  }
}

for (const [label, winner, round, boardOptions, lines, isFierce] of [
  [
    'a round-seven bidding win even with balanced stones and a loser four',
    0, 7,
    { loserPattern: [[7, 4], [7, 5], [7, 6], [7, 7]], winnerTotal: 11, loserTotal: 10 },
    [[[0, 1, 2, 3, 4]], []],
    false,
  ],
  [
    'a round-eight bidding blowout where the loser holds fewer than 35% of stones',
    0, 8,
    { loserPattern: [[7, 4], [7, 5], [7, 6], [7, 7]], winnerTotal: 16, loserTotal: 8 },
    [[[0, 1, 2, 3, 4]], []],
    false,
  ],
  [
    'a round-eight balanced bidding win where the loser has only one three',
    1, 8,
    { loserPattern: [[7, 4], [7, 5], [7, 6]], winnerTotal: 14, loserTotal: 10 },
    [[], [[0, 1, 2, 3, 4]]],
    false,
  ],
  [
    'a round-eight balanced bidding win where the loser built a four (9/24 = 37.5%)',
    0, 8,
    { loserPattern: [[7, 4], [7, 5], [7, 6], [7, 7]], winnerTotal: 15, loserTotal: 9 },
    [[[0, 1, 2, 3, 4]], []],
    true,
  ],
  [
    'a round-eight balanced bidding win on a 17×17 board where the loser built two threes',
    1, 8,
    { size: 17, loserPattern: [[5, 3], [5, 4], [5, 5], [9, 6], [10, 7], [11, 8]], winnerTotal: 14, loserTotal: 10 },
    [[], [[0, 1, 2, 3, 4]]],
    true,
  ],
  [
    'an early bidding win where both players formed five in the same round',
    0, 4,
    { loserPattern: [], winnerTotal: 7, loserTotal: 5 },
    [[[0, 1, 2, 3, 4], [15, 16, 17, 18, 19]], [[30, 31, 32, 33, 34]]],
    true,
  ],
]) {
  for (const player of [0, 1]) {
    test(`${label} shows the right artwork for seat ${player}`, () => {
      const { size, board } = makeBoardWith(winner, boardOptions);
      const view = { size, board, round, result: { winner, lines } };
      assertPool(player, 'point', view, winner, isFierce);
    });
  }
}

for (const [label, player, result] of [
  ['an unfinished game', 0, null],
  ['a draw for the dark side', 0, { winner: null }],
  ['a draw for the light side', 1, { winner: null }],
  ['a result without an assigned seat', undefined, { winner: 0 }],
]) {
  test(`${label} does not select a result display`, () => {
    const view = { size: 15, board: Array(225).fill(null), result, moveCount: 30 };
    assert.equal(selectResultDisplay(player, 'memory', view, () => assert.fail('Unexpected random draw')), null);
  });
}
