const ROOM_PATH = '/api/rooms';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BODY_BYTES = 1024;
const CODE_ATTEMPTS = 5;

export function isRoomPath(pathname) {
  return pathname === ROOM_PATH || pathname.startsWith(`${ROOM_PATH}/`);
}

function routeRoom(pathname) {
  if (!isRoomPath(pathname)) return null;
  if (pathname === ROOM_PATH) return { operation: 'create', method: 'POST' };
  const match = /^\/([a-zA-Z0-9]{6})(?:\/(join|actions))?$/.exec(pathname.slice(ROOM_PATH.length));
  if (!match) return null;
  const code = match[1].toUpperCase();
  if (![...code].every((character) => CODE_ALPHABET.includes(character))) return null;
  if (match[2] === 'join') return { operation: 'join', method: 'POST', code };
  if (match[2] === 'actions') return { operation: 'action', method: 'POST', code };
  return { operation: 'get', method: 'GET', code };
}

function json(body, status, headers) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

function problem(status, error, headers) {
  return json({ error }, status, headers);
}

async function readBody(request) {
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return { error: problem(415, '請以 JSON 格式送出房間操作。') };
  }

  const tooLarge = () => ({ error: problem(413, '房間操作資料過大。') });
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return tooLarge();
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let length = 0;
  const reader = request.body?.getReader();
  try {
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (length + value.byteLength > MAX_BODY_BYTES) {
          void reader.cancel().catch(() => {});
          return tooLarge();
        }
        bytes.set(value, length);
        length += value.byteLength;
      }
    }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)));
    if (body !== null && typeof body === 'object' && !Array.isArray(body)) return { body };
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error;
  } finally {
    reader?.releaseLock();
  }
  return { error: problem(400, '無法讀取房間操作資料。') };
}

function generateCode() {
  const random = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(random, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

export async function handleRoomRequest(request, dispatch) {
  const url = new URL(request.url);
  const route = routeRoom(url.pathname);
  if (!route) return problem(404, '找不到這個房間操作。');
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== url.origin) return problem(403, '請從遊戲頁面操作房間。');
  if (request.method !== route.method) return problem(405, '此房間操作不支援這個請求方法。', { Allow: route.method });

  const token = /^Bearer ([a-f0-9]{32})$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return problem(401, '找不到玩家的房間憑證。');

  try {
    let body = null;
    if (route.method === 'POST') {
      const parsed = await readBody(request);
      if (parsed.error) return parsed.error;
      body = parsed.body;
    }

    const input = { operation: route.operation, code: route.code, token, body };
    if (route.operation !== 'create') {
      const result = await dispatch(input);
      return json(result.body, result.status);
    }
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const result = await dispatch({ ...input, code: generateCode() });
      if (result.status !== 409) return json(result.body, result.status);
    }
    return problem(503, '暫時無法建立房間，請再試一次。');
  } catch (error) {
    console.error('處理房間操作失敗。', error);
    return problem(500, '房間連線發生錯誤，請稍後再試。');
  }
}
