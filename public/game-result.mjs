const blindLongMatchMovesPerPlayer = 10;
const biddingLongMatchRounds = 7;
const celebrationImageNames = [
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
const celebrationImages = celebrationImageNames.map((name) => ({
  image: `./victory/${name}.webp`,
  win: '優秀！',
  loss: '我們會為你應援的！',
}));
const devilsPlanImages = [
  {
    image: './victory/devils-plan-cast.webp',
    win: '來挑戰我們吧！',
    loss: '等你下次來挑戰',
  },
  {
    image: './victory/devils-plan-mask.webp',
    win: '恭喜你逃脫流配地，去主戰場贏下勝利吧',
    loss: '你是魔鬼的計謀第一位淘汰玩家',
  },
];

export function selectResultDisplay(player, mode, { result, moveCount, round }, random = Math.random) {
  const winner = result?.winner;
  if ((player !== 0 && player !== 1) || (winner !== 0 && winner !== 1)) return null;

  const longMatch = mode === 'memory'
    ? moveCount >= blindLongMatchMovesPerPlayer * 2
    : round >= biddingLongMatchRounds;
  const images = longMatch ? devilsPlanImages : celebrationImages;
  const { image, win, loss } = images[Math.floor(random() * images.length)];
  return winner === player
    ? { image, title: '你贏了！', message: win }
    : { image, title: '你輸了', message: loss };
}
