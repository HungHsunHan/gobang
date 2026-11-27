import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { handleRoomRequest } from '../room-api.mjs';
import { createGameServer } from '../server.mjs';

const origin = 'http://localhost:8788';
const token = 'ab'.repeat(16);

function request(path, { method = 'GET', body, headers } = {}) {
  return new Request(`${origin}${path}`, {
    method,
    body,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
  });
}

function rejectDispatch() {
  assert.fail('An invalid room request must be rejected before accessing room storage.');
}

test('a token in the query does not authorize a room request', async () => {
  const response = await handleRoomRequest(request(`/api/rooms/ABC234?token=${token}`, {
    headers: { Authorization: '' },
  }), rejectDispatch);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('room requests from another browser origin are rejected before storage', async () => {
  const response = await handleRoomRequest(request('/api/rooms', {
    method: 'POST', body: '{"mode":"memory"}', headers: { Origin: 'https://other.example' },
  }), rejectDispatch);
  assert.equal(response.status, 403);
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
});

test('a room endpoint only accepts its assigned HTTP method', async () => {
  const response = await handleRoomRequest(request('/api/rooms/ABC234/join'), rejectDispatch);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('room creation requires an object encoded as JSON', async () => {
  const opts = { method: 'POST' };
  const invalidType = await handleRoomRequest(request('/api/rooms', {
    ...opts, body: '{"mode":"memory"}', headers: { 'Content-Type': 'text/plain' },
  }), rejectDispatch);
  const invalidJson = await handleRoomRequest(request('/api/rooms', { ...opts, body: '{' }), rejectDispatch);
  const array = await handleRoomRequest(request('/api/rooms', { ...opts, body: '[]' }), rejectDispatch);
  assert.equal(invalidType.status, 415);
  assert.equal(invalidJson.status, 400);
  assert.equal(array.status, 400);
});

test('oversized room payloads are rejected even without a length header', async () => {
  const response = await handleRoomRequest(request('/api/rooms', {
    method: 'POST', body: JSON.stringify({ mode: 'memory', extra: 'a'.repeat(2048) }),
  }), rejectDispatch);
  assert.equal(response.status, 413);
});

test('the local server can send a rejection before discarding an oversized chunked request', async (t) => {
  const server = createGameServer({ host: '127.0.0.1' });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rooms`, {
    method: 'POST',
    duplex: 'half',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: new ReadableStream({
      start(controller) {
        for (let i = 0; i < 3; i++) controller.enqueue(new Uint8Array(512));
        controller.close();
      },
    }),
  });
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /過大/);
});

test('legacy room code paths are canonicalized before reaching storage', async () => {
  const response = await handleRoomRequest(request('/api/rooms/abc234'), (input) => {
    assert.deepEqual(input, { operation: 'get', code: 'ABC234', token, body: null });
    return { status: 200, body: { code: input.code } };
  });
  assert.deepEqual(await response.json(), { code: 'ABC234' });
});

test('four-digit room code paths preserve leading zeros', async () => {
  const response = await handleRoomRequest(request('/api/rooms/0077/join', { method: 'POST', body: '{}' }), (input) => {
    assert.deepEqual(input, { operation: 'join', code: '0077', token, body: {} });
    return { status: 200, body: { code: input.code } };
  });
  assert.deepEqual(await response.json(), { code: '0077' });
});

test('room creation can generate 0000 and retries collisions with another four-digit code', async (t) => {
  const samples = [60_000, 0, 59_999];
  t.mock.method(crypto, 'getRandomValues', (array) => {
    array[0] = samples.shift();
    return array;
  });
  const codes = [];
  const response = await handleRoomRequest(request('/api/rooms', {
    method: 'POST', body: '{"mode":"memory"}',
  }), (input) => {
    assert.equal(input.operation, 'create');
    codes.push(input.code);
    if (codes.length === 1) return { status: 409, body: {} };
    return { status: 201, body: { code: input.code }, room: { private: token } };
  });
  assert.deepEqual(codes, ['0000', '9999']);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { code: '9999' });
});
