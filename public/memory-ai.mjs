const EMPTY = 0;
const EDGE = 3;
const WINDOW_RADIUS = 5;
const WIN = 1_000_000;
const TWO_WINNING_POINTS = 100_000;
const FOUR = 4_500;
const OPEN_THREE = 1_800;
const SEARCH_WIDTH = [12, 8, 5, 4];
const STONE_COUNT = Array(32).fill(0);

for (let bits = 1; bits < STONE_COUNT.length; bits += 1) {
  STONE_COUNT[bits] = 1 + STONE_COUNT[bits & (bits - 1)];
}

function createPosition(game) {
  const { size } = game;
  // The border lets the line evaluator scan across a board edge without wrapping.
  const stride = size + 2 * WINDOW_RADIUS;
  const position = {
    board: new Uint8Array(stride ** 2).fill(EDGE),
    nearby: new Uint8Array(stride ** 2),
    directions: [1, stride, stride + 1, stride - 1],
    neighborOffsets: [],
    cells: [],
  };

  for (let row = -2; row <= 2; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      if (row || column) position.neighborOffsets.push(row * stride + column);
    }
  }
  const center = (size - 1) / 2;
  for (const [originalIndex, stone] of game.board.entries()) {
    const row = Math.floor(originalIndex / size);
    const column = originalIndex % size;
    const index = (row + WINDOW_RADIUS) * stride + column + WINDOW_RADIUS;
    const distance = Math.abs(row - center) + Math.abs(column - center);
    position.cells.push({ index, originalIndex, center: 1 / (1 + distance) });
    if (stone === null) position.board[index] = EMPTY;
    else setStone(position, index, stone + 1);
  }
  position.cells.sort((first, second) => second.center - first.center);
  return position;
}

function setStone(position, index, stone) {
  position.board[index] = stone;
  // A candidate must be within two cells of a stone to contribute immediately.
  const change = stone === EMPTY ? -1 : 1;
  for (const offset of position.neighborOffsets) position.nearby[index + offset] += change;
}

function moveValue(position, index, player) {
  let winningPoints = 0;
  let openThrees = 0;
  let support = 0;

  for (const direction of position.directions) {
    // Five cells on either side include the endpoints outside each possible five.
    let own = 1 << WINDOW_RADIUS;
    let blocked = 0;
    for (let bit = 0; bit <= 2 * WINDOW_RADIUS; bit += 1) {
      if (bit === WINDOW_RADIUS) continue;
      const stone = position.board[index + (bit - WINDOW_RADIUS) * direction];
      if (stone === player) own |= 1 << bit;
      else if (stone !== EMPTY) blocked |= 1 << bit;
    }

    let winningEnds = 0;
    let mostStones = 1;
    for (let start = 1; start <= WINDOW_RADIUS; start += 1) {
      const five = 0b11111 << start;
      const ends = 0b1000001 << (start - 1);
      if ((five & blocked) || (ends & own)) continue;
      const count = STONE_COUNT[(own & five) >> start];
      if (count === 5) return WIN;
      if (count === 4) winningEnds |= five & ~own;
      mostStones = Math.max(mostStones, count);
    }

    if (winningEnds) {
      // Overlapping windows may point to the same winning cell.
      winningPoints += (winningEnds & (winningEnds - 1)) ? 2 : 1;
      continue;
    }

    let openStones = 1;
    for (let start = 1; start < WINDOW_RADIUS; start += 1) {
      const middle = 0b011110 << start;
      const ends = 0b100001 << start;
      const beyondEnds = 0b10000001 << (start - 1);
      if (((middle | ends) & blocked) || ((ends | beyondEnds) & own)) continue;
      openStones = Math.max(openStones, STONE_COUNT[(own & middle) >> start]);
    }

    if (openStones === 3) openThrees += 1;
    else if (mostStones === 3) support += 150;
    else if (openStones === 2) support += 100;
    else if (mostStones === 2) support += 25;
  }

  if (winningPoints >= 2) return TWO_WINNING_POINTS;
  if (winningPoints && openThrees) return 26_000 + support;
  if (openThrees >= 2) return 15_000 + support;
  return winningPoints * FOUR + openThrees * OPEN_THREE + support;
}

function scanMoves(position, player) {
  const opponent = player === 1 ? 2 : 1;
  const moves = [];
  const forced = [];
  let fallback;
  let winning;
  let fork;
  let attack = 0;
  let defense = 0;

  for (const cell of position.cells) {
    const { index } = cell;
    if (position.board[index] !== EMPTY) continue;
    fallback ??= cell;
    if (position.nearby[index] === 0) continue;

    const own = moveValue(position, index, player);
    if (own === WIN) {
      winning = cell;
      break;
    }
    const rival = moveValue(position, index, opponent);
    if (rival === WIN) forced.push(cell);
    if (own === TWO_WINNING_POINTS) fork ??= cell;
    attack = Math.max(attack, own);
    defense = Math.max(defense, rival);
    moves.push({ ...cell, score: own + 0.9 * rival + cell.center });
  }

  return { moves, forced, fallback, winning, fork, attack, defense };
}

function search(position, player, ply, extensions, alpha, beta) {
  const { moves, forced, fallback, winning, fork, attack, defense } = scanMoves(position, player);
  if (winning) return WIN - ply;
  if (!fallback) return 0;
  if (forced.length > 1) return -WIN + ply + 1;
  if (fork && !forced.length) return WIN - ply - 2;
  const atHorizon = ply >= SEARCH_WIDTH.length;
  if (atHorizon && (!forced.length || !extensions)) {
    return forced.length ? -FOUR : attack - 0.9 * defense;
  }

  const choices = forced.length ? forced : moves.sort((first, second) => second.score - first.score);
  const limit = forced.length || SEARCH_WIDTH[ply];
  const opponent = player === 1 ? 2 : 1;
  // Keep following forced blocks for a limited number of moves beyond the normal depth.
  const nextExtensions = atHorizon ? extensions - 1 : extensions;
  let best = -Infinity;
  for (const { index } of choices.slice(0, limit)) {
    setStone(position, index, player);
    const score = -search(position, opponent, ply + 1, nextExtensions, -beta, -alpha);
    setStone(position, index, EMPTY);
    best = Math.max(best, score);
    alpha = Math.max(alpha, best);
    if (alpha >= beta) break;
  }
  return best;
}

export function searchMemoryMove(game) {
  const position = createPosition(game);
  const player = game.turn + 1;
  const opponent = 2 - game.turn;
  const { moves, forced, fallback, winning, fork } = scanMoves(position, player);
  if (winning) return winning.originalIndex;
  if (forced.length) return forced[0].originalIndex;
  if (fork) return fork.originalIndex;
  if (!moves.length) return fallback?.originalIndex ?? null;

  const choices = moves.sort((first, second) => second.score - first.score);
  let best = choices[0];
  let bestScore = -Infinity;
  for (const move of choices.slice(0, SEARCH_WIDTH[0])) {
    setStone(position, move.index, player);
    const score = -search(position, opponent, 1, 2, -Infinity, -bestScore);
    setStone(position, move.index, EMPTY);
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best.originalIndex;
}
