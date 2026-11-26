const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const ROUND_POINTS = 10;
const WIN_LENGTH = 5;

export function createPointGame(size = 15) {
  if (!Number.isInteger(size) || size < WIN_LENGTH) {
    throw new RangeError(`Board size must be an integer of at least ${WIN_LENGTH}.`);
  }

  return {
    size,
    board: Array(size * size).fill(null),
    selector: 0,
    phase: 'select',
    round: 1,
    trio: [],
    budgets: [ROUND_POINTS, ROUND_POINTS],
    bids: [null, null],
    lastRound: null,
    result: null,
  };
}

function at(board, size, row, col) {
  if (row >= 0 && row < size && col >= 0 && col < size) return board[row * size + col];
}

function* legalTrios({ board, size }) {
  for (let index = 0; index < board.length; index++) {
    if (board[index] !== null) continue;
    const row = Math.floor(index / size);
    const col = index % size;
    for (const [dr, dc] of DIRECTIONS) {
      if (at(board, size, row + dr, col + dc) !== null || at(board, size, row + 2 * dr, col + 2 * dc) !== null) continue;
      const step = dr * size + dc;
      yield [index, index + step, index + 2 * step];
    }
  }
}

export function listPointTrios(game) {
  return game.phase === 'select' ? [...legalTrios(game)] : [];
}

export function selectPointTrio(game, indices) {
  if (game.phase !== 'select' || !Array.isArray(indices) || indices.length !== 3) return false;
  const ordered = [...indices];
  if (ordered.some((index) => !Number.isInteger(index) || game.board[index] !== null)) return false;
  ordered.sort((a, b) => a - b);

  const [first, middle, last] = ordered;
  const dr = Math.floor(middle / game.size) - Math.floor(first / game.size);
  const dc = middle % game.size - first % game.size;
  if (!DIRECTIONS.some(([row, col]) => row === dr && col === dc)) return false;
  if (Math.floor(last / game.size) !== Math.floor(middle / game.size) + dr || last % game.size !== middle % game.size + dc) return false;

  game.trio = [...indices];
  game.phase = 'bid';
  return true;
}

function scanRun(board, size, index, player, [dr, dc]) {
  const row = Math.floor(index / size);
  const col = index % size;
  let before = 1;
  let after = 1;
  while (at(board, size, row - dr * before, col - dc * before) === player) before++;
  while (at(board, size, row + dr * after, col + dc * after) === player) after++;

  const stride = dr * size + dc;
  return {
    start: index - (before - 1) * stride,
    stride,
    length: before + after - 1,
  };
}

function newlyFormedLines({ board, size, trio }) {
  const lines = [[], []];
  const seen = new Set();
  for (const point of trio) {
    const player = board[point];
    for (const direction of DIRECTIONS) {
      const { start, stride, length } = scanRun(board, size, point, player, direction);
      const run = `${start},${stride}`;
      if (length < WIN_LENGTH || seen.has(run)) continue;
      seen.add(run);
      lines[player].push(Array.from({ length }, (_, offset) => start + offset * stride));
    }
  }
  return lines;
}

function resolveRound(game) {
  const [first, second] = game.bids;
  const owners = first.map((amount, slot) => {
    if (amount === second[slot]) return 1 - game.selector;
    return amount > second[slot] ? 0 : 1;
  });
  game.trio.forEach((point, slot) => { game.board[point] = owners[slot]; });

  const lines = newlyFormedLines(game);
  game.lastRound = { trio: game.trio, owners, lines };
  const [firstLines, secondLines] = lines.map((playerLines) => playerLines.length);
  if (firstLines > 0 || secondLines > 0) {
    const winner = firstLines === secondLines ? null : Number(secondLines > firstLines);
    game.result = {
      winner,
      line: winner === null ? [] : lines[winner][0],
      lines,
      reason: winner === null ? 'simultaneous' : 'line',
    };
  } else if (legalTrios(game).next().done) {
    game.result = { winner: null, line: [], lines, reason: 'blocked' };
  }

  const spent = game.bids.map((bid) => bid.reduce((sum, amount) => sum + amount, 0));
  game.bids = [null, null];
  game.trio = [];
  if (game.result) {
    game.phase = 'finished';
    return;
  }

  game.budgets = game.budgets.map((budget, player) => ROUND_POINTS + Math.floor((budget - spent[player]) / 2));
  game.round++;
  game.selector = 1 - game.selector;
  game.phase = 'select';
}

export function submitPointBid(game, player, amounts) {
  if (game.phase !== 'bid' || (player !== 0 && player !== 1) || game.bids[player] !== null) return false;
  if (!Array.isArray(amounts) || amounts.length !== 3) return false;
  const bid = [...amounts];
  if (bid.some((amount) => !Number.isInteger(amount) || amount < 1)) return false;
  if (bid.reduce((sum, amount) => sum + amount, 0) > game.budgets[player]) return false;

  game.bids[player] = bid;
  if (game.bids.every((entry) => entry !== null)) resolveRound(game);
  return true;
}

function copyLines(lines) {
  return lines.map((playerLines) => playerLines.map((line) => [...line]));
}

export function getPointView(game) {
  const { size, board, selector, phase, round, trio, budgets, bids, lastRound, result } = game;
  return {
    size,
    board: [...board],
    selector,
    phase,
    round,
    trio: [...trio],
    budgets: [...budgets],
    submitted: bids.map((bid) => bid !== null),
    lastRound: lastRound && { trio: [...lastRound.trio], owners: [...lastRound.owners], lines: copyLines(lastRound.lines) },
    result: result && { ...result, line: [...result.line], lines: copyLines(result.lines) },
  };
}

function makesPointLine({ board, size }, index, player) {
  return DIRECTIONS.some((direction) => scanRun(board, size, index, player, direction).length >= WIN_LENGTH);
}

function centerValue(index, size) {
  const center = (size - 1) / 2;
  return size - Math.abs(Math.floor(index / size) - center) - Math.abs(index % size - center);
}

export function choosePointTrio(game) {
  if (game.phase !== 'select') return null;
  const winningPoints = game.board.map((point, index) => point === null && makesPointLine(game, index, game.selector));
  const winPriority = 3 * game.size;
  let choice = null;
  let best = -Infinity;
  for (const trio of legalTrios(game)) {
    const canWin = trio.some((index) => winningPoints[index]);
    const center = trio.reduce((sum, index) => sum + centerValue(index, game.size), 0);
    const score = Number(canWin) * winPriority + center;
    if (score > best) {
      choice = trio;
      best = score;
    }
  }
  return choice;
}

export function choosePointBid(game, player) {
  if (game.phase !== 'bid' || (player !== 0 && player !== 1) || game.bids[player] !== null) return null;
  let target = game.trio.findIndex((point) => makesPointLine(game, point, player));
  if (target === -1) target = game.trio.findIndex((point) => makesPointLine(game, point, 1 - player));
  if (target === -1) {
    const bid = [3, 3, 3];
    bid[(game.round - 1) % bid.length] = 2;
    return bid;
  }
  const bid = [2, 2, 2];
  bid[target] = 4;
  return bid;
}
