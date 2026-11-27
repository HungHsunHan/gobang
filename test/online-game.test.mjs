import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createGameServer } from '../server.mjs';

async function roomClient(t) {
  const server = createGameServer({ host: '127.0.0.1' });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/rooms`;

  return () => {
    const token = randomBytes(16).toString('hex');
    return async (path, expectedStatus, payload) => {
      const response = await fetch(`${base}${path}`, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      assert.equal(response.status, expectedStatus, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return response.json();
    };
  };
}

test('two HTTP clients share a blind game and can rematch after a win', async (t) => {
  const connect = await roomClient(t);
  const host = connect();
  const guest = connect();
  const outsider = connect();
  let state = await host('', 201, { mode: 'memory' });
  assert.match(state.code, /^[A-Z2-9]{6}$/);
  assert.equal(state.player, 0);
  assert.equal(state.joined, false);
  assert.equal(Object.hasOwn(state, 'token'), false);
  const path = `/${state.code}`;
  const actions = `${path}/actions`;
  const move = (index) => ({ type: 'move', index, match: state.match, revision: state.revision });
  await host(actions, 409, move(0));

  state = await guest(`${path}/join`, 200, {});
  assert.equal(state.player, 1);
  assert.equal(state.joined, true);
  await outsider(`${path}/join`, 409, {});
  await outsider(path, 401);
  await guest(actions, 409, move(0));

  for (const [turn, index] of [0, 15, 1, 16, 2, 17, 3, 18, 4].entries()) {
    const player = turn % 2 === 0 ? host : guest;
    const watcher = player === host ? guest : host;
    state = await player(actions, 200, move(index));
    const other = await watcher(path, 200);
    assert.deepEqual(other.view, state.view);
    assert.equal(other.view.board[index], turn === 8 ? 0 : 'covered');
  }
  assert.deepEqual(state.view.result, { winner: 0, line: [0, 1, 2, 3, 4] });

  const rematch = { type: 'rematch', match: state.match };
  assert.deepEqual((await host(actions, 200, rematch)).rematch, [true, false]);
  const next = await guest(actions, 200, rematch);
  assert.equal(next.match, state.match + 1);
  assert.equal(next.view.moveCount, 0);
  assert.deepEqual((await host(path, 200)).view, next.view);
});

test('concurrent HTTP bids settle once while keeping each player’s budget private', async (t) => {
  const connect = await roomClient(t);
  const host = connect();
  const guest = connect();
  const { code } = await host('', 201, { mode: 'point' });
  const path = `/${code}`;
  const actions = `${path}/actions`;
  const { match, revision } = await guest(`${path}/join`, 200, {});
  const points = [222, 223, 224];
  const selected = await host(actions, 200, { type: 'select', indices: points, match, revision });
  assert.deepEqual(selected.view.trio, points);

  const bid = (bids) => ({ type: 'bid', bids, match, round: selected.view.round });
  await Promise.all([
    host(actions, 200, bid([7, 1, 1])),
    guest(actions, 200, bid([1, 2, 2])),
  ]);

  const [hostState, guestState] = await Promise.all([host(path, 200), guest(path, 200)]);
  assert.equal(hostState.view.round, 2);
  assert.equal(hostState.view.selector, 1);
  assert.deepEqual(hostState.view.board.slice(-3), [0, 1, 1]);
  assert.deepEqual(hostState.view.board, guestState.view.board);
  assert.deepEqual(hostState.view.budgets, [10, null]);
  assert.deepEqual(guestState.view.budgets, [null, 12]);
  assert.equal(Object.hasOwn(guestState.view, 'bids'), false);
  await host(actions, 409, bid([7, 1, 1]));
});
