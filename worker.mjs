import { DurableObject } from 'cloudflare:workers';
import { handleRoomRequest, isRoomPath } from './room-api.mjs';
import { handleRoom } from './room-state.mjs';

const ROOM_KEY = 'room';

export class GameRoom extends DurableObject {
  async dispatch(input) {
    const storage = this.ctx.storage;
    const room = await storage.get(ROOM_KEY);
    const result = handleRoom(room, input);
    if (result.room) {
      // The storage gate protects the read and batches both writes in one commit.
      await Promise.all([storage.put(ROOM_KEY, result.room), storage.setAlarm(result.room.expiresAt)]);
    }
    return { status: result.status, body: result.body };
  }

  async alarm() {
    const storage = this.ctx.storage;
    const room = await storage.get(ROOM_KEY);
    if (room && room.expiresAt <= Date.now()) await storage.deleteAll();
  }
}

export default {
  fetch(request, env) {
    if (!isRoomPath(new URL(request.url).pathname)) return env.ASSETS.fetch(request);
    return handleRoomRequest(request, (input) => env.ROOMS.getByName(input.code).dispatch(input));
  },
};
