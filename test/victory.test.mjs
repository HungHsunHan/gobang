import assert from 'node:assert/strict';
import test from 'node:test';
import { selectVictoryImage } from '../public/victory.mjs';

test('a player victory over the computer can select each of the seven images', () => {
  const selected = Array.from({ length: 7 }, (_, index) =>
    selectVictoryImage('computer', { winner: 0 }, () => (index + 0.5) / 7));

  assert.deepEqual(selected, Array.from({ length: 7 }, (_, index) =>
    `./victory/celebration-${index + 1}.webp`));
});

for (const [label, opponent, result] of [
  ['an unfinished game', 'computer', null],
  ['a computer win', 'computer', { winner: 1 }],
  ['a draw', 'computer', { winner: null }],
  ['a local player win', 'local', { winner: 0 }],
]) {
  test(`${label} does not select a victory image`, () => {
    assert.equal(selectVictoryImage(opponent, result, () => assert.fail('Unexpected random draw')), null);
  });
}
