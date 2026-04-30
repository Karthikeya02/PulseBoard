import { WebSocketServer } from "ws";

let wss = null;

export function createWebSocketServer(server) {
  wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "hello", message: "connected" }));
  });

  return wss;
}

export function broadcast(event) {
  if (!wss) {
    return;
  }

  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}
