import { chooseMemoryMove, createMemoryGame, getMemoryView, playMemoryMove } from './memory.mjs';
import {
  choosePointBid,
  choosePointTrio,
  createPointGame,
  getPointBidLimits,
  getPointView,
  listPointTrios,
  selectPointTrio,
  submitPointBid,
} from './points.mjs';
import {
  createRoom,
  isJoinCode,
  joinRoom,
  makeRoomToken,
  readRoom,
  readRoomSession,
  RoomConnection,
  RoomError,
  writeRoomSession,
} from './rooms.mjs';
import { selectResultDisplay } from './game-result.mjs';

const modes = {
  memory: {
    title: '盲五子棋',
    description: '記住每一手的歸屬，在翻面前連成五子。',
    rules: [
      '雙方輪流在空的交叉點落子，深色方先手。',
      '棋子落下後會蓋面。小菱形只標記最新一手，請記住雙方走過的位置。',
      '先在橫、直或斜線上連成剛好五顆同色棋子的一方獲勝。六顆以上的連線不計。棋盤下滿仍無勝負則和局。終局會翻開所有棋子。',
    ],
  },
  point: {
    title: '競價五子棋',
    description: '挑選三個連續空位，再用點數競逐落子。',
    rules: [
      '雙方輪流選點。選點方在同一條橫線、直線或斜線，標記三個連續的空交叉點。',
      '雙方各有 10 點可私下分配，每個位置至少出價 1 點。沒用完的點數折半並無條件捨去，留到下一回合。',
      '三點同時結算。每個位置由出價較高的一方落子。同價時，由本回合未選點的一方取得。',
      '橫、直或斜線剛好連成五顆同色棋子才計為一條。六顆以上的連線不計。若雙方同時連線，新連線較多者獲勝，同數則和局。若已無法選出三個連續空位，也以和局結束。',
    ],
  },
};

const columns = 'ABCDEFGHIJKLMNO';
const byId = (id) => document.getElementById(id);
const board = byId('board');
const boardPanel = board.closest('.board-panel');
const boardFrame = byId('board-frame');
const boardLegend = byId('board-legend');
const legendToken = boardLegend.firstElementChild;
const legendText = boardLegend.lastChild;
const boardHint = byId('board-hint');
const helpDialog = byId('help-dialog');
const resetDialog = byId('reset-dialog');
const gameResultDialog = byId('game-result-dialog');
const gameResultTitle = byId('game-result-title');
const gameResultImage = byId('game-result-image');
const gameResultMessage = byId('game-result-message');
const playAgainButton = byId('play-again');
const bidForm = byId('bid-form');
const bidInputs = byId('bid-inputs');
const confirmBid = byId('confirm-bid');
const confirmTrio = byId('confirm-trio');
const roomDialog = byId('room-dialog');
const roomCodeInput = byId('join-room-code');
const roomRematchButton = byId('room-rematch');
const modeButtons = [...document.querySelectorAll('[data-mode]')];

let mode = 'memory';
let game;
let view;
let boardCells = [];
let focusIndex;
let legalTrios = [];
let draft = [];
let bidKey = '';
let bidAmounts = [];
let bidSteppers = [];
let revealBidPending = false;
let computerTimer;
let pendingMode;
let offlineGame;
let room;
let renderedRoomMatch;
let savedRoom = readRoomSession();
let enteringRoom = false;
let joinAttempt;
let copyMessage = '';

function coordinate(index) {
  return `${columns[index % view.size]}${Math.floor(index / view.size) + 1}`;
}

function playerName(player) {
  if (!room) return player === 0 ? '你' : '電腦';
  if (room.snapshot) return player === room.snapshot.player ? '你' : '對手';
  return `玩家 ${player + 1}`;
}

function sideName(player) {
  return player === 0 ? '深色方' : '淺色方';
}

function readView() {
  if (room?.snapshot) return room.snapshot.view;
  return mode === 'memory' ? getMemoryView(game) : getPointView(game);
}

function displayGame() {
  view = readView();
  clearBidForm();
  buildBoard();
  byId('mode-title').textContent = modes[mode].title;
  byId('mode-description').textContent = modes[mode].description;
  byId('mode-selector').hidden = Boolean(room);
  byId('settings-panel').hidden = Boolean(room);
  byId('room-panel').hidden = !room;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  update();
}

function startGame(nextMode = mode) {
  clearTimeout(computerTimer);
  mode = nextMode;
  game = mode === 'memory' ? createMemoryGame() : createPointGame();
  draft = [];
  displayGame();
}

function requestGame(nextMode = mode) {
  const played = mode === 'memory' ? view.moveCount > 0 : view.round > 1 || view.phase === 'bid' || draft.length > 0;
  if (played && !view.result) {
    pendingMode = nextMode;
    resetDialog.showModal();
    return;
  }
  startGame(nextMode);
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
  return view.phase === 'select' && canPlayAs(view.selector);
}

function canPlayMemory() {
  return !view.result && canPlayAs(view.turn);
}

function canPlayAs(player) {
  if (room) return room.snapshot?.joined && player === room.snapshot.player;
  return player === 0;
}

function roomActionBlocked() {
  return Boolean(room && (room.busy || room.disconnected || room.ended));
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
  const enabledPoints = !isMemory && canSelectPoint() && !roomActionBlocked() ? possiblePoints() : new Set();
  const result = view.result;
  const winningLine = !isMemory && result?.winner != null ? result.lines[result.winner].flat() : result?.line;
  const winningCells = new Set(winningLine);
  const latestCells = isMemory ? [view.lastMove] : (view.lastRound?.trio ?? []);
  const canPlace = isMemory && canPlayMemory() && !roomActionBlocked();
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
  if (room?.busy) boardHint.textContent = '同步棋局中';
  else if (room?.disconnected && !room.ended) boardHint.textContent = '正在重新連線';
  else if (view.result) boardHint.textContent = isMemory ? '棋子已翻面' : '本局已結算';
  else if (room && !room.snapshot?.joined) boardHint.textContent = '等候開局';
  else if (room && isMemory && !canPlayMemory()) boardHint.textContent = '等待對手落子';
  else if (isMemory) boardHint.textContent = view.lastMove === null ? '點擊交叉點落子' : `最新一手 ${coordinate(view.lastMove)}`;
  else if (room && view.phase === 'select' && !canSelectPoint()) boardHint.textContent = '等待對手選點';
  else if (room && view.phase === 'bid' && biddingPlayer() === null) boardHint.textContent = '等待對手出價';
  else boardHint.textContent = view.phase === 'bid' ? '標號為本輪競價位置' : '選擇同一直線上的三點';
}

function biddingPlayer() {
  if (view.phase !== 'bid') return null;
  const player = room ? room.snapshot.player : 0;
  return view.submitted[player] ? null : player;
}

function renderPlayers(activePlayer) {
  const ownPlayer = room ? room.snapshot?.player : 0;
  const players = [];
  for (const player of [0, 1]) {
    const entry = document.createElement('li');
    entry.className = `player${activePlayer === player ? ' active' : ''}`;
    const token = document.createElement('span');
    token.className = `player-piece stone-${player}`;
    token.setAttribute('role', 'img');
    token.setAttribute('aria-label', sideName(player));
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = playerName(player);
    entry.append(token, name);

    let status;
    if (mode === 'point') {
      if (view.phase === 'bid' && view.submitted[player]) status = '已出價';
      else if (player === ownPlayer && !view.result) status = `${view.budgets[player]} 點`;
    } else if (player === 0) status = '先手';
    if (status) {
      const value = document.createElement('span');
      value.className = 'player-value';
      value.textContent = status;
      entry.append(value);
    }
    players.push(entry);
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

  if (room?.ended) {
    title = '房間已結束';
    detail = '離開房間後可開始新的對局。';
  } else if (room?.disconnected) {
    title = '正在重新連線';
    detail = '連線恢復後會同步棋局進度。';
  } else if (room && !room.snapshot?.joined) {
    title = room.snapshot ? '等待對手加入' : '正在恢復房間';
    detail = room.snapshot ? '將房間代碼傳給對手。' : '連線後會顯示棋局進度。';
  } else if (result) {
    title = result.winner === null ? '和局' : `${playerName(result.winner)}獲勝`;
    if (isMemory) detail = result.winner === null ? '棋盤已下滿。' : '已標出獲勝連線。';
    else if (result.reason === 'blocked') detail = '棋盤上已沒有三個連續的空位。';
    else if (result.winner === null) detail = '雙方形成的新連線數相同。';
    else detail = '已標出獲勝方在這輪的新連線。';
  } else if (isMemory) {
    activePlayer = view.turn;
    title = `輪到${playerName(activePlayer)}落子`;
    detail = canPlayMemory() ? '選擇一個空的交叉點。' : room ? '等待對手落子。' : '電腦正在思考。';
  } else if (view.phase === 'select') {
    activePlayer = view.selector;
    title = `輪到${playerName(activePlayer)}選點`;
    detail = canSelectPoint() ? '在同一直線上選三個連續的空位。' : room ? '等待對手選點。' : '電腦正在選點。';
  } else {
    activePlayer = biddingPlayer();
    const rival = room ? '對手' : '電腦';
    title = activePlayer === null ? `等待${rival}出價` : `輪到${playerName(activePlayer)}分配點數`;
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

function renderBidSummary(player) {
  const budget = view.budgets[player];
  const { left, canIncrease, canDecrease } = getPointBidLimits(budget, bidAmounts);
  const blocked = roomActionBlocked();
  for (const [slot, { value, decrease, increase }] of bidSteppers.entries()) {
    const amount = String(bidAmounts[slot]);
    if (value.value !== amount) value.value = amount;
    decrease.setAttribute('aria-disabled', String(blocked || !canDecrease[slot]));
    increase.setAttribute('aria-disabled', String(blocked || !canIncrease));
  }
  confirmBid.disabled = blocked;
  const summary = byId('bid-summary');
  const message = `可用 ${budget} 點，尚餘 ${left} 點。下輪保留 ${Math.floor(left / 2)} 點。`;
  if (summary.textContent !== message) summary.textContent = message;
}

function bidStepButton(slot, point, step) {
  const increase = step > 0;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-outline';
  button.textContent = increase ? '+' : '−';
  button.setAttribute('aria-label', `${increase ? '增加' : '減少'} ${point} 出價`);
  button.addEventListener('click', () => {
    if (bidForm.hidden || button.getAttribute('aria-disabled') === 'true') return;
    bidAmounts[slot] += step;
    renderBidSummary(biddingPlayer());
  });
  return button;
}

function createBidStepper(index, slot) {
  const point = coordinate(index);
  const group = document.createElement('div');
  group.className = 'bid-stepper';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `${point} 出價`);

  const heading = document.createElement('div');
  heading.className = 'bid-stepper-heading';
  const label = document.createElement('span');
  label.textContent = `${slot + 1} · ${point}`;
  const value = document.createElement('output');
  value.className = 'bid-value';
  value.setAttribute('aria-label', `${point} 出價點數`);
  heading.append(label, value);

  const controls = document.createElement('div');
  controls.className = 'bid-stepper-controls';
  const decrease = bidStepButton(slot, point, -1);
  const increase = bidStepButton(slot, point, 1);
  controls.append(decrease, increase);
  group.append(heading, controls);
  return { group, value, decrease, increase };
}

function clearBidForm() {
  if (!bidKey) return;
  bidKey = '';
  bidAmounts = [];
  bidSteppers = [];
  revealBidPending = false;
  bidInputs.replaceChildren();
  byId('bid-summary').textContent = '';
}

function dialogOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

function revealBidPanel() {
  if (!revealBidPending || bidForm.hidden || document.hidden || dialogOpen()) return;
  revealBidPending = false;
  const { top, bottom } = boardPanel.getBoundingClientRect();
  if (top < 0 || bottom > (window.visualViewport?.height ?? window.innerHeight)) {
    boardPanel.scrollIntoView({ block: 'start' });
  }
}

function focusBidControls() {
  if (!bidForm.hidden && !dialogOpen()) bidSteppers[0].increase.focus({ preventScroll: true });
}

function focusBoardAfterBid() {
  const active = document.activeElement;
  if (!dialogOpen() && (active === document.body || bidForm.contains(active))) {
    boardCells[focusIndex].focus({ preventScroll: true });
  }
}

function renderBidForm(player) {
  const key = `${view.round}:${player}`;
  if (key !== bidKey) {
    bidKey = key;
    bidAmounts = view.trio.map(() => 1);
    bidSteppers = view.trio.map(createBidStepper);
    bidInputs.replaceChildren(...bidSteppers.map(({ group }) => group));
    revealBidPending = true;
  }
  renderBidSummary(player);
  revealBidPanel();
}

function renderPointActions() {
  const isPoint = mode === 'point';
  const player = isPoint ? biddingPlayer() : null;
  const isBidding = player !== null;
  byId('point-actions').hidden = !isPoint;
  bidForm.hidden = !isBidding;
  boardPanel.classList.toggle('bidding', isBidding);
  if (!isBidding) clearBidForm();
  if (!isPoint) return;
  const isSelecting = canSelectPoint();
  byId('selection-actions').hidden = !isSelecting;
  if (isSelecting) {
    confirmTrio.disabled = draft.length !== 3 || roomActionBlocked();
    byId('clear-trio').disabled = draft.length === 0 || roomActionBlocked();
    byId('trio-coordinates').replaceChildren(...Array.from({ length: 3 }, (_, slot) => {
      const entry = document.createElement('span');
      entry.textContent = draft[slot] === undefined ? '—' : coordinate(draft[slot]);
      return entry;
    }));
  }
  if (isBidding) renderBidForm(player);
  renderRoundSummary();
}

function isComputerTurn() {
  if (room || view.result) return false;
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
  const previousResult = view.result;
  view = readView();
  legalTrios = mode === 'point' && canSelectPoint() ? listPointTrios(view) : [];
  renderBoard();
  renderStatus();
  renderPointActions();
  renderRoom();
  scheduleComputer();
  const roomMatch = room?.snapshot?.match;
  if (renderedRoomMatch !== roomMatch) {
    renderedRoomMatch = roomMatch;
    gameResultDialog.close();
    return;
  }
  const player = room ? room.snapshot?.player : 0;
  const resultDisplay = previousResult ? null : selectResultDisplay(player, mode, view);
  if (resultDisplay) {
    resetDialog.close();
    gameResultTitle.textContent = resultDisplay.title;
    gameResultImage.src = resultDisplay.image;
    gameResultMessage.textContent = resultDisplay.message;
    gameResultDialog.showModal();
  }
}

function rememberRoom(session) {
  savedRoom = session;
  writeRoomSession(session);
}

function renderRoom() {
  const snapshot = room?.snapshot;
  const player = snapshot?.player;
  const requested = snapshot?.rematch[player];
  const rematchDisabled = Boolean(requested) || roomActionBlocked();
  const rematchLabel = requested ? '等候對手同意' : '再玩一局';
  roomRematchButton.hidden = !room || !view.result || room.ended;
  roomRematchButton.disabled = playAgainButton.disabled = rematchDisabled;
  roomRematchButton.textContent = playAgainButton.textContent = rematchLabel;
  if (!room) return;
  byId('room-code').textContent = room.session.code;
  byId('room-side').textContent = player === undefined ? '' : `你是${sideName(player)}`;
  let message = room.error || copyMessage;
  if (room.disconnected && !room.ended) message = '連線中斷，正在重試。';
  else if (!message && snapshot?.rematch[1 - player]) message = '對手想再玩一局。';
  const notice = byId('room-notice');
  notice.hidden = !message;
  if (notice.textContent !== message) notice.textContent = message;
}

function updateRoomGame() {
  if (room.ended && savedRoom?.token === room.session.token) rememberRoom(null);
  const nextView = room.snapshot?.view;
  if (nextView && (nextView.phase !== view.phase || nextView.round !== view.round)) draft = [];
  update();
}

function enterRoom(session, snapshot) {
  clearTimeout(computerTimer);
  const bidValues = [...bidAmounts];
  offlineGame = { mode, game, draft, bidValues };
  mode = session.mode;
  game = mode === 'memory' ? createMemoryGame() : createPointGame();
  draft = [];
  copyMessage = '';
  room = new RoomConnection(session, snapshot, updateRoomGame);
  displayGame();
  room.refresh();
}

function leaveRoom() {
  room.close();
  if (!room.ended) rememberRoom({ ...room.session, active: false });
  room = null;
  ({ mode, game, draft } = offlineGame);
  displayGame();
  if (!bidForm.hidden) {
    if (offlineGame.bidValues.length) bidAmounts = offlineGame.bidValues;
    renderBidSummary(biddingPlayer());
    focusBidControls();
  } else {
    byId('open-room').focus();
  }
  offlineGame = null;
}

function setRoomEntryStatus(message, busy = false) {
  enteringRoom = busy;
  byId('create-room').disabled = busy;
  byId('join-room').disabled = busy;
  byId('close-room-entry').disabled = busy;
  roomCodeInput.readOnly = busy;
  const status = byId('room-entry-status');
  status.hidden = !message;
  status.textContent = message;
}

async function requestRoomEntry(code) {
  if (enteringRoom) return;
  setRoomEntryStatus(code ? '正在加入房間…' : '正在建立房間…', true);
  const rejoining = code && savedRoom?.code === code;
  let token;
  try {
    if (rejoining) token = savedRoom.token;
    else if (code) {
      if (joinAttempt?.code !== code) joinAttempt = { code, token: makeRoomToken() };
      token = joinAttempt.token;
    } else token = makeRoomToken();

    const snapshot = rejoining ? await readRoom(savedRoom) : code ? await joinRoom(code, token) : await createRoom(mode, token);
    const session = { code: snapshot.code, token, mode: snapshot.mode, active: true };
    rememberRoom(session);
    joinAttempt = null;
    roomDialog.close();
    enterRoom(session, snapshot);
    byId('copy-room').focus();
    setRoomEntryStatus('');
  } catch (error) {
    if (rejoining && (error.status === 404 || error.status === 401)) rememberRoom(null);
    setRoomEntryStatus(error instanceof RoomError ? error.message : '連線失敗，請稍後再試。');
  }
}

async function copyRoomCode() {
  const current = room;
  const code = current.session.code;
  let copied = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      // Use the selection-based clipboard path when the browser denies access.
    }
  }
  if (room !== current) return;
  if (!copied) {
    const selection = document.createElement('textarea');
    selection.className = 'room-copy-selection';
    selection.value = code;
    selection.readOnly = true;
    document.body.append(selection);
    selection.select();
    try {
      copied = Boolean(document.execCommand?.('copy'));
    } catch {
      copied = false;
    } finally {
      selection.remove();
      byId('copy-room').focus();
    }
  }
  copyMessage = copied ? '已複製房間代碼。' : '請長按房間代碼手動複製。';
  renderRoom();
}

function actInCurrentRoom(action) {
  copyMessage = '';
  return room.act({ ...action, match: room.snapshot.match });
}

function playAgain() {
  gameResultDialog.close();
  if (room) actInCurrentRoom({ type: 'rematch' });
  else startGame();
}

byId('open-room').addEventListener('click', () => {
  byId('room-mode').textContent = modes[mode].title;
  roomCodeInput.value = savedRoom?.code ?? '';
  setRoomEntryStatus('');
  roomDialog.showModal();
});
roomDialog.addEventListener('cancel', (event) => {
  if (enteringRoom) event.preventDefault();
});
byId('create-room').addEventListener('click', () => requestRoomEntry());
byId('join-room-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = roomCodeInput.value.trim();
  if (isJoinCode(code, savedRoom?.code)) requestRoomEntry(code);
  else {
    setRoomEntryStatus('請輸入 4 碼數字（0–9）。');
    roomCodeInput.focus();
  }
});
byId('copy-room').addEventListener('click', copyRoomCode);
byId('leave-room').addEventListener('click', leaveRoom);
roomRematchButton.addEventListener('click', playAgain);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  room?.refresh();
  revealBidPanel();
});
document.addEventListener('close', revealBidPanel, true);
window.addEventListener('online', () => room?.refresh());

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
    if (room) actInCurrentRoom({ type: 'move', index, revision: room.snapshot.revision });
    else if (canPlayMemory() && playMemoryMove(game, index)) update();
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
confirmTrio.addEventListener('click', async () => {
  if (room) {
    const selected = await actInCurrentRoom({ type: 'select', indices: draft, revision: room.snapshot.revision });
    const active = document.activeElement;
    if (selected && (active === document.body || active === confirmTrio || board.contains(active))) focusBidControls();
    return;
  }
  if (!canSelectPoint() || !selectPointTrio(game, draft)) return;
  draft = [];
  update();
  focusBidControls();
});

bidForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const player = biddingPlayer();
  if (bidForm.hidden || confirmBid.disabled || player === null) return;
  if (room) {
    const hadFocus = document.activeElement === confirmBid;
    const submitted = await actInCurrentRoom({ type: 'bid', bids: bidAmounts, round: view.round });
    if (submitted) focusBoardAfterBid();
    else if (hadFocus && document.activeElement === document.body && !bidForm.hidden && !confirmBid.disabled && !dialogOpen()) {
      confirmBid.focus({ preventScroll: true });
    }
    return;
  }
  if (!submitPointBid(game, player, bidAmounts)) return;
  update();
  focusBoardAfterBid();
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
  startGame(pendingMode);
});
gameResultDialog.addEventListener('close', () => {
  gameResultImage.removeAttribute('src');
  if (!helpDialog.open) boardCells[focusIndex].focus();
});
playAgainButton.addEventListener('click', playAgain);
for (const button of modeButtons) {
  button.addEventListener('click', () => {
    if (mode !== button.dataset.mode) requestGame(button.dataset.mode);
  });
}

startGame();
if (savedRoom?.active) enterRoom(savedRoom);
