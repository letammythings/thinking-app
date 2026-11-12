type SocketLike = {
  send: (data: string) => void;
  on: (event: string, listener: () => void) => void;
};

const sockets = new Map<string, Set<SocketLike>>();

export function attachSocket(userId: string, socket: SocketLike): void {
  const set = sockets.get(userId) ?? new Set();
  set.add(socket);
  sockets.set(userId, set);
  socket.on("close", () => detachSocket(userId, socket));
}

export function detachSocket(userId: string, socket: SocketLike): void {
  const set = sockets.get(userId);
  if (!set) return;
  set.delete(socket);
  if (!set.size) sockets.delete(userId);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  const set = sockets.get(userId);
  if (!set) return;
  const body = JSON.stringify({ event, payload, at: new Date().toISOString() });
  for (const ws of set) {
    try {
      ws.send(body);
    } catch {
      /* ignore dead sockets */
    }
  }
}
