import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRoom, ROOM_TTL_MS } from '../room-state.mjs';

const CODE = '27ABCD';
const HOST = '0'.repeat(32);
const GUEST = '1'.repeat(32);
const VISITOR = '2'.repeat(32);
const START = 1_000_000;

function roomSession(mode) {
  let room;
  const call = (operation, token, body, now = START) => {
    const response = handleRoom(room, { operation, code: CODE, token, body }, now);
    if (response.room) room = response.room;
    return response;
  };
  const host = call('create', HOST, { mode });
  return { call, host };
}

test('creating and joining a room assigns fixed seats and limits the room to two players', () => {
  const { call, host } = roomSession('memory');
  assert.equal(host.status, 201);
  assert.equal(host.body.code, CODE);
  assert.equal(host.body.mode, 'memory');
  assert.equal(host.body.player, 0);
  assert.equal(host.body.joined, false);
  assert.equal(call('create', VISITOR, { mode: 'point' }).status, 409);

  const guest = call('join', GUEST);
  assert.equal(guest.status, 200);
  assert.equal(guest.body.player, 1);
  assert.equal(guest.body.joined, true);
  assert.equal(call('get', HOST).body.joined, true);
  assert.deepEqual(call('join', GUEST).body, guest.body);
  assert.equal(call('join', VISITOR).status, 409);
  assert.equal(call('get', VISITOR).status, 401);
  assert.equal(call('get', 'invalid-token').status, 401);
  assert.equal(Object.hasOwn(guest.body, 'token'), false);
});

test('blind moves require both players, the right turn and the current revision', () => {
  const { call, host } = roomSession('memory');
  const move = (token, index, revision) => call('action', token, { type: 'move', index, revision, match: 1 });
  assert.equal(move(HOST, 112, host.body.revision).status, 409);

  const { revision } = call('join', GUEST).body;
  assert.equal(move(GUEST, 112, revision).status, 409);
  assert.equal(move(HOST, -1, revision).status, 400);
  const played = move(HOST, 112, revision);
  assert.equal(played.status, 200);
  assert.equal(played.body.view.board[112], 'covered');
  assert.equal(move(GUEST, 111, revision).status, 409);
  assert.equal(move(GUEST, 112, played.body.revision).status, 400);
  assert.equal(move(GUEST, 111, played.body.revision).status, 200);
  assert.equal(call('get', HOST).body.view.board[111], 'covered');
});

test('a blind match reveals colors when both phones receive the result', () => {
  const { call } = roomSession('memory');
  let snapshot = call('join', GUEST).body;
  for (const [i, index] of [0, 15, 1, 16, 2, 17, 3, 18, 4].entries()) {
    const result = call('action', i % 2 === 0 ? HOST : GUEST, {
      type: 'move', index, revision: snapshot.revision, match: snapshot.match,
    });
    assert.equal(result.status, 200);
    snapshot = result.body;
  }
  assert.deepEqual(snapshot.view.result, { winner: 0, line: [0, 1, 2, 3, 4] });
  assert.equal(snapshot.view.board[0], 0);
  assert.equal(snapshot.view.board[15], 1);
  assert.deepEqual(call('get', GUEST).body.view, snapshot.view);
});

test('bids from the same round settle once and keep each budget private', () => {
  const { call } = roomSession('point');
  const { revision } = call('join', GUEST).body;
  const select = (token, indices) => call('action', token, { type: 'select', indices, revision, match: 1 });
  assert.equal(select(GUEST, [0, 1, 2]).status, 409);
  assert.equal(select(HOST, [0, 1, 3]).status, 400);
  const selected = select(HOST, [0, 1, 2]);
  assert.equal(selected.status, 200);

  const bid = (token, bids, round = 1) => call('action', token, {
    type: 'bid', bids, round, match: 1, revision: selected.body.revision,
  });
  assert.equal(bid(GUEST, [1, 1, 1], 2).status, 409);
  assert.equal(bid(GUEST, [8, 2, 1]).status, 400);
  assert.equal(bid(GUEST, [1, 1, 1]).status, 200);
  const waiting = call('get', HOST).body.view;
  assert.deepEqual(waiting.submitted, [false, true]);
  assert.deepEqual(waiting.budgets, [10, null]);
  assert.equal(Object.hasOwn(waiting, 'bids'), false);
  assert.deepEqual(waiting.board.slice(0, 3), [null, null, null]);
  assert.equal(bid(GUEST, [1, 1, 1]).status, 409);

  const settled = bid(HOST, [8, 1, 1]);
  assert.equal(settled.status, 200);
  assert.deepEqual(settled.body.view.board.slice(0, 3), [0, 1, 1]);
  assert.equal(settled.body.view.round, 2);
  assert.deepEqual(settled.body.view.budgets, [10, null]);
  assert.deepEqual(call('get', GUEST).body.view.budgets, [null, 13]);
  assert.equal(bid(HOST, [8, 1, 1]).status, 409);
});

test('both players must agree to a rematch and old actions cannot affect the new match', () => {
  const { call } = roomSession('memory');
  let snapshot = call('join', GUEST).body;
  const rematch = (token, match = 1) => call('action', token, { type: 'rematch', match });
  assert.equal(rematch(HOST).status, 409);
  for (const [i, index] of [0, 15, 1, 16, 2, 17, 3, 18, 4].entries()) {
    snapshot = call('action', i % 2 === 0 ? HOST : GUEST, {
      type: 'move', index, revision: snapshot.revision, match: 1,
    }).body;
  }

  const first = rematch(HOST);
  assert.deepEqual(first.body.rematch, [true, false]);
  assert.ok(first.body.view.result);
  assert.equal(rematch(HOST).body.revision, first.body.revision);
  const second = rematch(GUEST);
  assert.equal(second.body.match, 2);
  assert.deepEqual(second.body.rematch, [false, false]);
  assert.equal(second.body.view.moveCount, 0);
  assert.equal(call('get', HOST).body.player, 0);
  assert.equal(call('action', HOST, { type: 'move', index: 0, revision: second.body.revision, match: 1 }).status, 409);
});

test('state changes extend the room lifetime but reads and repeated joins do not', () => {
  const { call, host } = roomSession('memory');
  assert.equal(host.room.expiresAt, START + ROOM_TTL_MS);
  const joined = call('join', GUEST, undefined, START + 10);
  assert.equal(joined.room.expiresAt, START + 10 + ROOM_TTL_MS);
  const read = call('get', HOST, undefined, START + ROOM_TTL_MS);
  assert.equal(read.status, 200);
  assert.equal(read.room, undefined);
  assert.equal(call('join', GUEST, undefined, START + ROOM_TTL_MS).room, undefined);
  assert.equal(call('get', HOST, undefined, START + 10 + ROOM_TTL_MS).status, 404);
});
