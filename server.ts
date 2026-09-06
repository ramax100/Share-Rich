import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

interface ClientPeer {
  ws: WebSocket;
  id: string;
  name: string;
  avatar: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
  roomCode: string;
  ip: string;
  lastSeen: number;
}

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// In-memory peer registry
const peers = new Map<string, ClientPeer>();

interface ApiRadarPeer {
  id: string;
  name: string;
  avatar: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
  roomCode: string;
  ip: string;
  deviceId: string;
  lastSeen: number;
}

const apiRadarPeers = new Map<string, ApiRadarPeer>();
const API_RADAR_TTL_MS = 20000;


function normalizeAnimeDeviceName(name: unknown) {
  const raw = String(name || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('ichika')) return 'Ichika';
  if (lower.includes('nino')) return 'Nino';
  if (lower.includes('miku')) return 'Miku';
  if (lower.includes('yotsuba')) return 'Yotsuba';
  if (lower.includes('itsuki')) return 'Itsuki';
  return raw || 'Ichika';
}

function normalizeRoomCode(roomCode: unknown) {
  return String(roomCode || 'HOTSPOT-1').trim().toUpperCase();
}

function cleanupApiRadarPeers() {
  const now = Date.now();
  for (const [id, peer] of apiRadarPeers.entries()) {
    if (now - peer.lastSeen > API_RADAR_TTL_MS) {
      apiRadarPeers.delete(id);
    }
  }
}

function getApiRadarPeers(exclusionIp: string, excludeRoom: string, excludeId?: string) {
  cleanupApiRadarPeers();
  // Discovery returns peers on the same network OR the same (QR-paired) room. The Map
  // holds multiple peers, so a re-registration never overwrites another device.
  return Array.from(apiRadarPeers.values())
    .filter(
      (peer) =>
        peer.id !== excludeId &&
        (peer.ip === exclusionIp || (excludeRoom && peer.roomCode === excludeRoom))
    )
    .sort((a, b) => b.lastSeen - a.lastSeen);
}


// API endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'ShareRich-Web',
    connectedPeers: peers.size,
    timestamp: Date.now()
  });
});


app.all('/api/peers', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  // This device's public IP; the radar is scoped to the network it is on.
  const myIp = String(req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1');

  if (req.method === 'POST') {
    const body = req.body || {};
    const id = String(body.id || '').trim();
    const roomCode = normalizeRoomCode(body.roomCode);

    if (!id) {
      res.status(400).json({ error: 'Missing peer id', peers: [], clientIp: myIp });
      return;
    }

    const deviceId = String(body.deviceId || '').trim();
    // Same device re-registering → remove its previous stale entry first.
    if (deviceId) {
      for (const [peerId, peer] of apiRadarPeers.entries()) {
        if (peer.deviceId === deviceId) {
          apiRadarPeers.delete(peerId);
        }
      }
    }

    apiRadarPeers.set(id, {
      id,
      name: normalizeAnimeDeviceName(body.name || 'Ichika'),
      avatar: String(body.avatar || '📱'),
      deviceType: body.deviceType || 'unknown',
      roomCode,
      ip: myIp,
      deviceId,
      lastSeen: Date.now(),
    });

    res.json({ ok: true, clientIp: myIp, peers: getApiRadarPeers(myIp, roomCode, id) });
    return;
  }

  if (req.method === 'GET') {
    const roomCode = normalizeRoomCode(req.query.roomCode || req.query.room);
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : undefined;
    res.json({ ok: true, clientIp: myIp, peers: getApiRadarPeers(myIp, roomCode, excludeId) });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

app.get('/api/network-info', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  res.json({
    clientIp: String(clientIp),
    mode: 'Wi-Fi Direct / Local Hotspot WebRTC P2P',
    frequency: '2.4 GHz / 5 GHz Supported',
    transferProtocol: 'WebRTC RTCDataChannel (SCTP over UDP/Local IP)',
    timestamp: Date.now()
  });
});

// WebSocket Server for WebRTC Signaling & Peer Discovery
const wss = new WebSocketServer({ server });

function broadcastPeersInRoom(roomCode: string) {
  const roomPeers = Array.from(peers.values())
    .filter(p => p.roomCode === roomCode && p.ws.readyState === WebSocket.OPEN)
    .map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      deviceType: p.deviceType,
      roomCode: p.roomCode
    }));

  const payload = JSON.stringify({
    type: 'peer-list',
    peers: roomPeers
  });

  for (const peer of peers.values()) {
    if (peer.roomCode === roomCode && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  }
}

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  let currentPeerId = '';
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

  ws.on('message', (messageData: string | Buffer) => {
    try {
      const message = JSON.parse(messageData.toString());

      switch (message.type) {
        case 'register': {
          currentPeerId = message.id;
          const roomCode = message.roomCode || 'LOBBY';
          peers.set(currentPeerId, {
            ws,
            id: currentPeerId,
            name: message.name || 'Perangkat Anonim',
            avatar: message.avatar || '📱',
            deviceType: message.deviceType || 'mobile',
            roomCode,
            ip: clientIp,
            lastSeen: Date.now()
          });

          // Confirm registration to self
          ws.send(JSON.stringify({
            type: 'registered',
            id: currentPeerId,
            roomCode
          }));

          // Notify everyone in the room
          broadcastPeersInRoom(roomCode);
          break;
        }

        case 'join-room': {
          const newRoomCode = message.roomCode || 'LOBBY';
          const peer = peers.get(currentPeerId);
          if (peer) {
            const oldRoom = peer.roomCode;
            peer.roomCode = newRoomCode;
            broadcastPeersInRoom(oldRoom);
            broadcastPeersInRoom(newRoomCode);
          }
          break;
        }

        case 'update-profile': {
          const peer = peers.get(currentPeerId);
          if (peer) {
            peer.name = message.name || peer.name;
            peer.avatar = message.avatar || peer.avatar;
            broadcastPeersInRoom(peer.roomCode);
          }
          break;
        }

        // Forward WebRTC Signaling (Offer, Answer, Candidate) or Transfer Requests
        case 'signal': {
          const targetPeer = peers.get(message.targetId);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
              type: 'signal',
              senderId: currentPeerId,
              data: message.data
            }));
          }
          break;
        }

        case 'file-request': {
          const targetPeer = peers.get(message.targetId);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
              type: 'file-request',
              senderId: currentPeerId,
              senderName: message.senderName,
              senderAvatar: message.senderAvatar,
              files: message.files,
              totalSize: message.totalSize
            }));
          }
          break;
        }

        case 'file-response': {
          const targetPeer = peers.get(message.targetId);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
              type: 'file-response',
              senderId: currentPeerId,
              accepted: message.accepted,
              reason: message.reason
            }));
          }
          break;
        }

        // Fallback relay if direct WebRTC fails
        case 'fallback-chunk': {
          const targetPeer = peers.get(message.targetId);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
              type: 'fallback-chunk',
              senderId: currentPeerId,
              fileId: message.fileId,
              fileName: message.fileName,
              fileType: message.fileType,
              chunkIndex: message.chunkIndex,
              totalChunks: message.totalChunks,
              data: message.data
            }));
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  ws.on('close', () => {
    if (currentPeerId && peers.has(currentPeerId)) {
      const peer = peers.get(currentPeerId);
      const roomCode = peer?.roomCode;
      peers.delete(currentPeerId);
      if (roomCode) {
        broadcastPeersInRoom(roomCode);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WS Error:', err);
  });
});

// Periodic stale peer cleanup
setInterval(() => {
  for (const [id, peer] of peers.entries()) {
    if (peer.ws.readyState !== WebSocket.OPEN) {
      const roomCode = peer.roomCode;
      peers.delete(id);
      broadcastPeersInRoom(roomCode);
    }
  }
}, 15000);

// Integrate Vite Middleware or Production Static Handler
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Share Rich Web Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
