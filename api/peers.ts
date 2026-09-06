type DeviceType = 'mobile' | 'desktop' | 'tablet' | 'unknown';

type RadarPeer = {
  id: string;
  name: string;
  avatar: string;
  deviceType: DeviceType;
  roomCode: string;
  // Public IP / network identifier of the device. Used to restrict the radar to
  // peers that are actually on the SAME network (same Wi-Fi / hotspot), so devices
  // from completely different networks never appear in each other's radar.
  ip: string;
  // Persistent per-device id. When a device reloads (fresh session), it reports the
  // SAME deviceId, so the server can drop the previous stale entry — preventing a
  // device's old profile from lingering in the radar after a refresh.
  deviceId: string;
  lastSeen: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __shareitRadarPeers: Map<string, RadarPeer> | undefined;
}

const radarPeers = globalThis.__shareitRadarPeers || new Map<string, RadarPeer>();
globalThis.__shareitRadarPeers = radarPeers;

const TTL_MS = 20000;


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

function normalizeRoom(room: unknown) {
  return String(room || 'HOTSPOT-1').trim().toUpperCase();
}

// Extract the client's public IP (first entry of x-forwarded-for).
function clientIp(req: any): string {
  const fwd = req.headers?.['x-forwarded-for'];
  if (Array.isArray(fwd)) return String(fwd[0] || '').trim();
  const raw = typeof fwd === 'string' ? fwd.split(',')[0] : '';
  return raw.trim();
}

function cleanup() {
  const now = Date.now();
  for (const [id, peer] of radarPeers.entries()) {
    if (now - peer.lastSeen > TTL_MS) {
      radarPeers.delete(id);
    }
  }
}

// Discovery returns peers that are reachable for THIS device:
//   - Same NETWORK (same public IP) → the manual "Pindai Ulang" same-network/hotspot case.
//   - Same ROOM → the deliberate QR/PIN pairing case (can be on a different network).
// The in-memory Map holds multiple peers keyed by id, so a new registration never
// overwrites another device's entry (unlike the single-slot ntfy topic). This is what
// prevents a discovered peer from disappearing when the other side scans again.
function peersForDiscovery(exclusionIp: string, excludeRoom: string, excludeId?: string) {
  cleanup();
  return Array.from(radarPeers.values())
    .filter(
      (peer) =>
        peer.id !== excludeId &&
        (peer.ip === exclusionIp || (excludeRoom && peer.roomCode === excludeRoom))
    )
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

export default function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // This device's own public IP. The radar is intentionally scoped to this network,
  // so it also serves as the identifier echoed back to the client.
  const myIp = clientIp(req);

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(body.id || '').trim();
    const roomCode = normalizeRoom(body.roomCode);

    if (!id) {
      res.status(400).json({ error: 'Missing peer id', peers: [], clientIp: myIp });
      return;
    }

    const deviceId = String(body.deviceId || '').trim();

    // If the SAME physical device re-registers (page refresh → new session), drop its
    // previous stale entry first so the old profile never lingers in the radar.
    if (deviceId) {
      for (const [peerId, peer] of radarPeers.entries()) {
        if (peer.deviceId === deviceId) {
          radarPeers.delete(peerId);
        }
      }
    }

    radarPeers.set(id, {
      id,
      name: normalizeAnimeDeviceName(body.name || 'Ichika'),
      avatar: String(body.avatar || '📱'),
      deviceType: (body.deviceType || 'unknown') as DeviceType,
      roomCode,
      ip: myIp,
      deviceId,
      lastSeen: Date.now(),
    });

    res.status(200).json({ ok: true, clientIp: myIp, peers: peersForDiscovery(myIp, roomCode, id) });
    return;
  }

  if (req.method === 'GET') {
    const roomCode = normalizeRoom(req.query?.roomCode || req.query?.room);
    const excludeId = req.query?.excludeId ? String(req.query.excludeId) : undefined;
    res.status(200).json({ ok: true, clientIp: myIp, peers: peersForDiscovery(myIp, roomCode, excludeId) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
