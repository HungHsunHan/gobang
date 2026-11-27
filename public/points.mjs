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

const ALL_SLOTS = 0b111;
const SLOT_COUNTS = [0, 1, 1, 2, 1, 2, 2, 3];
const SCORE_TARGETS = [1, 2, 3, 4, 5, 6, 7];
const WINDOW_VALUES = [0, 1, 5, 22, 200];
const WIN_SCORE = 10_000;
const LOSS_SCORE = -12_000;
const TRIO_SHORTLIST_SIZE = 10;
const CARRY_VALUE = 65;

function indexPotentialLines({ board, size }, triosAt) {
  const linesAt = Array.from({ length: board.length }, () => []);
  for (let index = 0; index < board.length; index++) {
    const row = Math.floor(index / size);
    const col = index % size;
    for (const [dr, dc] of DIRECTIONS) {
      if (at(board, size, row + (WIN_LENGTH - 1) * dr, col + (WIN_LENGTH - 1) * dc) === undefined) continue;

      const line = { owner: null, stones: 0, empty: [] };
      for (let offset = 0; offset < WIN_LENGTH; offset++) {
        const point = index + offset * (dr * size + dc);
        const stone = board[point];
        if (stone === null) {
          line.empty.push(point);
        } else {
          if (line.owner !== null && line.owner !== stone) break;
          line.owner = stone;
          line.stones++;
        }
      }
      // Once a vacancy is outside every legal trio, it can never be filled.
      if (line.empty.length + line.stones !== WIN_LENGTH || line.empty.some((point) => triosAt[point].length === 0)) continue;
      for (const point of line.empty) linesAt[point].push(line);
    }
  }
  return linesAt;
}

function indexPlayableTrios(position) {
  const triosAt = Array.from({ length: position.board.length }, () => []);
  const trios = [...legalTrios(position)];
  for (const trio of trios) {
    for (const point of trio) triosAt[point].push(trio);
  }
  return { trios, triosAt };
}

function scoreTrioOutcomes({ position, linesAt, trios, triosAt }, trio, player) {
  const { board, size, selector } = position;
  const affected = new Map();
  trio.forEach((point, slot) => {
    for (const line of linesAt[point]) {
      affected.set(line, (affected.get(line) ?? 0) | (1 << slot));
    }
  });

  const selected = new Set(trio);
  const survives = (next) => next.every((point) => !selected.has(point));
  const blocked = !trios.some(survives);
  const playableAfter = new Map(trio.map((point) => [point, true]));

  const changes = [...affected].map(([line, slots]) => ({
    owner: line.owner,
    stones: line.stones,
    slots,
    playable: line.empty.every((point) => {
      if (!playableAfter.has(point)) playableAfter.set(point, triosAt[point].some(survives));
      return playableAfter.get(point);
    }),
  }));

  // Bit n marks whether the computer obtains slot n. Score all eight settlements.
  const scores = Array(ALL_SLOTS + 1).fill(0);
  for (let owned = 0; owned <= ALL_SLOTS; owned++) {
    let potentiallyFinished = false;
    for (const { owner, stones, slots, playable } of changes) {
      const ownSlots = owned & slots;
      if (owner !== null) scores[owned] -= (owner === player ? 1 : -1) * WINDOW_VALUES[stones];
      if (!playable || (ownSlots !== 0 && ownSlots !== slots)) continue;

      const newOwner = ownSlots ? player : 1 - player;
      if (owner !== null && owner !== newOwner) continue;
      const newStones = stones + SLOT_COUNTS[slots];
      if (newStones === WIN_LENGTH) {
        potentiallyFinished = true;
      } else {
        // The player selecting next has the first chance to offer a winning point.
        const tempo = newStones === WIN_LENGTH - 1 && newOwner !== selector ? 1.35 : 1;
        scores[owned] += (newOwner === player ? 1 : -1) * WINDOW_VALUES[newStones] * tempo;
      }
    }
    if (potentiallyFinished) {
      trio.forEach((point, slot) => { board[point] = owned & (1 << slot) ? player : 1 - player; });
      const lines = newlyFormedLines({ board, size, trio });
      trio.forEach((point) => { board[point] = null; });
      const margin = lines[player].length - lines[1 - player].length;
      scores[owned] = margin > 0 ? WIN_SCORE : margin < 0 ? LOSS_SCORE : 0;
    } else if (blocked) {
      scores[owned] = 0;
    }
  }
  return scores;
}

function focusedBids(budgets) {
  const choices = new Map();
  for (const budget of budgets) {
    for (let target = 1; target <= ALL_SLOTS; target++) {
      const count = SLOT_COUNTS[target];
      const extra = budget - 3;
      for (let offset = 0; offset < count; offset++) {
        const bid = [1, 1, 1];
        let position = offset;
        for (let slot = 0; slot < bid.length; slot++) {
          if (!(target & (1 << slot))) continue;
          bid[slot] += Math.floor(extra / count) + Number(position < extra % count);
          position = (position + 1) % count;
        }
        choices.set(`${target}:${bid}`, { bid, target });
      }
    }
  }
  return [...choices.values()];
}

function legalBids(budget) {
  const bids = [];
  for (let first = 1; first <= budget - 2; first++) {
    for (let second = 1; second <= budget - first - 1; second++) {
      for (let third = 1; third <= budget - first - second; third++) {
        bids.push([first, second, third]);
      }
    }
  }
  return bids;
}

function budgetForecast(round) {
  // Rival spending is private. Only the rules and public round number set this upper bound.
  let upper = ROUND_POINTS;
  for (let turn = 1; turn < round; turn++) {
    const next = ROUND_POINTS + Math.floor((upper - 3) / 2);
    if (next === upper) break;
    upper = next;
  }
  return upper;
}

function bidOutcomes(bids, rivalBids, budget, winsTies) {
  const ownThreshold = winsTies ? 0 : 1;
  return bids.map((bid) => ({
    bid,
    carry: Math.floor((budget - bid[0] - bid[1] - bid[2]) / 2),
    ownership: rivalBids.map(({ bid: rival }) =>
      Number(bid[0] >= rival[0] + ownThreshold)
      | (Number(bid[1] >= rival[1] + ownThreshold) << 1)
      | (Number(bid[2] >= rival[2] + ownThreshold) << 2)),
  }));
}

function bestBid(outcomes, rivalBids, scores) {
  const stakes = SCORE_TARGETS.map((target) =>
    Math.max(0, scores[ALL_SLOTS] - scores[ALL_SLOTS ^ target]) / SLOT_COUNTS[target]);
  const highestStake = Math.max(1, ...stakes);
  // Allow for balanced and aggressive rivals, with more weight on contests that matter to them.
  const weights = rivalBids.map(({ target }) => 1 + 3 * stakes[target - 1] / highestStake);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let choice = null;
  let score = -Infinity;

  for (const { bid, carry, ownership } of outcomes) {
    let expected = 0;
    let worst = Infinity;
    for (let index = 0; index < ownership.length; index++) {
      const value = scores[ownership[index]];
      expected += value * weights[index];
      worst = Math.min(worst, value);
    }
    const value = 0.9 * expected / totalWeight + 0.1 * worst + CARRY_VALUE * carry;
    if (value > score) {
      score = value;
      choice = bid;
    }
  }
  return { bid: choice, score };
}

function createPointAnalysis(game, player) {
  const position = { board: [...game.board], size: game.size, selector: game.selector };
  const { trios, triosAt } = indexPlayableTrios(position);
  const upper = budgetForecast(game.round);
  return {
    position,
    trios,
    triosAt,
    linesAt: indexPotentialLines(position, triosAt),
    budget: game.budgets[player],
    rivalBids: focusedBids([6, 8, 9, ROUND_POINTS, Math.min(11, upper), Math.min(12, upper), upper]),
    winsTies: player !== game.selector,
  };
}

export function choosePointTrio(game) {
  if (game.phase !== 'select') return null;
  const analysis = createPointAnalysis(game, game.selector);
  const { trios, budget, rivalBids, winsTies } = analysis;
  // Preview every legal trio with representative bids, then check all bids for the finalists.
  const samples = focusedBids([budget - 4, budget - 2, budget]).map(({ bid }) => bid);
  const sampledOutcomes = bidOutcomes(samples, rivalBids, budget, winsTies);
  const candidates = [];
  for (const trio of trios) {
    const scores = scoreTrioOutcomes(analysis, trio, game.selector);
    const { score } = bestBid(sampledOutcomes, rivalBids, scores);
    candidates.push({ trio, scores, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  const allOutcomes = bidOutcomes(legalBids(budget), rivalBids, budget, winsTies);
  let choice = null;
  let best = -Infinity;
  for (const { trio, scores } of candidates.slice(0, TRIO_SHORTLIST_SIZE)) {
    const { score } = bestBid(allOutcomes, rivalBids, scores);
    if (score > best) {
      choice = trio;
      best = score;
    }
  }
  return choice;
}

export function choosePointBid(game, player) {
  if (game.phase !== 'bid' || (player !== 0 && player !== 1) || game.bids[player] !== null) return null;
  const analysis = createPointAnalysis(game, player);
  const { budget, rivalBids, winsTies } = analysis;
  const scores = scoreTrioOutcomes(analysis, game.trio, player);
  const outcomes = bidOutcomes(legalBids(budget), rivalBids, budget, winsTies);
  return bestBid(outcomes, rivalBids, scores).bid;
}
