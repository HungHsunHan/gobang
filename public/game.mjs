import { chooseMemoryMove, createMemoryGame, getMemoryView, playMemoryMove } from './memory.mjs';
import {
  choosePointBid,
  choosePointTrio,
  createPointGame,
  getPointView,
  listPointTrios,
  selectPointTrio,
  submitPointBid,
} from './points.mjs';

const modes = {
  memory: {
    title: '盲五子棋',
    description: '記住每一手的歸屬，在翻面前連成五子。',
    rules: [
      '雙方輪流在空的交叉點落子，深色方先手。',
      '棋子落下後會蓋面。小菱形只標記最新一手，請記住雙方走過的位置。',
      '先在橫、直或斜線上連成至少五子的一方獲勝。棋盤下滿仍無連線則和局。終局會翻開所有棋子。',
    ],
  },
  point: {
    title: '競價五子棋',
    description: '挑選三個連續空位，再用點數競逐落子。',
    rules: [
      '雙方輪流選點。選點方在同一條橫線、直線或斜線，標記三個連續的空交叉點。',
      '雙方各有 10 點可私下分配，每個位置至少出價 1 點。沒用完的點數折半並無條件捨去，留到下一回合。',
      '三點同時結算。每個位置由出價較高的一方落子。同價時，由本回合未選點的一方取得。',
      '橫、直或斜線連成五子以上即計為一條。若雙方同時連線，新連線較多者獲勝，同數則和局。若已無法選出三個連續空位，也以和局結束。',
    ],
  },
};

const columns = 'ABCDEFGHIJKLMNO';
const byId = (id) => document.getElementById(id);
const board = byId('board');
const boardFrame = byId('board-frame');
const boardLegend = byId('board-legend');
const legendToken = boardLegend.firstElementChild;
const legendText = boardLegend.lastChild;
const boardHint = byId('board-hint');
const helpDialog = byId('help-dialog');
const handoffDialog = byId('handoff-dialog');
const resetDialog = byId('reset-dialog');
const bidForm = byId('bid-form');
const bidInputs = byId('bid-inputs');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const opponentButtons = [...document.querySelectorAll('[data-opponent]')];

let mode = 'memory';
let opponent = 'computer';
let game;
let view;
let boardCells = [];
let focusIndex;
let legalTrios = [];
let draft = [];
let readyBidder = null;
let bidKey = '';
let computerTimer;
let pendingSettings;

function coordinate(index) {
  return `${columns[index % view.size]}${Math.floor(index / view.size) + 1}`;
}

function playerName(player) {
  if (opponent === 'computer') return player === 0 ? '你' : '電腦';
  return `玩家 ${player + 1}`;
}

function sideName(player) {
  return player === 0 ? '深色方' : '淺色方';
}

function readView() {
  return mode === 'memory' ? getMemoryView(game) : getPointView(game);
}

function startGame(settings = { mode, opponent }) {
  clearTimeout(computerTimer);
  ({ mode, opponent } = settings);
  game = mode === 'memory' ? createMemoryGame() : createPointGame();
  view = readView();
  draft = [];
  readyBidder = null;
  bidKey = '';
  buildBoard();
  byId('mode-title').textContent = modes[mode].title;
  byId('mode-description').textContent = modes[mode].description;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  for (const button of opponentButtons) button.setAttribute('aria-pressed', String(button.dataset.opponent === opponent));
  update();
}

function requestGame(settings = { mode, opponent }) {
  const played = mode === 'memory' ? view.moveCount > 0 : view.round > 1 || view.phase === 'bid' || draft.length > 0;
  if (played && !view.result) {
    pendingSettings = settings;
    resetDialog.showModal();
    return;
  }
  startGame(settings);
}

function buildBoard() {
  const { size } = view;
  const center = Math.floor(size / 2);
  focusIndex = center * size + center;
  boardCells = [];
  boardFrame.style.setProperty('--size', size);
  byId('board-size').textContent = `${size} × ${size}`;
  board.setAttribute('aria-colcount', size);
  board.setAttribute('aria-rowcount', size);
  const rows = document.createDocumentFragment();
  const xAxis = document.createDocumentFragment();
  const yAxis = document.createDocumentFragment();
  const starAxes = size === 15 ? [3, center, size - 4] : [2, center, size - 3];

  for (let row = 0; row < size; row++) {
    const columnLabel = document.createElement('span');
    columnLabel.textContent = columns[row];
    xAxis.append(columnLabel);
    const rowLabel = document.createElement('span');
    rowLabel.textContent = row + 1;
    yAxis.append(rowLabel);

    const rowElement = document.createElement('div');
    rowElement.className = 'board-row';
    rowElement.setAttribute('role', 'row');
    for (let column = 0; column < size; column++) {
      const index = row * size + column;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'intersection';
      if (starAxes.includes(row) && starAxes.includes(column)) cell.classList.add('star');
      cell.setAttribute('role', 'gridcell');
      cell.dataset.index = index;
      cell.tabIndex = index === focusIndex ? 0 : -1;
      const stone = document.createElement('span');
      stone.className = 'stone';
      stone.setAttribute('aria-hidden', 'true');
      const marker = document.createElement('span');
      marker.className = 'marker';
      marker.setAttribute('aria-hidden', 'true');
      cell.append(stone, marker);
      rowElement.append(cell);
      boardCells.push(cell);
    }
    rows.append(rowElement);
  }

  byId('axis-x').replaceChildren(xAxis);
  byId('axis-y').replaceChildren(yAxis);
  board.replaceChildren(rows);
}

function updateFocus(index) {
  boardCells[focusIndex].tabIndex = -1;
  focusIndex = index;
  boardCells[focusIndex].tabIndex = 0;
}

function moveGridFocus(event) {
  const { size } = view;
  const row = Math.floor(focusIndex / size);
  const column = focusIndex % size;
  const steps = {
    ArrowLeft: Math.max(0, column - 1) - column,
    ArrowRight: Math.min(size - 1, column + 1) - column,
    ArrowUp: row > 0 ? -size : 0,
    ArrowDown: row < size - 1 ? size : 0,
    Home: event.ctrlKey ? -focusIndex : -column,
    End: event.ctrlKey ? size * size - 1 - focusIndex : size - 1 - column,
  };
  if (!Object.hasOwn(steps, event.key)) return;
  event.preventDefault();
  updateFocus(focusIndex + steps[event.key]);
  boardCells[focusIndex].focus();
}

function canSelectPoint() {
  return view.phase === 'select' && (opponent === 'local' || view.selector === 0);
}

function canPlayMemory() {
  return !view.result && (opponent === 'local' || view.turn === 0);
}

function possiblePoints() {
  const points = new Set(draft);
  for (const trio of legalTrios) {
    if (draft.every((index) => trio.includes(index))) {
      for (const index of trio) points.add(index);
    }
  }
  return points;
}

function renderBoard() {
  const isMemory = mode === 'memory';
  const selection = isMemory ? [] : view.phase === 'bid' ? view.trio : draft;
  const enabledPoints = !isMemory && canSelectPoint() ? possiblePoints() : new Set();
  const result = view.result;
  const winningLine = !isMemory && result?.winner != null ? result.lines[result.winner].flat() : result?.line;
  const winningCells = new Set(winningLine);
  const latestCells = isMemory ? [view.lastMove] : (view.lastRound?.trio ?? []);
  const canPlace = isMemory && canPlayMemory();
  for (const [index, cell] of boardCells.entries()) {
    const stone = view.board[index];
    const selected = selection.indexOf(index);
    const isLast = latestCells.includes(index);
    cell.classList.toggle('last', isLast);
    cell.classList.toggle('selected', selected >= 0);
    cell.classList.toggle('winning', winningCells.has(index));
    if (stone === null) delete cell.dataset.stone;
    else cell.dataset.stone = stone;
    cell.lastElementChild.textContent = selected >= 0 ? selected + 1 : '';
    cell.setAttribute('aria-selected', String(selected >= 0));
    const space = stone === null ? '空位' : stone === 'covered' ? '蓋面棋子' : sideName(stone);
    const details = [coordinate(index), space];
    if (isLast) details.push('最新落子');
    if (selected >= 0) details.push(`第 ${selected + 1} 個競價位置`);
    if (winningCells.has(index)) details.push('獲勝連線');
    cell.setAttribute('aria-label', details.join('，'));
    cell.setAttribute('aria-disabled', String(!(canPlace && stone === null) && !enabledPoints.has(index)));
  }

  legendText.textContent = isMemory && !view.result ? '蓋牌棋子' : '深色方／淺色方';
  legendToken.classList.toggle('legend-sides', !isMemory || Boolean(view.result));
  if (view.result) boardHint.textContent = isMemory ? '棋子已翻面' : '本局已結算';
  else if (isMemory) boardHint.textContent = view.lastMove === null ? '點擊交叉點落子' : `最新一手 ${coordinate(view.lastMove)}`;
  else boardHint.textContent = view.phase === 'bid' ? '標號為本輪競價位置' : '選擇同一直線上的三點';
}

function biddingPlayer() {
  if (view.phase !== 'bid') return null;
  if (opponent === 'computer') return view.submitted[0] ? null : 0;
  return view.submitted[view.selector] ? 1 - view.selector : view.selector;
}

function renderPlayers(activePlayer) {
  const players = [];
  for (const player of [0, 1]) {
    const row = document.createElement('div');
    row.className = `player${activePlayer === player ? ' active' : ''}`;
    const token = document.createElement('span');
    token.className = `player-piece stone-${player}`;
    token.setAttribute('aria-hidden', 'true');
    const identity = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = playerName(player);
    const side = document.createElement('span');
    side.className = 'player-side';
    side.textContent = sideName(player);
    identity.append(name, side);
    const value = document.createElement('span');
    value.className = 'player-value';
    if (mode === 'point') {
      if (view.phase === 'bid' && view.submitted[player]) value.textContent = '已出價';
      else if (opponent === 'computer' && player === 0 && !view.result) value.textContent = `${view.budgets[player]} 點`;
    } else if (player === 0) value.textContent = '先手';
    row.append(token, identity, value);
    players.push(row);
  }
  byId('players').replaceChildren(...players);
}

function renderStatus() {
  let title;
  let detail;
  let activePlayer = null;
  const { result } = view;
  const isMemory = mode === 'memory';

  byId('counter').textContent = isMemory
    ? `第 ${view.moveCount + (result ? 0 : 1)} 手`
    : `第 ${view.round} 輪`;

  if (result) {
    title = result.winner === null ? '和局' : `${playerName(result.winner)}獲勝`;
    if (isMemory) detail = result.winner === null ? '棋盤已下滿。' : '已標出獲勝連線。';
    else if (result.reason === 'blocked') detail = '棋盤上已沒有三個連續的空位。';
    else if (result.winner === null) detail = '雙方形成的新連線數相同。';
    else detail = '已標出獲勝方在這輪的新連線。';
  } else if (isMemory) {
    activePlayer = view.turn;
    title = `輪到${playerName(activePlayer)}落子`;
    detail = canPlayMemory() ? '選擇一個空的交叉點。' : '電腦正在思考。';
  } else if (view.phase === 'select') {
    activePlayer = view.selector;
    title = `輪到${playerName(activePlayer)}選點`;
    detail = canSelectPoint() ? '在同一直線上選三個連續的空位。' : '電腦正在選點。';
  } else {
    activePlayer = biddingPlayer();
    title = activePlayer === null ? '等待電腦出價' : `輪到${playerName(activePlayer)}分配點數`;
    detail = activePlayer === null ? '雙方出價後才會結算。' : '每個位置至少出價 1 點。';
  }
  renderPlayers(activePlayer);
  byId('turn-title').textContent = title;
  byId('turn-detail').textContent = detail;
}

function renderRoundSummary() {
  const summary = byId('round-summary');
  summary.hidden = !view.lastRound;
  if (!view.lastRound) {
    summary.replaceChildren();
    return;
  }
  const { trio, owners } = view.lastRound;
  const heading = document.createElement('strong');
  heading.textContent = '最近一次結算';
  const list = document.createElement('ul');
  for (const [slot, index] of trio.entries()) {
    const item = document.createElement('li');
    item.textContent = `${coordinate(index)}　${playerName(owners[slot])}取得`;
    list.append(item);
  }
  summary.replaceChildren(heading, list);
}

function bidAmounts() {
  return [...bidInputs.querySelectorAll('input')].map((input) => input.valueAsNumber);
}

function renderBidSummary() {
  const player = biddingPlayer();
  const amounts = bidAmounts();
  const valid = amounts.length === 3 && amounts.every((amount) => Number.isInteger(amount) && amount >= 1);
  const budget = view.budgets[player];
  const left = valid ? budget - amounts.reduce((sum, amount) => sum + amount, 0) : null;
  byId('confirm-bid').disabled = left === null || left < 0;
  if (left === null) byId('bid-summary').textContent = '每格至少出價 1 點，僅能填整數。';
  else if (left < 0) byId('bid-summary').textContent = `超出點數 ${-left} 點。`;
  else byId('bid-summary').textContent = `可用 ${budget} 點，尚餘 ${left} 點。下輪保留 ${Math.floor(left / 2)} 點。`;
}

function renderBidForm(player) {
  const key = `${view.round}:${player}`;
  if (key !== bidKey) {
    bidKey = key;
    bidInputs.replaceChildren(...view.trio.map((index, slot) => {
      const label = document.createElement('label');
      label.textContent = `${slot + 1} · ${coordinate(index)}`;
      const input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'numeric';
      input.min = '1';
      input.max = String(view.budgets[player] - 2);
      input.required = true;
      input.value = '1';
      label.append(input);
      return label;
    }));
  }
  renderBidSummary();
}

function renderPointActions() {
  const isPoint = mode === 'point';
  byId('point-actions').hidden = !isPoint;
  if (!isPoint) return;
  const isSelecting = canSelectPoint();
  const player = biddingPlayer();
  const isBidding = player !== null && (opponent === 'computer' || readyBidder === player);
  byId('selection-actions').hidden = !isSelecting;
  bidForm.hidden = !isBidding;
  if (isSelecting) {
    byId('confirm-trio').disabled = draft.length !== 3;
    byId('clear-trio').disabled = draft.length === 0;
    byId('trio-coordinates').replaceChildren(...Array.from({ length: 3 }, (_, slot) => {
      const entry = document.createElement('span');
      entry.textContent = draft[slot] === undefined ? '—' : coordinate(draft[slot]);
      return entry;
    }));
  }
  if (isBidding) renderBidForm(player);
  else {
    bidInputs.replaceChildren();
    byId('bid-summary').textContent = '';
    bidKey = '';
  }
  renderRoundSummary();
  if (player !== null && opponent === 'local' && readyBidder !== player && !handoffDialog.open) {
    byId('handoff-detail').textContent = `${playerName(player)}準備好後再繼續。請讓另一位玩家暫時移開視線。`;
    handoffDialog.showModal();
  }
}

function isComputerTurn() {
  if (opponent === 'local' || view.result) return false;
  if (mode === 'memory') return view.turn === 1;
  return view.phase === 'select' ? view.selector === 1 : view.phase === 'bid' && !view.submitted[1];
}

function scheduleComputer() {
  clearTimeout(computerTimer);
  if (!isComputerTurn()) return;
  computerTimer = setTimeout(() => {
    if (mode === 'memory') playMemoryMove(game, chooseMemoryMove(game));
    else if (view.phase === 'select') selectPointTrio(game, choosePointTrio(game));
    else submitPointBid(game, 1, choosePointBid(game, 1));
    update();
  }, 420);
}

function update() {
  view = readView();
  legalTrios = mode === 'point' && view.phase === 'select' ? listPointTrios(game) : [];
  renderBoard();
  renderStatus();
  renderPointActions();
  scheduleComputer();
}

board.addEventListener('focusin', (event) => {
  const cell = event.target.closest('.intersection');
  if (cell) updateFocus(Number(cell.dataset.index));
});
board.addEventListener('keydown', moveGridFocus);
board.addEventListener('click', (event) => {
  const cell = event.target.closest('.intersection');
  if (!cell || cell.getAttribute('aria-disabled') === 'true') return;
  const index = Number(cell.dataset.index);
  updateFocus(index);
  if (mode === 'memory') {
    if (canPlayMemory() && playMemoryMove(game, index)) update();
    return;
  }
  if (!canSelectPoint()) return;
  draft = draft.includes(index) ? draft.filter((item) => item !== index) : [...draft, index];
  renderBoard();
  renderPointActions();
});

byId('clear-trio').addEventListener('click', () => {
  draft = [];
  renderBoard();
  renderPointActions();
  boardCells[focusIndex].focus();
});
byId('confirm-trio').addEventListener('click', () => {
  if (!canSelectPoint() || !selectPointTrio(game, draft)) return;
  draft = [];
  readyBidder = null;
  update();
  if (!bidForm.hidden) bidInputs.querySelector('input').focus();
});
bidForm.addEventListener('input', renderBidSummary);
bidForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const player = biddingPlayer();
  if (bidForm.hidden || player === null || !submitPointBid(game, player, bidAmounts())) return;
  readyBidder = null;
  update();
  if (!handoffDialog.open) boardCells[focusIndex].focus();
});

handoffDialog.addEventListener('cancel', (event) => event.preventDefault());
byId('accept-handoff').addEventListener('click', () => {
  readyBidder = biddingPlayer();
  handoffDialog.close();
  renderPointActions();
  bidInputs.querySelector('input').focus();
});
byId('help').addEventListener('click', () => {
  const list = document.createElement('ol');
  for (const rule of modes[mode].rules) {
    const item = document.createElement('li');
    item.textContent = rule;
    list.append(item);
  }
  byId('rules').replaceChildren(list);
  helpDialog.showModal();
});
byId('restart').addEventListener('click', () => requestGame());
byId('confirm-reset').addEventListener('click', () => {
  resetDialog.close();
  startGame(pendingSettings);
});
for (const button of modeButtons) {
  button.addEventListener('click', () => {
    if (mode !== button.dataset.mode) requestGame({ mode: button.dataset.mode, opponent });
  });
}
for (const button of opponentButtons) {
  button.addEventListener('click', () => {
    if (opponent !== button.dataset.opponent) requestGame({ mode, opponent: button.dataset.opponent });
  });
}

startGame();
