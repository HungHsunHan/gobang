import { createMemoryGame, getMemoryView, playMemoryMove } from './public/memory.mjs';
import { createPointGame, getPointView, selectPointTrio, submitPointBid } from './public/points.mjs';

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

function createGame(mode) {
  return mode === 'memory' ? createMemoryGame() : createPointGame();
}

function error(status, message) {
  return { status, body: { error: message } };
}

function snapshot(room, player, status = 200) {
  const { code, mode, players, revision, match, rematch, game } = room;
  const view = mode === 'memory' ? getMemoryView(game) : getPointView(game);
  if (mode === 'point') view.budgets[1 - player] = null;
  return {
    status,
    body: { code, mode, player, joined: players[1] !== null, revision, match, rematch: [...rematch], view },
  };
}

function save(room, player, now, status = 200) {
  const next = { ...room, revision: room.revision + 1, expiresAt: now + ROOM_TTL_MS };
  return { ...snapshot(next, player, status), room: next };
}

function rematchRoom(room, player, now) {
  if (!room.game.result) return error(409, '這局結束後才能再玩一局。');
  if (room.rematch[player]) return snapshot(room, player);
  if (room.rematch[1 - player]) {
    return save({ ...room, match: room.match + 1, rematch: [false, false], game: createGame(room.mode) }, player, now);
  }
  const rematch = [...room.rematch];
  rematch[player] = true;
  return save({ ...room, rematch }, player, now);
}

function act(room, player, body, now) {
  if (!body || typeof body !== 'object') return error(400, '請送出有效的對局操作。');
  if (room.players[1] === null) return error(409, '請等另一位玩家加入。');
  if (body.match !== room.match) return error(409, '棋局已更新，請重新操作。');
  if (body.type === 'rematch') return rematchRoom(room, player, now);
  if (room.game.result) return error(409, '這局已經結束。');

  const game = structuredClone(room.game);
  switch (body.type) {
    case 'move':
      if (room.mode !== 'memory') return error(400, '目前玩法無法直接落子。');
      if (body.revision !== room.revision) return error(409, '棋盤已更新，請重新選擇落點。');
      if (game.turn !== player) return error(409, '目前輪到對手落子。');
      if (!playMemoryMove(game, body.index)) return error(400, '請選擇有效的空位。');
      break;
    case 'select':
      if (room.mode !== 'point') return error(400, '目前玩法無法選擇競價位置。');
      if (body.revision !== room.revision) return error(409, '棋盤已更新，請重新選點。');
      if (game.phase !== 'select' || game.selector !== player) return error(409, '目前無法選點。');
      if (!selectPointTrio(game, body.indices)) return error(400, '請選擇同一直線上的三個連續空位。');
      break;
    case 'bid':
      if (room.mode !== 'point') return error(400, '目前玩法無法競價。');
      if (game.phase !== 'bid' || body.round !== game.round) return error(409, '競價回合已更新，請查看棋盤。');
      if (game.bids[player] !== null) return error(409, '你已送出這輪的出價。');
      if (!submitPointBid(game, player, body.bids)) return error(400, '每格至少出價 1 點，總額須在可用點數內。');
      break;
    default:
      return error(400, '找不到這個對局操作。');
  }
  return save({ ...room, game }, player, now);
}

export function handleRoom(room, { operation, code, token, body }, now = Date.now()) {
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) {
    return error(401, '玩家憑證無效，請重新加入房間。');
  }
  const active = room && room.expiresAt > now;
  if (operation === 'create') {
    if (active) return error(409, '此房間代碼已使用。');
    const { mode } = body ?? {};
    if (mode !== 'memory' && mode !== 'point') return error(400, '請選擇有效的玩法。');
    return save({ code, mode, players: [token, null], revision: 0, match: 1, rematch: [false, false], game: createGame(mode) }, 0, now, 201);
  }
  if (!active) return error(404, '找不到房間，或房間已過期。');

  const player = room.players.indexOf(token);
  if (operation === 'join') {
    if (player !== -1) return snapshot(room, player);
    if (room.players[1] !== null) return error(409, '這個房間已有兩位玩家。');
    return save({ ...room, players: [room.players[0], token] }, 1, now);
  }
  if (player === -1) return error(401, '玩家憑證無效，請重新加入房間。');
  if (operation === 'get') return snapshot(room, player);
  if (operation === 'action') return act(room, player, body, now);
  return error(400, '找不到這個房間操作。');
}
