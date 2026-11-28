const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
const lineLength = 5;
const blindFierceMovesPerPlayer = 12;
const biddingFierceRounds = 8;
const biddingMinLoserShareNumerator = 7; // 7 / 20 = 35%
const biddingMinLoserShareDenominator = 20;

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

function stoneAt(board, size, row, column) {
  if (row < 0 || row >= size || column < 0 || column >= size) return undefined;
  return board[row * size + column];
}

function analyzeLoserBoard(board, size, loser) {
  if (!Array.isArray(board) || !Number.isInteger(size) || size < lineLength || board.length !== size * size) {
    return { runs3: 0, runs4: 0, liveFour: 0, loserStones: 0, totalStones: 0 };
  }

  let totalStones = 0;
  let loserStones = 0;
  for (const stone of board) {
    if (stone === 0 || stone === 1) totalStones++;
    if (stone === loser) loserStones++;
  }

  let runs3 = 0;
  let runs4 = 0;
  let liveFour = 0;

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      for (const [dr, dc] of directions) {
        if (board[row * size + column] === loser && stoneAt(board, size, row - dr, column - dc) !== loser) {
          let length = 0;
          let r = row;
          let c = column;
          while (stoneAt(board, size, r, c) === loser) {
            length++;
            r += dr;
            c += dc;
          }
          if (length >= 4) runs4++;
          else if (length === 3) runs3++;
        }

        const endRow = row + (lineLength - 1) * dr;
        const endColumn = column + (lineLength - 1) * dc;
        if (endRow < 0 || endRow >= size || endColumn < 0 || endColumn >= size) continue;
        if (stoneAt(board, size, row - dr, column - dc) === loser) continue;
        if (stoneAt(board, size, endRow + dr, endColumn + dc) === loser) continue;

        let mine = 0;
        let empty = 0;
        for (let step = 0; step < lineLength; step++) {
          const cell = board[(row + step * dr) * size + (column + step * dc)];
          if (cell === loser) mine++;
          else if (cell === null) empty++;
        }
        if (mine === 4 && empty === 1) liveFour++;
      }
    }
  }

  return { runs3, runs4, liveFour, loserStones, totalStones };
}

function isFierceMatch(mode, { board, size, result, moveCount, round }) {
  const loser = 1 - result.winner;

  if (mode === 'point' && result.lines?.[0]?.length > 0 && result.lines?.[1]?.length > 0) {
    return true;
  }

  const { runs3, runs4, liveFour, loserStones, totalStones } = analyzeLoserBoard(board, size, loser);
  const hasLoserThreat = runs4 >= 1 || liveFour >= 1 || runs3 >= 2;

  if (mode === 'memory') {
    return moveCount >= blindFierceMovesPerPlayer * 2 && hasLoserThreat;
  }

  const balancedStones = totalStones > 0
    && loserStones * biddingMinLoserShareDenominator >= totalStones * biddingMinLoserShareNumerator;
  return round >= biddingFierceRounds && balancedStones && hasLoserThreat;
}

export function selectResultDisplay(player, mode, view, random = Math.random) {
  const winner = view?.result?.winner;
  if ((player !== 0 && player !== 1) || (winner !== 0 && winner !== 1)) return null;

  const images = isFierceMatch(mode, view) ? devilsPlanImages : celebrationImages;
  const { image, win, loss } = images[Math.floor(random() * images.length)];
  return winner === player
    ? { image, title: '你贏了！', message: win }
    : { image, title: '你輸了', message: loss };
}
