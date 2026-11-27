const STORAGE_KEY = 'gobang-room';
const ROOM_CODE = /^[0-9]{4}$/;
const LEGACY_ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const TOKEN = /^[a-f0-9]{32}$/;

export function isJoinCode(code, savedCode) {
  return ROOM_CODE.test(code) || (code === savedCode && LEGACY_ROOM_CODE.test(code));
}

export function makeRoomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function readRoomSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (session && (ROOM_CODE.test(session.code) || LEGACY_ROOM_CODE.test(session.code)) && TOKEN.test(session.token) &&
        (session.mode === 'memory' || session.mode === 'point')) {
      return session;
    }
  } catch {
    // Storage can be disabled by the browser.
  }
  return null;
}

export function writeRoomSession(session) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The current room works in memory when storage is unavailable.
  }
}

export class RoomError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function requestRoom(path, token, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(`/api/rooms${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw new RoomError(result.error, response.status);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export function createRoom(mode, token) {
  return requestRoom('', token, { mode });
}

export function joinRoom(code, token) {
  return requestRoom(`/${code}/join`, token, {});
}

export function readRoom({ code, token }) {
  return requestRoom(`/${code}`, token);
}

function actInRoom({ code, token }, action) {
  return requestRoom(`/${code}/actions`, token, action);
}

export class RoomConnection {
  #timer;
  #polling = false;
  #closed = false;
  #actionCount = 0;
  #failedPolls = 0;

  constructor(session, snapshot, onChange) {
    this.session = session;
    this.snapshot = snapshot;
    this.onChange = onChange;
    this.busy = false;
    this.disconnected = false;
    this.ended = false;
    this.error = '';
  }

  #schedule(delay) {
    clearTimeout(this.#timer);
    if (!this.#closed && !this.ended && !document.hidden) {
      this.#timer = setTimeout(() => this.refresh(), delay);
    }
  }

  #apply(snapshot) {
    if (this.snapshot && snapshot.revision <= this.snapshot.revision) return false;
    this.snapshot = snapshot;
    return true;
  }

  #hasEnded(error) {
    if (error.status !== 404 && error.status !== 401) return false;
    this.ended = true;
    this.error = error.message;
    return true;
  }

  async refresh() {
    clearTimeout(this.#timer);
    if (this.#closed || this.ended || this.#polling || this.busy || document.hidden) return;
    this.#polling = true;
    const actionCount = this.#actionCount;
    try {
      const snapshot = await readRoom(this.session);
      if (this.#closed || actionCount !== this.#actionCount) return;
      const changed = this.#apply(snapshot) || this.disconnected;
      this.disconnected = false;
      this.#failedPolls = 0;
      if (changed) this.onChange();
    } catch (error) {
      if (this.#closed || actionCount !== this.#actionCount) return;
      if (this.#hasEnded(error)) {
        this.onChange();
        return;
      }
      this.#failedPolls++;
      if (!this.disconnected) {
        this.disconnected = true;
        this.onChange();
      }
    } finally {
      this.#polling = false;
      if (!this.busy) this.#schedule(Math.min(1000 * 2 ** this.#failedPolls, 8000));
    }
  }

  async act(action) {
    if (!this.snapshot || this.busy || this.disconnected || this.ended || this.#closed) return false;
    this.#actionCount++;
    this.busy = true;
    this.error = '';
    this.onChange();
    try {
      const snapshot = await actInRoom(this.session, action);
      if (this.#closed) return false;
      this.#apply(snapshot);
      return true;
    } catch (error) {
      if (this.#closed || this.#hasEnded(error)) return false;
      if (error instanceof RoomError && error.status < 500) this.error = error.message;
      else this.disconnected = true;
      return false;
    } finally {
      this.busy = false;
      if (!this.#closed) {
        this.onChange();
        this.#schedule(0);
      }
    }
  }

  close() {
    this.#closed = true;
    clearTimeout(this.#timer);
  }
}
