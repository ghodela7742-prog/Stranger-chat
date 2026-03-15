import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  const PORT = 3000;

  // --- WebSocket Logic ---

  interface User {
    ws: WebSocket;
    id: string;
    username: string;
    partnerId: string | null;
    isSearching: boolean;
  }

  const users = new Map<string, User>();
  let waitingQueue: string[] = [];

  function findPartner(userId: string) {
    const user = users.get(userId);
    if (!user) return;

    user.isSearching = true;
    user.partnerId = null;

    // Remove from queue if already there
    waitingQueue = waitingQueue.filter(id => id !== userId);

    // Find a stranger
    const strangerId = waitingQueue.shift();

    if (strangerId) {
      const stranger = users.get(strangerId);
      if (stranger) {
        // Match found!
        user.partnerId = strangerId;
        user.isSearching = false;
        stranger.partnerId = userId;
        stranger.isSearching = false;

        // Notify both
        user.ws.send(JSON.stringify({ type: 'match', partnerName: stranger.username }));
        stranger.ws.send(JSON.stringify({ type: 'match', partnerName: user.username }));
      } else {
        // Stranger disconnected while in queue, try again
        findPartner(userId);
      }
    } else {
      // No one waiting, add to queue
      waitingQueue.push(userId);
      user.ws.send(JSON.stringify({ type: 'searching' }));
    }
  }

  function disconnectPartner(userId: string) {
    const user = users.get(userId);
    if (user && user.partnerId) {
      const partner = users.get(user.partnerId);
      if (partner) {
        partner.partnerId = null;
        partner.ws.send(JSON.stringify({ type: 'partner_disconnected' }));
      }
      user.partnerId = null;
    }
  }

  wss.on("connection", (ws) => {
    const userId = Math.random().toString(36).substring(2, 15);
    
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'join':
            users.set(userId, {
              ws,
              id: userId,
              username: message.username || 'Stranger',
              partnerId: null,
              isSearching: false
            });
            findPartner(userId);
            break;

          case 'chat':
            const user = users.get(userId);
            if (user && user.partnerId) {
              const partner = users.get(user.partnerId);
              if (partner) {
                partner.ws.send(JSON.stringify({ 
                  type: 'chat', 
                  text: message.text,
                  sender: 'stranger'
                }));
              }
            }
            break;

          case 'typing':
            const typingUser = users.get(userId);
            if (typingUser && typingUser.partnerId) {
              const partner = users.get(typingUser.partnerId);
              if (partner) {
                partner.ws.send(JSON.stringify({ 
                  type: 'typing',
                  isTyping: message.isTyping
                }));
              }
            }
            break;

          case 'skip':
            disconnectPartner(userId);
            findPartner(userId);
            break;
        }
      } catch (e) {
        console.error("Error parsing message", e);
      }
    });

    ws.on("close", () => {
      disconnectPartner(userId);
      users.delete(userId);
      waitingQueue = waitingQueue.filter(id => id !== userId);
    });
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
