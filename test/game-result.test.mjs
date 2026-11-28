import assert from 'node:assert/strict';
import test from 'node:test';
import { selectResultDisplay } from '../public/game-result.mjs';

const chiikawaImages = [
  'chiikawa-1',
  'chiikawa-2',
  'chiikawa-3',
  'chiikawa-4',
  'chiikawa-5',
];
const devilsPlanImages = ['devils-plan-cast', 'devils-plan-mask'];
const outcomes = [
  { title: '你贏了！', chiikawa: '優秀！', devilsPlan: ['來挑戰我們吧！', '恭喜你逃脫流配地，去主戰場贏下勝利吧'] },
  { title: '你輸了', chiikawa: '我們會為你應援的！', devilsPlan: ['等你下次來挑戰', '你是魔鬼的計謀第一位淘汰玩家'] },
];

for (const [label, mode, winner, progress, wasLongMatch] of [
  ['a blind result after 19 moves', 'memory', 0, { moveCount: 19 }, false],
  ['a blind result after 18 moves', 'memory', 1, { moveCount: 18 }, false],
  ['a blind result after 21 moves', 'memory', 0, { moveCount: 21 }, true],
  ['a blind result after 20 moves', 'memory', 1, { moveCount: 20 }, true],
  ['a dark-side bidding win in round six', 'point', 0, { round: 6 }, false],
  ['a light-side bidding win in round six', 'point', 1, { round: 6 }, false],
  ['a dark-side bidding win in round seven', 'point', 0, { round: 7 }, true],
  ['a light-side bidding win in round seven', 'point', 1, { round: 7 }, true],
]) {
  for (const player of [0, 1]) {
    test(`${label} shows the right images and copy for seat ${player}`, () => {
      const { title, chiikawa, devilsPlan } = outcomes[Number(player !== winner)];
      const images = wasLongMatch ? devilsPlanImages : chiikawaImages;
      const view = { ...progress, result: { winner } };
      const selected = images.map((_, index) =>
        selectResultDisplay(player, mode, view, () => (index + 0.5) / images.length));

      assert.deepEqual(selected, images.map((name, index) => ({
        image: `./victory/${name}.webp`,
        title,
        message: wasLongMatch ? devilsPlan[index] : chiikawa,
      })));
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
    const view = { result, moveCount: 15 };
    assert.equal(selectResultDisplay(player, 'memory', view, () => assert.fail('Unexpected random draw')), null);
  });
}
