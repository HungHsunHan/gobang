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
const devilsPlanImages = ['devils-plan-cast', 'devils-plan-finalists'];
const outcomes = [
  { title: '你贏了！', chiikawa: '優秀！', devilsPlan: ['來挑戰我們吧！', '恭喜你逃脫流配地，去主戰場贏下勝利吧'] },
  { title: '你輸了', chiikawa: '我們會為你應援的！', devilsPlan: ['等你下次來挑戰', '你是魔鬼的計謀第一位淘汰玩家'] },
];

for (const [label, mode, winner, progress, wasLongMatch] of [
  ['a blind win before the computer plays its seventh move', 'memory', 0, { moveCount: 13 }, false],
  ['a blind loss on the computer’s sixth move', 'memory', 1, { moveCount: 12 }, false],
  ['a blind win after both players have played seven moves', 'memory', 0, { moveCount: 15 }, true],
  ['a blind loss on the computer’s seventh move', 'memory', 1, { moveCount: 14 }, true],
  ['a bidding win in round six', 'point', 0, { round: 6 }, false],
  ['a bidding loss in round six', 'point', 1, { round: 6 }, false],
  ['a bidding win in round seven', 'point', 0, { round: 7 }, true],
  ['a bidding loss in round seven', 'point', 1, { round: 7 }, true],
]) {
  test(`${label} selects the matching images and messages`, () => {
    const { title, chiikawa, devilsPlan } = outcomes[winner];
    const images = wasLongMatch ? devilsPlanImages : chiikawaImages;
    const view = { ...progress, result: { winner } };
    const selected = images.map((_, index) =>
      selectResultDisplay('computer', mode, view, () => (index + 0.5) / images.length));

    assert.deepEqual(selected, images.map((name, index) => ({
      image: `./victory/${name}.webp`,
      title,
      message: wasLongMatch ? devilsPlan[index] : chiikawa,
    })));
  });
}

for (const [label, opponent, result] of [
  ['an unfinished game', 'computer', null],
  ['a draw', 'computer', { winner: null }],
  ['a local player win', 'local', { winner: 0 }],
  ['an online player win', 'online', { winner: 0 }],
]) {
  test(`${label} does not select a result display`, () => {
    const view = { result, moveCount: 15 };
    assert.equal(selectResultDisplay(opponent, 'memory', view, () => assert.fail('Unexpected random draw')), null);
  });
}
