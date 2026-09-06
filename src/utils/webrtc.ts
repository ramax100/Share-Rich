import { Peer as PeerJS, DataConnection } from 'peerjs';
import { FileItem, ActiveTransferSession, Peer } from '../types';
import { normalizeAnimeDeviceName, getDeviceId, getStablePeerId } from './helpers';

export type PeerListCallback = (peers: Peer[]) => void;
export type FileRequestCallback = (request: {
  senderId: string;
  senderName: string;
  senderAvatar: string;
  files: Array<{ id: string; name: string; size: number; type: string; category: any }>;
  totalSize: number;
}) => void;
export type FileResponseCallback = (response: {
  senderId: string;
  accepted: boolean;
  reason?: string;
}) => void;
export type ProgressCallback = (session: Partial<ActiveTransferSession>) => void;
export type FileCompleteCallback = (file: {
  name: string;
  size: number;
  type: string;
  blob: Blob;
  blobUrl: string;
  peerName: string;
  peerAvatar: string;
}) => void;
interface WebRTCManagerCallbacks {
  onPeerList?: PeerListCallback;
  onFileRequest?: FileRequestCallback;
  onFileResponse?: FileResponseCallback;
  onProgress?: ProgressCallback;
  onFileComplete?: FileCompleteCallback;
  onConnectionStatus?: (connected: boolean, mode: string) => void;
  onAssignedPeerId?: (id: string) => void;
  // Receiver-side "Terima Perangkat" pairing prompt (Bluetooth-style). Fired on the
  // RECEIVER when an incoming connect-request arrives, so the accept UI shows there.
  onConnectRequest?: (req: {
    senderId: string;
    senderName: string;
    senderAvatar: string;
    peer: Peer;
  }) => void;
  // Back on the SENDER when the receiver accepted/rejected the pairing request.
  onConnectResponse?: (res: { senderId: string; accepted: boolean }) => void;
  // Fired when a previously-connected peer's DataChannel drops (browser tab closed,
  // network change, device left the room). Lets the UI show a "connection lost" notice.
  onPeerDisconnected?: (peerId: string) => void;
  // Fired when a peer's DataChannel opens (QR/kode or reconnect established). Lets the UI
  // mark the device as "Terhubung" without needing a separate app-level pairing response.
  onPeerConnected?: (peerId: string) => void;
}

// Fast + responsive transfer tuning.
// Bigger chunks (256 KB, the standard SCTP max) reduce per-message overhead so fewer,
// larger messages move more bytes per unit time over the DataChannel. We read the file in
// larger batches and let more bytes sit in-flight (buffer ceiling) so the sender doesn't
// stall waiting to refill — this is what actually lifts throughput on a fast 5 GHz link.
const CHUNK_SIZE = 256 * 1024; // 256 KB per message (standard WebRTC SCTP max).
const BATCH_READ_SIZE = 8 * 1024 * 1024; // 8 MB reads keep file I/O efficient without high RAM spikes.
const BUFFER_CEILING = 8 * 1024 * 1024; // keep ~8 MB queued in-flight so the pipe stays full.
const BUFFER_LOW_THRESHOLD = 2 * 1024 * 1024; // resume once the browser send queue drains below 2 MB.

/**
 * Bulletproof BroadcastChannel wrapper that safely catches and prevents
 * Uncaught InvalidStateError: Failed to execute 'postMessage' on 'BroadcastChannel': Channel is closed
 */
class SafeBroadcastChannel {
  private channel: BroadcastChannel | null = null;
  private isClosed = false;

  constructor(channelName: string, onMessage: (data: any) => void) {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      this.isClosed = true;
      return;
    }

    try {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = (event) => {
        if (this.isClosed || !this.channel) return;
        try {
          onMessage(event.data);
        } catch (err) {
          // Prevent message processing error from bubbling
        }
      };
      this.channel.onmessageerror = () => {};
    } catch (e) {
      this.isClosed = true;
      this.channel = null;
    }
  }

  public postMessage(data: any): boolean {
    if (this.isClosed || !this.channel) return false;
    try {
      this.channel.postMessage(data);
      return true;
    } catch (e) {
      // Channel was closed by browser / document discard
      this.close();
      return false;
    }
  }

  public close() {
    this.isClosed = true;
    if (this.channel) {
      try {
        this.channel.onmessage = null;
        this.channel.onmessageerror = null;
        this.channel.close();
      } catch (e) {}
      this.channel = null;
    }
  }
}

export class WebRTCManager {
  private peerJS: PeerJS | null = null;
  private ws: WebSocket | null = null;
  private safeBroadcast: SafeBroadcastChannel | null = null;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;

  private activeConnections = new Map<string, DataConnection>();
  private discoveredPeers = new Map<string, Peer>();

  private currentPeer: Peer | null = null;
  private peerId = '';
  private callbacks: WebRTCManagerCallbacks = {};

  private roomEventSource: EventSource | null = null;
  private roomHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private roomPollInterval: ReturnType<typeof setInterval> | null = null;
  private serverApiDiscoveryInterval: ReturnType<typeof setInterval> | null = null;
  // Network-scoped discovery: a separate bus keyed by the device's public IP so that
  // devices on the SAME network / hotspot discover each other automatically (without QR),
  // while devices on other networks never collide. Peers are still filtered by IP.
  private netEventSource: EventSource | null = null;
  private netPollInterval: ReturnType<typeof setInterval> | null = null;
  private netHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private attemptedPeers = new Set<string>();
  // Guard against spamming connect requests / duplicate connections when a user taps a
  // radar profile repeatedly. Keyed by peer id. Keeping the channel per singleton so a
  // fast double-tap doesn't open N duplicate WebRTC channels (which made the UI laggy).
  private connectRequestInFlight = new Set<string>();
  // Dedupe duplicate control deliveries (WebRTC DataChannel + room bus), so the "Terima
  // Perangkat" / "Terima file" dialogs don't flicker/re-open. Keyed by `${type}:${sender}`.
  private controlSeen = new Map<string, number>();
  // Serverless control relay over the room bus (ntfy). Even if the WebRTC DataChannel
  // fails to open (stale peer id, PeerJS cloud hiccup), the receiver still gets the
  // pairing/file notifications because they travel over the same bus that the radar
  // discovery already uses successfully across devices.
  private controlEventSource: EventSource | null = null;
  private outgoingTransferAcks = new Map<string, {
    receivedBytes: number;
    totalBytes: number;
    currentSpeedBytes: number;
    complete: boolean;
    timestamp: number;
  }>();

  // Incoming transfer tracking
  private incomingTransfer: {
    senderId: string;
    senderName: string;
    senderAvatar: string;
    fileId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    totalChunks: number;
    sessionTotalBytes: number;
    sessionBaseBytes: number;
    chunks: ArrayBuffer[];
    receivedBytes: number;
    startTime: number;
    lastMeasureTime: number;
    lastMeasureBytes: number;
    lastAckTime: number;
  } | null = null;

  // Active sending cancellation
  private isCancelled = false;
  // Guard so the SAME file stream is never started twice. The receiver's "accept"
  // (file-response) is relayed over multiple channels (DataChannel + Broadcast +
  // WebSocket + ntfy), so it can arrive more than once. Without a guard, a delayed
  // duplicate response re-invokes sendFiles() and sends the whole file a 2nd time.
  private sendingFilesByPeer = new Set<string>();

  // Public IP / network identifier of this device. The radar is scoped to the same
  // network only: discoveries whose IP differs from ours are never shown, so devices
  // on other networks (unrelated to the user) do not appear as "unknown" peers.
  private localPublicIp = '';
  // Persistent per-device identity (survives refresh) for de-duplicating stale self.
  private deviceId = '';

  constructor(callbacks: WebRTCManagerCallbacks) {
    this.callbacks = callbacks;
  }

  public updateCallbacks(newCallbacks: Partial<WebRTCManagerCallbacks>) {
    this.callbacks = { ...this.callbacks, ...newCallbacks };
  }

  public init(peer: Peer) {
    this.isDestroyed = false;
    this.currentPeer = peer;
    this.peerId = peer.id;
    // Persistent identity for this physical device (survives refresh). Used so a
    // previous session of the SAME device never lingers in the radar after a reload.
    this.deviceId = getDeviceId();

    // 1. Initialize SafeBroadcastChannel for instant local discovery (same browser tabs / local test)
    this.initBroadcastChannel();

    // 2. Initialize PeerJS (WebRTC STUN Signaling for real cross-device Wi-Fi connections)
    this.initPeerJS();

    // 3. Full-stack WebSocket fallback if running with backend container (skipped on Vercel)
    this.initWebSocket();
  }

  // --- 1. Safe BroadcastChannel (Multi-tab instant sync) ---
  private initBroadcastChannel() {
    if (this.isDestroyed) return;

    if (this.safeBroadcast) {
      this.safeBroadcast.close();
      this.safeBroadcast = null;
    }

    this.safeBroadcast = new SafeBroadcastChannel('shareit_mesh_network', (msg) => {
      if (this.isDestroyed || !msg || msg.senderId === this.peerId) return;

      if (msg.type === 'peer-presence') {
        if (!this.currentPeer || msg.roomCode === this.currentPeer.roomCode) {
          this.discoveredPeers.set(msg.peer.id, msg.peer);
          this.broadcastPeerList();

          // Reply with self presence safely
          if (this.safeBroadcast && !this.isDestroyed) {
            this.safeBroadcast.postMessage({
              type: 'peer-reply',
              roomCode: this.currentPeer?.roomCode,
              peer: this.currentPeer,
              senderId: this.peerId,
            });
          }
        }
      } else if (msg.type === 'peer-reply') {
        if (!this.currentPeer || msg.roomCode === this.currentPeer.roomCode) {
          this.discoveredPeers.set(msg.peer.id, msg.peer);
          this.broadcastPeerList();
        }
      } else if (msg.targetId === this.peerId) {
        // Targeted P2P packet (file-request, file-response, file-start, file-chunk, file-end, chat)
        this.processIncomingPacket(msg, msg.senderId);
      }
    });

    // Periodic announcement with double-guard
    if (this.broadcastInterval !== null) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    this.broadcastInterval = setInterval(() => {
      if (this.isDestroyed || !this.safeBroadcast) {
        if (this.broadcastInterval !== null) {
          clearInterval(this.broadcastInterval);
          this.broadcastInterval = null;
        }
        return;
      }

      if (this.currentPeer) {
        this.safeBroadcast.postMessage({
          type: 'peer-presence',
          roomCode: this.currentPeer.roomCode,
          peer: this.currentPeer,
          senderId: this.peerId,
        });
      }
    }, 2500);
  }

  // --- 2. PeerJS (Real WebRTC between different devices / phone and laptop) ---
  private initPeerJS() {
    if (typeof window === 'undefined' || this.isDestroyed) return;

    try {
      if (this.peerJS) {
        try {
          this.peerJS.destroy();
        } catch (e) {}
        this.peerJS = null;
      }

      // Reuse a PERSISTENT peer id stored in localStorage so the device keeps the same
      // contactable id across refreshes (a fresh id on every load would invalidate any
      // previously-shared link/QR and break the sender's "Kirim ulang" after a reload).
      const uniqueId = getStablePeerId();

      const peer = new PeerJS(uniqueId, {
        debug: 0, // Clean, zero console noise
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      this.peerJS = peer;

      peer.on('open', (id) => {
        if (this.isDestroyed) return;
        this.peerId = id;
        if (this.currentPeer) {
          this.currentPeer.id = id;
        }
        this.callbacks.onConnectionStatus?.(true, 'Wi-Fi Direct P2P Siap (5 GHz / 2.4 GHz)');
        this.callbacks.onAssignedPeerId?.(id);

        // Start room discovery signaling (registers presence + the control-relay bus so
        // pairing/file notifications arrive even if the PeerJS DataChannel is slow).
        this.initRoomSignaling();
      });

      peer.on('connection', (conn) => {
        this.setupDataConnection(conn);
      });

      peer.on('error', (err: any) => {
        if (this.isDestroyed) return;
        // Suppress benign transient signaling notices
        if (err?.type === 'peer-unavailable' || err?.type === 'disconnected') {
          return;
        }
        // The persisted id collided (e.g. the same device opened in a second tab). Clear the
        // stored id so the next init generates a fresh one, then re-connect.
        if (err?.type === 'unavailable-id') {
          try {
            this.peerJS?.destroy();
          } catch (e) {}
          this.peerJS = null;
          try {
            localStorage.removeItem('shareit_peerid');
          } catch (e) {}
          setTimeout(() => {
            if (!this.isDestroyed) this.initPeerJS();
          }, 300);
          return;
        }
      });
    } catch (err) {
      // Ignored
    }
  }

  private syncServerApiDiscovery() {
    if (this.isDestroyed || typeof window === 'undefined' || !this.currentPeer || !this.peerId) return;

    const payload = {
      id: this.peerId,
      name: normalizeAnimeDeviceName(this.currentPeer.name),
      avatar: this.currentPeer.avatar,
      deviceType: this.currentPeer.deviceType,
      roomCode: this.currentPeer.roomCode || 'HOTSPOT-1',
      deviceId: this.deviceId,
      timestamp: Date.now(),
    };

    try {
      fetch('/api/peers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || this.isDestroyed) return;
          // Learn our own public IP so the client-side network filter can keep the
          // radar limited to devices on the same network.
          if (data.clientIp && data.clientIp !== this.localPublicIp) {
            this.localPublicIp = String(data.clientIp);
            // Once we know our network IP, purge any previously-discovered peer that
            // does not provably share our network (ghosts from other networks).
            for (const [id, peer] of this.discoveredPeers.entries()) {
              if (!this.isSameNetworkPeer(peer)) {
                this.discoveredPeers.delete(id);
              }
            }
            // We intentionally do NOT start network discovery automatically. Discovery
            // is manual (only via the "Pindai Ulang" button), so re-filter the list but
            // do not auto-populate the radar.
            this.broadcastPeerList();
          }
          const apiPeers = Array.isArray(data.peers) ? data.peers : [];
          for (const remotePeer of apiPeers) {
            if (!remotePeer || !remotePeer.id || remotePeer.id === this.peerId) continue;
            // Skip our own device's stale previous session.
            if (this.deviceId && remotePeer.deviceId === this.deviceId) continue;
            this.processRoomSignal({
              type: 'announce',
              senderId: remotePeer.id,
              peer: remotePeer,
              timestamp: remotePeer.lastSeen || remotePeer.timestamp || Date.now(),
              isReply: true,
            });
          }
        })
        .catch(() => {});
    } catch (e) {}
  }

  private processRoomSignal(payload: any) {
    if (!payload || payload.senderId === this.peerId) return;

    // Drop announcements from the SAME physical device (stale previous session after a
    // refresh). The device keeps a persistent deviceId, so we can tell "our own old
    // session" apart from a genuine other device — preventing the old profile from ever
    // resurfacing in the radar on reload.
    if (this.deviceId && payload.peer && payload.peer.deviceId === this.deviceId) {
      return;
    }

    // Reject stale messages to prevent ghost peers and dead connection loops.
    if (payload.timestamp && Date.now() - payload.timestamp > 20000) return;

    if (payload.type === 'announce') {
      const remotePeer: Peer = payload.peer;
      if (remotePeer && remotePeer.id) {
        // Only ever consider devices confirmed to be on the SAME network (same
        // public IP). A peer is only trusted when we know our own network IP AND the
        // peer carries an IP that matches ours. Peers with a missing IP (e.g. legacy
        // devices or ntfy announcements sent before we knew our IP) or a mismatch are
        // DROPPED so unknown/unrelated devices never show up in the radar.
        if (!this.isSameNetworkPeer(remotePeer)) {
          return;
        }
        this.discoveredPeers.set(remotePeer.id, {
          ...remotePeer,
          name: normalizeAnimeDeviceName(remotePeer.name),
          wifiBand: '5 GHz',
          signalStrength: 5,
          distanceLevel: 1,
        });
        this.broadcastPeerList();

        // Deterministic tie-breaker: device with lexicographically greater ID initiates WebRTC connect.
        if (
          this.peerId > remotePeer.id &&
          !this.activeConnections.has(remotePeer.id) &&
          !this.attemptedPeers.has(remotePeer.id)
        ) {
          this.attemptedPeers.add(remotePeer.id);
          this.connectToPeer(remotePeer.id);
        } else if (!payload.isReply) {
          // Reply back so the other peer sees us immediately.
          this.publishRoomPresence(true);
        }
      }
    } else if (payload.type === 'leave') {
      if (payload.senderId) {
        this.discoveredPeers.delete(payload.senderId);
        this.activeConnections.delete(payload.senderId);
        this.broadcastPeerList();
      }
    }
  }

  // --- Real-time Room Mesh Signaling (Instant discovery across Wi-Fi & networks) ---
  private initRoomSignaling() {
    if (this.isDestroyed || typeof window === 'undefined' || !this.peerId) return;

    this.cleanupRoomSignaling();

    // MANUAL discovery: we only REGISTER this device's presence so that the other side
    // can find it when either user taps "Pindai Ulang". We deliberately do NOT auto
    // discover — no SSE streaming, no polling interval, no heartbeat, no network bus.
    // The radar stays empty until the user explicitly scans. This is what keeps devices
    // on the same network from showing up on their own.
    this.publishRoomPresence(false);
    this.publishApiPresence();
    // Always keep the control-relay subscription live for the current room so that
    // "Terima Perangkat"/file notifications reach the other device reliably.
    this.initControlBus();
  }

  private publishRoomPresence(isReply = false) {
    if (this.isDestroyed || !this.currentPeer || !this.peerId) return;
    const cleanRoom = (this.currentPeer.roomCode || 'HOTSPOT1').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const topic = `shareit-mesh-${cleanRoom}`;

    const payload = {
      type: 'announce',
      senderId: this.peerId,
      peer: {
        ...this.currentPeer,
        id: this.peerId,
        ip: this.localPublicIp || undefined,
        deviceId: this.deviceId,
      },
      isReply,
      timestamp: Date.now(),
    };

    try {
      fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        // Do not set application/json here: it triggers a CORS preflight on some mobile browsers.
        // ntfy accepts a plain text body, and the receiver parses the JSON string from data.message.
        body: JSON.stringify(payload),
        mode: 'cors',
        cache: 'no-store',
      }).catch(() => {});
    } catch (e) {}
  }

  // Register this device in the /api/peers registry so that a "Pindai Ulang" from the
  // other side can find it. This only PUBLISHES (registers) our presence; it does not
  // pull or display any peers, so the radar is not auto-populated.
  private publishApiPresence() {
    if (this.isDestroyed || typeof window === 'undefined' || !this.currentPeer || !this.peerId) return;
    const payload = {
      id: this.peerId,
      name: normalizeAnimeDeviceName(this.currentPeer.name),
      avatar: this.currentPeer.avatar,
      deviceType: this.currentPeer.deviceType,
      roomCode: this.currentPeer.roomCode || 'HOTSPOT-1',
      deviceId: this.deviceId,
      timestamp: Date.now(),
    };
    try {
      fetch('/api/peers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      }).then(() => {}).catch(() => {});
    } catch (e) {}
  }

  // Manual one-shot pull used by "Pindai Ulang": retrieve cached announces from a given
  // ntfy topic and process them (this is what actually surfaces peers on the radar).
  private pollNtfyOnce(topic: string) {
    if (this.isDestroyed) return;
    try {
      fetch(`https://ntfy.sh/${topic}/json?poll=1`, { cache: 'no-store', mode: 'cors' })
        .then((res) => (res.ok ? res.text() : ''))
        .then((text) => {
          if (!text || this.isDestroyed) return;
          for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              const payload = typeof data.message === 'string' ? JSON.parse(data.message) : data.message;
              this.processRoomSignal(payload);
            } catch (e) {}
          }
        })
        .catch(() => {});
    } catch (e) {}
  }

  // --- Serverless control relay over the room bus (ntfy) ---
  // The radar discovery already proves ntfy reaches a device on a different browser/device
  // reliably. We reuse the same topic as a control bus so the "Terima Perangkat" and file
  // notifications arrive even when the PeerJS DataChannel can't be established.

  private getRoomTopic(): string {
    const cleanRoom = (this.currentPeer?.roomCode || 'HOTSPOT1').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `shareit-mesh-${cleanRoom}`;
  }

  /** Push a control message to the room bus (fire-and-forget, CORS-safe plain body). */
  private postControlBus(payload: any, targetId: string, targetDeviceId?: string) {
    if (this.isDestroyed || !this.peerId) return;
    try {
      fetch(`https://ntfy.sh/${this.getRoomTopic()}`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, senderId: this.peerId, targetId, targetDeviceId }),
        mode: 'cors',
        cache: 'no-store',
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  }

  /** Process a control message picked up from the room bus. */
  private processControlBusMessage(payload: any) {
    if (!payload || this.isDestroyed || !this.peerId) return;
    const type = payload.type;
    if (type !== 'connect-request' && type !== 'connect-response' && type !== 'file-request' && type !== 'file-response') return;
    // Match by persistent deviceId (safe across reloads) OR by current peerId.
    const matchesDevice = payload.targetDeviceId && this.deviceId && payload.targetDeviceId === this.deviceId;
    const matchesId = payload.targetId && payload.targetId === this.peerId;
    if (!matchesDevice && !matchesId) return;
    const senderId = payload.senderId || payload.peer?.id || 'unknown';
    const data = {
      ...payload,
      peer: payload.peer ? { ...payload.peer, id: senderId } : payload.peer,
    };
    this.processIncomingPacket(data, senderId);
  }

  /** Live-subscribe to the room bus so control notifications arrive without a rescan. */
  private initControlBus() {
    if (this.isDestroyed || typeof window === 'undefined' || !this.peerId) return;
    this.closeControlBus();
    try {
      const es = new EventSource(`https://ntfy.sh/${this.getRoomTopic()}/sse`);
      this.controlEventSource = es;
      es.onmessage = (e) => {
        try {
          const raw = JSON.parse(e.data);
          // ntfy SSE data = a message JSON; our text body is in `.message`.
          let payload = raw && typeof raw === 'object' && typeof raw.message === 'string'
            ? JSON.parse(raw.message)
            : raw;
          if (payload && typeof payload === 'object' && payload.targetId) {
            this.processControlBusMessage(payload);
          }
        } catch (e2) {}
      };
      es.onerror = () => {
        // EventSource auto-reconnects, but if it gave up, resubscribe after a moment.
        try { if (this.controlEventSource) this.controlEventSource.close(); } catch (e3) {}
        this.controlEventSource = null;
        if (!this.isDestroyed) setTimeout(() => this.initControlBus(), 4000);
      };
    } catch (e) {}
  }

  private closeControlBus() {
    try {
      if (this.controlEventSource) {
        this.controlEventSource.close();
        this.controlEventSource = null;
      }
    } catch (e) {}
  }

  // --- Network-scoped discovery (same-network / hotspot auto-discovery) ---
  // A deterministic hash of the device's public IP produces a discovery bus that is
  // shared by every device behind that same public IP (i.e. the same Wi-Fi/hotspot),
  // and unique across networks. Devices join this bus and announce presence, so they
  // appear in each other's radar automatically — without needing a QR/PIN pairing.
  // Devices on other networks use a different bus, so they never collide.
  private getNetworkTopic(): string {
    return `shareit-net-${this.networkHash(this.localPublicIp)}`;
  }

  private networkHash(ip: string): string {
    let h = 0;
    for (let i = 0; i < ip.length; i++) {
      h = (h * 31 + ip.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  }

  private initNetworkDiscovery() {
    if (this.isDestroyed || typeof window === 'undefined' || !this.peerId) return;
    // We need our own public IP to derive the network-scoped bus; the API discovery
    // sets localPublicIp as soon as it's available, so we wait for it here.
    if (!this.localPublicIp) return;

    if (this.netEventSource) {
      try { this.netEventSource.close(); } catch (e) {}
      this.netEventSource = null;
    }
    if (this.netPollInterval) {
      clearInterval(this.netPollInterval);
      this.netPollInterval = null;
    }
    if (this.netHeartbeatInterval) {
      clearInterval(this.netHeartbeatInterval);
      this.netHeartbeatInterval = null;
    }

    const topic = this.getNetworkTopic();

    try {
      const es = new EventSource(`https://ntfy.sh/${topic}/sse?since=now`);
      this.netEventSource = es;
      es.onmessage = (event) => {
        if (this.isDestroyed) return;
        try {
          const data = JSON.parse(event.data);
          if (!data || !data.message) return;
          const payload = typeof data.message === 'string' ? JSON.parse(data.message) : data.message;
          this.processRoomSignal(payload);
        } catch (e) {}
      };
      es.onerror = () => {};
    } catch (e) {}

    this.publishNetworkPresence();

    // Poll fallback for browsers/networks where SSE is blocked.
    this.netPollInterval = setInterval(() => {
      if (this.isDestroyed) { this.cleanupNetworkDiscovery(); return; }
      fetch(`https://ntfy.sh/${topic}/json?poll=1`, { cache: 'no-store', mode: 'cors' })
        .then((res) => (res.ok ? res.text() : ''))
        .then((text) => {
          if (!text || this.isDestroyed) return;
          for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              const payload = typeof data.message === 'string' ? JSON.parse(data.message) : data.message;
              this.processRoomSignal(payload);
            } catch (e) {}
          }
        })
        .catch(() => {});
    }, 4000);

    // Heartbeat so peers appear quickly and stay fresh.
    this.netHeartbeatInterval = setInterval(() => {
      if (this.isDestroyed) { this.cleanupNetworkDiscovery(); return; }
      this.publishNetworkPresence();
    }, 3500);
  }

  private publishNetworkPresence() {
    if (this.isDestroyed || !this.currentPeer || !this.peerId || !this.localPublicIp) return;
    const topic = this.getNetworkTopic();
    const payload = {
      type: 'announce',
      senderId: this.peerId,
      peer: {
        ...this.currentPeer,
        id: this.peerId,
        ip: this.localPublicIp,
        deviceId: this.deviceId,
      },
      isReply: false,
      timestamp: Date.now(),
    };
    try {
      fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        mode: 'cors',
        cache: 'no-store',
      }).catch(() => {});
    } catch (e) {}
  }

  private cleanupNetworkDiscovery() {
    if (this.netEventSource) {
      try { this.netEventSource.close(); } catch (e) {}
      this.netEventSource = null;
    }
    if (this.netPollInterval) {
      clearInterval(this.netPollInterval);
      this.netPollInterval = null;
    }
    if (this.netHeartbeatInterval) {
      clearInterval(this.netHeartbeatInterval);
      this.netHeartbeatInterval = null;
    }
  }

  private cleanupRoomSignaling() {
    this.closeControlBus();
    if (this.roomEventSource) {
      try {
        this.roomEventSource.close();
      } catch (e) {}
      this.roomEventSource = null;
    }
    if (this.roomHeartbeatInterval) {
      clearInterval(this.roomHeartbeatInterval);
      this.roomHeartbeatInterval = null;
    }
    if (this.roomPollInterval) {
      clearInterval(this.roomPollInterval);
      this.roomPollInterval = null;
    }
    if (this.serverApiDiscoveryInterval) {
      clearInterval(this.serverApiDiscoveryInterval);
      this.serverApiDiscoveryInterval = null;
    }
    this.cleanupNetworkDiscovery();
  }

  // Setup PeerJS Data Connection
  private setupDataConnection(conn: DataConnection) {
    this.activeConnections.set(conn.peer, conn);

    const onOpen = () => {
      try {
        const rawDc = (conn as any)?.dataChannel as RTCDataChannel | undefined;
        if (rawDc) {
          rawDc.binaryType = 'arraybuffer';
          try {
            rawDc.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
          } catch (e) {}
        }
      } catch (e) {}

      // Send handshake metadata
      if (this.currentPeer) {
        this.sendPeerPacket(conn, {
          type: 'handshake',
          peer: this.currentPeer,
        });
      }

      // Notify the UI that this peer is now reachable/connected.
      if (conn.peer && conn.peer !== this.peerId) {
        this.callbacks.onPeerConnected?.(conn.peer);
      }
    };

    if (conn.open) {
      onOpen();
    } else {
      conn.once?.('open', onOpen);
    }

    conn.on('data', (data: any) => {
      this.handleIncomingData(data, conn);
    });

    conn.on('close', () => {
      this.activeConnections.delete(conn.peer);
      // Let the UI know a live pairing dropped (so it can clear "Terhubung" and toast).
      this.callbacks.onPeerDisconnected?.(conn.peer);
      if (this.incomingTransfer && this.incomingTransfer.senderId === conn.peer) {
        this.incomingTransfer = null;
        this.callbacks.onProgress?.({
          status: 'cancelled',
          currentSpeedBytes: 0,
          etaSeconds: 0,
        });
      }
      // Keep the peer visible in Radar; the next transfer can reconnect automatically.
      this.broadcastPeerList();
    });

    conn.on('error', () => {
      this.activeConnections.delete(conn.peer);
      this.callbacks.onPeerDisconnected?.(conn.peer);
    });
  }

  // --- 3. Full-stack WebSocket (For Cloud Run / Local Server mode) ---
  private initWebSocket() {
    if (typeof window === 'undefined' || this.isDestroyed) return;
    if (window.location.hostname.includes('vercel.app')) return; // Vercel uses room mesh signaling & WebRTC
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}`;

      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.currentPeer && !this.isDestroyed) {
          try {
            ws.send(
              JSON.stringify({
                type: 'register',
                id: this.currentPeer.id,
                name: normalizeAnimeDeviceName(this.currentPeer.name),
                avatar: this.currentPeer.avatar,
                deviceType: this.currentPeer.deviceType,
                roomCode: this.currentPeer.roomCode,
              })
            );
          } catch (e) {}
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'peer-list') {
            const rawPeers: Peer[] = msg.peers || [];
            rawPeers
              .filter((p) => p.id !== this.peerId)
              .forEach((p) => this.discoveredPeers.set(p.id, p));
            this.broadcastPeerList();
          } else if (msg.type === 'file-request') {
            this.callbacks.onFileRequest?.({
              senderId: msg.senderId,
              senderName: msg.senderName,
              senderAvatar: msg.senderAvatar,
              files: msg.files,
              totalSize: msg.totalSize,
            });
          } else if (msg.type === 'file-response') {
            this.callbacks.onFileResponse?.({
              senderId: msg.senderId,
              accepted: msg.accepted,
              reason: msg.reason,
            });
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        // Expected on static hosting platforms like Vercel; PeerJS handles P2P signaling
      };
    } catch (e) {}
  }

  // --- Connect Directly to a Target Peer by ID or PIN ---
  public async connectToPeer(targetId: string): Promise<DataConnection | null> {
    const existing = this.activeConnections.get(targetId);
    if (existing && existing.open) {
      return existing;
    }

    if (!this.peerJS || this.peerJS.destroyed) return null;

    const cleanRoom = (this.currentPeer?.roomCode || 'HOTSPOT1').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const candidateIds: string[] = [];

    if (targetId.startsWith('shareit-')) {
      candidateIds.push(targetId);
    } else {
      candidateIds.push(`shareit-${cleanRoom}-${targetId}`);
      candidateIds.push(targetId);
      candidateIds.push(`shareit-${cleanRoom}`);
    }

    for (const idToTry of candidateIds) {
      try {
        if (idToTry === this.peerJS.id) continue;

        const conn = this.peerJS.connect(idToTry, { reliable: true, serialization: 'raw' });
        this.setupDataConnection(conn);

        const success = await new Promise<boolean>((resolve) => {
          if (conn.open) {
            resolve(true);
            return;
          }
          const timer = setTimeout(() => resolve(false), 2500);
          conn.once?.('open', () => {
            clearTimeout(timer);
            resolve(true);
          });
          conn.once?.('error', () => {
            clearTimeout(timer);
            resolve(false);
          });
        });

        if (success) {
          return conn;
        }
      } catch (e) {}
    }

    return null;
  }

  // --- Safe packet sender for control messages ---
  public sendPeerPacket(conn: DataConnection | undefined, payload: any) {
    if (!conn) return;
    const send = () => {
      try {
        // Use JSON strings for control packets so the same code works with
        // PeerJS raw serialization. Raw mode skips BinaryPack overhead and is
        // much faster for large file chunks on mobile receivers.
        conn.send(JSON.stringify(payload));
      } catch (e) {}
    };

    if (conn.open) {
      send();
    } else {
      conn.once?.('open', send);
    }
  }

  // --- Handle Incoming P2P Data ---
  private handleIncomingData(data: any, conn: DataConnection) {
    if (!data) return;

    // Direct High-Speed Raw Binary Chunk (raw PeerJS mode, zero BinaryPack overhead)
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      data.arrayBuffer()
        .then((buffer) => this.handleIncomingRawChunk(buffer, conn.peer))
        .catch(() => {});
      return;
    }

    if (data instanceof ArrayBuffer || data instanceof Uint8Array || (data && typeof data === 'object' && data.byteLength !== undefined)) {
      this.handleIncomingRawChunk(data, conn.peer);
      return;
    }

    let parsed = data;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        return;
      }
    }

    // Handshake
    if (parsed.type === 'handshake' && parsed.peer) {
      this.discoveredPeers.set(conn.peer, {
        ...parsed.peer,
        id: conn.peer,
        wifiBand: '5 GHz',
        signalStrength: 5,
        distanceLevel: 1,
      });
      this.broadcastPeerList();

      // Reply back with own handshake if this was an initial announcement
      if (!parsed.isReply && this.currentPeer) {
        this.sendPeerPacket(conn, {
          type: 'handshake',
          peer: this.currentPeer,
          isReply: true,
        });
      }

      // If knownPeers was sent by the other party, mesh with any missing peers
      if (Array.isArray(parsed.knownPeers)) {
        for (const otherPeer of parsed.knownPeers) {
          if (
            otherPeer &&
            otherPeer.id &&
            otherPeer.id !== this.peerId &&
            !this.activeConnections.has(otherPeer.id)
          ) {
            try {
              const peerConn = this.peerJS?.connect(otherPeer.id, { reliable: true, serialization: 'raw' });
              if (peerConn) {
                this.setupDataConnection(peerConn);
              }
            } catch (e) {}
          }
        }
      }
      return;
    }

    this.processIncomingPacket(parsed, conn.peer);
  }

  private sendTransferAck(senderId: string, receivedBytes: number, totalBytes: number, currentSpeedBytes: number, complete = false) {
    const payload = {
      type: 'transfer-ack',
      receivedBytes,
      totalBytes,
      currentSpeedBytes,
      complete,
      timestamp: Date.now(),
    };

    const conn = this.getActiveConnection(senderId);
    if (conn && conn.open) {
      this.sendPeerPacket(conn, payload);
    } else if (this.safeBroadcast && !this.isDestroyed) {
      try {
        this.safeBroadcast.postMessage({
          targetId: senderId,
          senderId: this.peerId,
          ...payload,
        });
      } catch (e) {}
    }
  }

  // --- High-Performance Raw Binary Chunk Receiver ---
  private handleIncomingRawChunk(rawChunk: any, senderId: string) {
    if (!this.incomingTransfer) {
      this.incomingTransfer = {
        senderId,
        senderName: 'Pengirim',
        senderAvatar: 'anime:ichika',
        fileId: 'stream-' + Date.now(),
        fileName: 'berkas_diterima',
        fileSize: 10 * 1024 * 1024,
        fileType: 'application/octet-stream',
        totalChunks: 1,
        sessionTotalBytes: 10 * 1024 * 1024,
        sessionBaseBytes: 0,
        chunks: [],
        receivedBytes: 0,
        startTime: performance.now(),
        lastMeasureTime: performance.now(),
        lastMeasureBytes: 0,
        lastAckTime: 0,
      };
    }

    let chunkBuffer: ArrayBuffer | null = null;
    if (rawChunk instanceof ArrayBuffer) {
      chunkBuffer = rawChunk;
    } else if (rawChunk instanceof Uint8Array) {
      chunkBuffer = rawChunk.buffer.slice(rawChunk.byteOffset, rawChunk.byteOffset + rawChunk.byteLength);
    } else if (rawChunk && rawChunk.buffer instanceof ArrayBuffer) {
      const view = rawChunk as ArrayBufferView;
      chunkBuffer = rawChunk.byteOffset !== undefined && rawChunk.byteLength !== undefined
        ? view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
        : rawChunk.buffer;
    } else if (rawChunk && Array.isArray(rawChunk.data)) {
      chunkBuffer = new Uint8Array(rawChunk.data).buffer;
    }

    if (!chunkBuffer || chunkBuffer.byteLength === 0) return;

    this.incomingTransfer.chunks.push(chunkBuffer);
    this.incomingTransfer.receivedBytes += chunkBuffer.byteLength;

    const now = performance.now();
    // High-speed throttled UI update: dispatch only every 70ms to keep React running at 60 FPS
    if (now - this.incomingTransfer.lastMeasureTime >= 70) {
      const elapsedTotalSec = Math.max(0.01, (now - this.incomingTransfer.startTime) / 1000);
      const timeDiff = (now - this.incomingTransfer.lastMeasureTime) / 1000;
      const bytesDiff = this.incomingTransfer.receivedBytes - this.incomingTransfer.lastMeasureBytes;
      const currentSpeed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

      this.incomingTransfer.lastMeasureTime = now;
      this.incomingTransfer.lastMeasureBytes = this.incomingTransfer.receivedBytes;

      const totalSize = Math.max(1, Number(this.incomingTransfer.sessionTotalBytes) || Number(this.incomingTransfer.fileSize) || 1);
      const acknowledgedBytes = Math.min(totalSize, this.incomingTransfer.sessionBaseBytes + this.incomingTransfer.receivedBytes);
      const remainingBytes = Math.max(0, totalSize - acknowledgedBytes);
      const avgSpeed = this.incomingTransfer.receivedBytes / elapsedTotalSec;
      const effectiveSpeed = currentSpeed > 0 ? currentSpeed : avgSpeed;
      const eta = effectiveSpeed > 0 ? remainingBytes / effectiveSpeed : 0;

      this.callbacks.onProgress?.({
        transferredBytes: acknowledgedBytes,
        totalBytes: totalSize,
        currentSpeedBytes: effectiveSpeed,
        peakSpeedBytes: Math.max(effectiveSpeed, avgSpeed),
        elapsedSeconds: Math.floor(elapsedTotalSec),
        etaSeconds: Math.ceil(eta),
        status: 'transferring',
      });

      if (now - this.incomingTransfer.lastAckTime >= 180) {
        this.incomingTransfer.lastAckTime = now;
        this.sendTransferAck(senderId, acknowledgedBytes, totalSize, effectiveSpeed, false);
      }
    }
  }

  // --- Process Universal Transfer Packet (WebRTC / BroadcastChannel / WebSocket) ---
  /** Returns true if this control message is a duplicate (skip processing). */
  private dedupeControl(type: string, senderId: string): boolean {
    const key = `${type}:${senderId}`;
    const last = this.controlSeen.get(key) || 0;
    if (Date.now() - last < 3000) return true;
    this.controlSeen.set(key, Date.now());
    return false;
  }

  private processIncomingPacket(data: any, senderId: string) {
    if (!data) return;

    // Cancel signal from the other device.
    if (data.type === 'transfer-cancel') {
      this.isCancelled = true;
      this.incomingTransfer = null;
      this.callbacks.onProgress?.({
        status: 'cancelled',
        currentSpeedBytes: 0,
        etaSeconds: 0,
      });
      return;
    }

    // Receiver acknowledgement: sender UI follows bytes actually received, not just bytes queued for sending.
    if (data.type === 'transfer-ack') {
      const receivedBytes = Math.max(0, Number(data.receivedBytes) || 0);
      const totalBytes = Math.max(1, Number(data.totalBytes) || 1);
      const currentSpeedBytes = Math.max(0, Number(data.currentSpeedBytes) || 0);
      const complete = Boolean(data.complete) || receivedBytes >= totalBytes;

      this.outgoingTransferAcks.set(senderId, {
        receivedBytes,
        totalBytes,
        currentSpeedBytes,
        complete,
        timestamp: Date.now(),
      });

      this.callbacks.onProgress?.({
        transferredBytes: Math.min(receivedBytes, totalBytes),
        totalBytes,
        currentSpeedBytes,
        peakSpeedBytes: currentSpeedBytes,
        etaSeconds: currentSpeedBytes > 0 ? Math.ceil(Math.max(0, totalBytes - receivedBytes) / currentSpeedBytes) : 0,
        status: complete ? 'completed' : 'transferring',
      });
      return;
    }

    // Bluetooth-style pairing: a sender is asking to connect to us (the receiver).
    if (data.type === 'connect-request') {
      // Dedupe: the same request may arrive over both the DataChannel and the room bus.
      if (senderId !== this.peerId && this.dedupeControl('connect-request', senderId)) return;
      if (data.peer) {
        this.discoveredPeers.set(senderId, {
          ...data.peer,
          id: senderId,
          name: normalizeAnimeDeviceName(data.peer.name),
          wifiBand: '5 GHz',
          signalStrength: 5,
          distanceLevel: 1,
        });
        this.broadcastPeerList();
      }
      this.callbacks.onConnectRequest?.({
        senderId,
        senderName: normalizeAnimeDeviceName(data.senderName || data.peer?.name || 'Perangkat'),
        senderAvatar: data.senderAvatar || data.peer?.avatar || 'anime:ichika',
        peer: data.peer
          ? { ...data.peer, id: senderId, name: normalizeAnimeDeviceName(data.peer.name) }
          : { id: senderId, name: 'Perangkat', avatar: 'anime:ichika', deviceType: 'mobile', roomCode: this.currentPeer?.roomCode || '' },
      });
      return;
    }

    // Back on the SENDER: the receiver answered the pairing request.
    if (data.type === 'connect-response') {
      if (this.dedupeControl('connect-response', senderId)) return;
      this.callbacks.onConnectResponse?.({
        senderId,
        accepted: Boolean(data.accepted),
      });
      return;
    }

    // File Request from Sender
    if (data.type === 'file-request') {
      if (this.dedupeControl('file-request', senderId)) return;
      this.callbacks.onFileRequest?.({
        senderId,
        senderName: normalizeAnimeDeviceName(data.senderName),
        senderAvatar: data.senderAvatar,
        files: data.files,
        totalSize: data.totalSize,
      });
      return;
    }

    // File Response from Receiver
    if (data.type === 'file-response') {
      if (this.dedupeControl('file-response', senderId)) return;
      this.callbacks.onFileResponse?.({
        senderId,
        accepted: data.accepted,
        reason: data.reason,
      });
      return;
    }

    // File Transfer Start
    if (data.type === 'file-start') {
      this.incomingTransfer = {
        senderId,
        senderName: normalizeAnimeDeviceName(data.senderName || 'Pengirim'),
        senderAvatar: data.senderAvatar || 'anime:ichika',
        fileId: data.fileId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType || 'application/octet-stream',
        totalChunks: data.totalChunks,
        sessionTotalBytes: Number(data.sessionTotalBytes) || Number(data.fileSize) || 1,
        sessionBaseBytes: Number(data.sessionBaseBytes) || 0,
        chunks: [],
        receivedBytes: 0,
        startTime: performance.now(),
        lastMeasureTime: performance.now(),
        lastMeasureBytes: 0,
        lastAckTime: 0,
      };
      this.callbacks.onProgress?.({
        transferredBytes: this.incomingTransfer.sessionBaseBytes,
        totalBytes: this.incomingTransfer.sessionTotalBytes,
        currentSpeedBytes: 0,
        peakSpeedBytes: 0,
        elapsedSeconds: 0,
        etaSeconds: 0,
        status: 'transferring',
      });
      return;
    }

    // File Chunk Arrival (Object-wrapped Fallback)
    if (data.type === 'file-chunk') {
      try {
        if (!this.incomingTransfer) {
          this.incomingTransfer = {
            senderId,
            senderName: normalizeAnimeDeviceName(data.senderName || 'Pengirim'),
            senderAvatar: data.senderAvatar || 'anime:ichika',
            fileId: data.fileId,
            fileName: data.fileName || 'file_transfer',
            fileSize: Number(data.fileSize) || 1024 * 1024,
            fileType: data.fileType || 'application/octet-stream',
            totalChunks: Number(data.totalChunks) || 1,
            sessionTotalBytes: Number(data.sessionTotalBytes) || Number(data.fileSize) || 1,
            sessionBaseBytes: Number(data.sessionBaseBytes) || 0,
            chunks: [],
            receivedBytes: 0,
            startTime: performance.now(),
            lastMeasureTime: performance.now(),
            lastMeasureBytes: 0,
            lastAckTime: 0,
          };
        } else if (this.incomingTransfer.fileId !== data.fileId) {
          this.incomingTransfer.fileId = data.fileId;
          if (data.fileName) this.incomingTransfer.fileName = data.fileName;
          if (data.fileSize) this.incomingTransfer.fileSize = Number(data.fileSize);
          this.incomingTransfer.chunks = [];
          this.incomingTransfer.receivedBytes = 0;
        }

        if (data.chunk) {
          this.handleIncomingRawChunk(data.chunk, senderId);
        }
      } catch (chunkErr) {
        console.warn('Error processing chunk:', chunkErr);
      }
      return;
    }

    // File Transfer Complete
    if (data.type === 'file-end') {
      if (!this.incomingTransfer) return;

      try {
        const safeType = this.incomingTransfer.fileType || 'application/octet-stream';
        const blob = new Blob(this.incomingTransfer.chunks, { type: safeType });
        const blobUrl = URL.createObjectURL(blob);

        this.callbacks.onFileComplete?.({
          name: this.incomingTransfer.fileName || 'file-transfer',
          size: blob.size,
          type: safeType,
          blob,
          blobUrl,
          peerName: normalizeAnimeDeviceName(this.incomingTransfer.senderName || 'Pengirim'),
          peerAvatar: this.incomingTransfer.senderAvatar || 'anime:ichika',
        });

        const finalTotalBytes = Math.max(1, this.incomingTransfer.sessionTotalBytes || blob.size || 1);
        const finalReceivedBytes = Math.min(finalTotalBytes, this.incomingTransfer.sessionBaseBytes + blob.size);
        this.sendTransferAck(senderId, finalReceivedBytes, finalTotalBytes, 0, true);

        this.callbacks.onProgress?.({
          transferredBytes: finalReceivedBytes,
          totalBytes: finalTotalBytes,
          status: 'completed',
          currentSpeedBytes: 0,
          etaSeconds: 0,
        });
      } catch (endErr) {
        console.warn('Error finalizing file:', endErr);
      } finally {
        this.incomingTransfer = null;
      }
      return;
    }

  }

  // --- Helper: Find Any Matching Active & Open Connection ---
  public getActiveConnection(targetId: string): DataConnection | undefined {
    let conn = this.activeConnections.get(targetId);
    if (conn && conn.open) return conn;

    // Search by partial key (e.g. host prefix or custom peer ID)
    for (const [id, c] of this.activeConnections.entries()) {
      if (c.open && (id === targetId || id.includes(targetId) || targetId.includes(id))) {
        return c;
      }
    }

    // Fallback: If only 1 peer connection is open, use it
    for (const c of this.activeConnections.values()) {
      if (c.open) return c;
    }

    return undefined;
  }

  // --- Send File Request to Receiver ---
  public async sendFileRequest(targetPeer: Peer, files: FileItem[]) {
    let conn = this.getActiveConnection(targetPeer.id);
    if (!conn) {
      conn = (await this.connectToPeer(targetPeer.id)) || undefined;
    }
    if (!conn) {
      conn = this.getActiveConnection(targetPeer.id);
    }

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    const payload = {
      type: 'file-request',
      senderName: normalizeAnimeDeviceName(this.currentPeer?.name || 'Perangkat Pengirim'),
      senderAvatar: this.currentPeer?.avatar || 'anime:ichika',
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        category: f.category,
      })),
      totalSize,
    };

    if (conn && conn.open) {
      this.sendPeerPacket(conn, payload);
    }
    
    if (this.safeBroadcast && !this.isDestroyed) {
      try {
        this.safeBroadcast.postMessage({
          targetId: targetPeer.id,
          senderId: this.peerId,
          ...payload,
        });
      } catch (e) {}
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            ...payload,
            targetId: targetPeer.id,
          })
        );
      } catch (e) {}
    }
    // Relay the file request over the room bus so the receiver's "Terima file…" prompt
    // shows reliably even if the DataChannel isn't open yet.
    this.postControlBus(payload, targetPeer.id, targetPeer.deviceId);
  }

  /**
   * Re-trigger a file request to a receiver who never got the "Terima" notification.
   * Called by the sender's "Hubungkan Ulang" button. Re-resolves the receiver's current
   * live id (it may have changed after a page reload), drops any stale channel, and then
   * re-sends the file-request so the receiver's "Terima file…" prompt shows up again.
   */
  public async retrySendFileRequest(targetPeer: Peer, files: FileItem[]) {
    // 1) Re-resolve the receiver's freshest live id from the registry.
    const resolved = await this.refreshPeersFromRegistry(targetPeer);
    const targetId = resolved.id || targetPeer.id;

    // 2) Drop a stale/closed channel so we open a totally fresh DataChannel.
    const stale = this.activeConnections.get(targetId);
    if (stale && !stale.open) {
      try {
        this.activeConnections.delete(targetId);
        stale.close();
      } catch (e) {}
    }

    // 3) If the channel isn't open yet, re-trigger the Bluetooth-style pairing prompt so
    //    the receiver re-surfaces; otherwise just re-send the file request notification.
    const existing = this.getActiveConnection(targetId);
    if (!existing) {
      await this.sendConnectRequest(resolved);
    }
    await this.sendFileRequest(resolved, files);
  }

  // --- Respond to File Request (Receiver Accepts or Rejects) ---
  public respondFileRequest(senderId: string, accepted: boolean, reason?: string) {
    const conn = this.getActiveConnection(senderId);
    const payload = {
      type: 'file-response',
      accepted,
      reason,
    };

    if (conn && conn.open) {
      this.sendPeerPacket(conn, payload);
    }
    
    if (this.safeBroadcast && !this.isDestroyed) {
      try {
        this.safeBroadcast.postMessage({
          targetId: senderId,
          senderId: this.peerId,
          ...payload,
        });
      } catch (e) {}
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            ...payload,
            targetId: senderId,
          })
        );
      } catch (e) {}
    }
    this.postControlBus(payload, senderId, this.discoveredPeers.get(senderId)?.deviceId);
  }

  // --- "Terima Perangkat" pairing (Bluetooth-style) ---
  // Sender calls this to ask the receiver to accept the connection. The actual accept
  // prompt is shown on the RECEIVER (onConnectRequest). We establish the DataChannel
  // ourselves (connectToPeer) so the message can flow even if the receiver's radar is
  // currently empty after a rescan.
  public async sendConnectRequest(targetPeer: Peer) {
    if (this.isDestroyed || !this.currentPeer) return;

    const targetId = targetPeer.id;
    if (!targetId) return;

    // Don't re-fire a connect request for the same peer while one is already in flight
    // — a rapid double-tap was opening duplicate channels and dragging the UI down.
    if (this.connectRequestInFlight.has(targetId)) return;
    this.connectRequestInFlight.add(targetId);
    try {
      // Make the receiver able to find/answer us (fire-and-forget; no blocking fetch).
      this.publishRoomPresence(false);
      this.publishApiPresence();

      // Open a channel to the receiver. connectToPeer() already returns the existing
      // open channel when present, and sendPeerPacket() queues the payload until 'open',
      // so the pairing message reliably arrives even if the channel is still connecting.
      let conn = this.getActiveConnection(targetId);
      if (!conn || !conn.open) {
        conn = (await this.connectToPeer(targetId)) || undefined;
      }
      if (!conn) conn = this.getActiveConnection(targetId);

      const payload = {
        type: 'connect-request',
        senderName: normalizeAnimeDeviceName(this.currentPeer.name),
        senderAvatar: this.currentPeer.avatar,
        peer: { ...this.currentPeer, id: this.peerId },
        timestamp: Date.now(),
      };

      // sendPeerPacket() queues the payload until the channel opens, so the pairing
      // message still arrives if the DataChannel is mid-handshake.
      if (conn) {
        this.sendPeerPacket(conn, payload);
      }
      // Same-tab/loopback + server relay fallback (BroadcastChannel & WS are skipped on
      // cross-device Vercel, but harmless here).
      if (this.safeBroadcast && !this.isDestroyed) {
        try {
          this.safeBroadcast.postMessage({
            targetId,
            senderId: this.peerId,
            ...payload,
          });
        } catch (e) {}
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ ...payload, targetId }));
        } catch (e) {}
      }
      // Key reliability path: relay across devices over the room bus (ntfy), which works
      // even when the PeerJS DataChannel can't open. The receiver's live subscription
      // delivers this as a "connect-request" and shows the Terima Perangkat prompt.
      this.postControlBus(payload, targetId, targetPeer.deviceId);
    } finally {
      // Release the guard shortly after so a later deliberate click can re-pair if needed.
      setTimeout(() => this.connectRequestInFlight.delete(targetId), 2500);
    }
  }

  // Receiver answers the pairing request (accepted true/false). Accepted => the sender
  // is confirmed, and we also actively connect back so BOTH appear in each other's radar.
  public respondToConnect(senderId: string, peer: Peer | null, accepted: boolean) {
    const payload = {
      type: 'connect-response',
      accepted,
    };

    const conn = this.getActiveConnection(senderId);
    if (conn && conn.open) {
      this.sendPeerPacket(conn, payload);
    }
    if (this.safeBroadcast && !this.isDestroyed) {
      try {
        this.safeBroadcast.postMessage({
          targetId: senderId,
          senderId: this.peerId,
          ...payload,
        });
      } catch (e) {}
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ ...payload, targetId: senderId }));
      } catch (e) {}
    }
    // Relay the answer over the room bus so the sender reliably learns accepted/rejected
    // even if the DataChannel didn't open.
    this.postControlBus(payload, senderId, peer?.deviceId || this.discoveredPeers.get(senderId)?.deviceId);

    if (accepted && peer) {
      // Establish the channel back to the sender and resurface it in our radar.
      this.publishRoomPresence(false);
      this.publishApiPresence();
      this.acceptDevice(peer);
    }
  }

  // --- Stream Real File Chunks across WebRTC DataChannel ---
  public async sendFiles(
    targetPeer: Peer,
    files: FileItem[],
    onProgress: (session: Partial<ActiveTransferSession>) => void
  ) {
    // If a stream to this peer is already running, ignore the duplicate call (a second
    // accepted-response arriving over a relayed channel must not re-send the whole file).
    if (this.sendingFilesByPeer.has(targetPeer.id)) return;
    this.sendingFilesByPeer.add(targetPeer.id);

    try {
    this.isCancelled = false;
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    // Initial waiting / connecting state
    onProgress({
      status: 'waiting',
      transferredBytes: 0,
      totalBytes,
      currentSpeedBytes: 0,
      currentFileIndex: 0,
      elapsedSeconds: 0,
      etaSeconds: 0,
    });

    let conn = this.getActiveConnection(targetPeer.id);
    if (!conn) {
      conn = (await this.connectToPeer(targetPeer.id)) || undefined;
    }

    if (!conn) {
      await new Promise((r) => setTimeout(r, 400));
      conn = this.getActiveConnection(targetPeer.id);
    }

    if (!conn && !this.safeBroadcast) {
      onProgress({
        status: 'failed',
        transferredBytes: 0,
        totalBytes,
        currentSpeedBytes: 0,
      });
      return;
    }

    let transferredBytes = 0;
    this.outgoingTransferAcks.set(targetPeer.id, {
      receivedBytes: 0,
      totalBytes,
      currentSpeedBytes: 0,
      complete: false,
      timestamp: Date.now(),
    });
    const startTime = performance.now();
    let lastMeasureTime = performance.now();
    let lastMeasureBytes = 0;
    let currentSpeed = 60 * 1024 * 1024; // Baseline Wi-Fi speed ~60 MB/s
    let lastYieldTime = performance.now();
    let lastProgressTime = performance.now();

    // Prepare raw DataChannel for maximum SCTP throughput
    const rawDc = (conn as any)?.dataChannel as RTCDataChannel | undefined;
    if (rawDc) {
      rawDc.binaryType = 'arraybuffer';
      try {
        rawDc.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
      } catch (e) {}
    }

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (this.isCancelled) break;

      const fileItem = files[fileIndex];
      let file = fileItem.file;
      if (!file) {
        // Fallback: if real File instance was not stored (e.g. quick demo), synthesize safe File
        const dummyData = new Uint8Array(Math.min(fileItem.size, 1024 * 1024));
        file = new File([dummyData], fileItem.name, { type: fileItem.type || 'application/octet-stream' });
      }

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const sessionBaseBytes = transferredBytes;

      // 1. Send Header
      const header = {
        type: 'file-start',
        fileId: fileItem.id,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        totalChunks,
        sessionTotalBytes: totalBytes,
        sessionBaseBytes,
        senderName: normalizeAnimeDeviceName(this.currentPeer?.name),
        senderAvatar: this.currentPeer?.avatar,
      };

      if (conn && conn.open) {
        this.sendPeerPacket(conn, header);
      } else if (this.safeBroadcast) {
        this.safeBroadcast.postMessage({
          targetId: targetPeer.id,
          senderId: this.peerId,
          ...header,
        });
      }

      // 2. Read & Stream Chunks directly at Maximum Hardware Speed with 2MB Memory Batching
      let fileOffset = 0;
      let chunkIdx = 0;

      while (fileOffset < file.size && !this.isCancelled) {
        const batchEnd = Math.min(fileOffset + BATCH_READ_SIZE, file.size);
        let batchBuffer: ArrayBuffer;
        try {
          batchBuffer = await file.slice(fileOffset, batchEnd).arrayBuffer();
        } catch (readErr) {
          console.error('Error reading file batch:', readErr);
          break;
        }

        let batchOffset = 0;
        while (batchOffset < batchBuffer.byteLength && !this.isCancelled) {
          const chunkEnd = Math.min(batchOffset + CHUNK_SIZE, batchBuffer.byteLength);
          const chunk = batchBuffer.slice(batchOffset, chunkEnd);

          // Turbo backpressure: keep many chunks in-flight, but pause before memory grows too high.
          if (rawDc && rawDc.bufferedAmount > BUFFER_CEILING) {
            await new Promise<void>((resolve) => {
              let done = false;
              const onLow = () => {
                if (!done) {
                  done = true;
                  rawDc.removeEventListener('bufferedamountlow', onLow);
                  resolve();
                }
              };
              rawDc.addEventListener('bufferedamountlow', onLow);
              setTimeout(onLow, 80);
            });
          }

          // Send through PeerJS DataConnection, not raw RTCDataChannel.
          // PeerJS wraps/binary-packs messages before they reach conn.on('data').
          // Sending raw bytes directly through rawDc can bypass PeerJS decoding and
          // causes the receiver progress to stay at 0% on some browsers/devices.
          if (conn && conn.open) {
            try {
              conn.send(chunk);
            } catch (e) {
              try {
                conn.send({
                  type: 'file-chunk',
                  fileId: fileItem.id,
                  fileName: file.name,
                  fileSize: file.size,
                  totalChunks,
                  sessionTotalBytes: totalBytes,
                  sessionBaseBytes,
                  chunkIndex: chunkIdx,
                  chunk,
                });
              } catch (err) {}
            }
          } else if (this.safeBroadcast) {
            this.safeBroadcast.postMessage({
              targetId: targetPeer.id,
              senderId: this.peerId,
              type: 'file-chunk',
              fileId: fileItem.id,
              fileName: file.name,
              fileSize: file.size,
              totalChunks,
              sessionTotalBytes: totalBytes,
              sessionBaseBytes,
              chunkIndex: chunkIdx,
              chunk,
            });
          }

          batchOffset += chunk.byteLength;
          transferredBytes += chunk.byteLength;
          chunkIdx++;

          // Microtask yield every 160ms: less UI overhead, higher throughput on mobile CPUs.
          const now = performance.now();
          if (now - lastYieldTime > 160) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            lastYieldTime = performance.now();
          }

          // Throttle React progress updates to reduce render cost during high-speed transfer.
          if (now - lastProgressTime >= 150 || transferredBytes >= totalBytes) {
            const timeDiff = Math.max(0.01, (now - lastMeasureTime) / 1000);
            const bytesDiff = transferredBytes - lastMeasureBytes;
            currentSpeed = bytesDiff / timeDiff;
            lastMeasureTime = now;
            lastMeasureBytes = transferredBytes;
            lastProgressTime = now;

            const elapsedSec = (now - startTime) / 1000;
            const ack = this.outgoingTransferAcks.get(targetPeer.id);
            const displayedBytes = Math.min(totalBytes, Math.max(0, ack?.receivedBytes || 0));
            const remainingBytes = Math.max(0, totalBytes - displayedBytes);
            const avgSpeed = displayedBytes / Math.max(0.01, elapsedSec);
            const displaySpeed = ack?.currentSpeedBytes || (displayedBytes > 0 ? avgSpeed : 0);
            const eta = displaySpeed > 0 ? remainingBytes / displaySpeed : 0;

            onProgress({
              transferredBytes: displayedBytes,
              totalBytes,
              currentSpeedBytes: displaySpeed,
              peakSpeedBytes: Math.max(displaySpeed, avgSpeed),
              elapsedSeconds: Math.floor(elapsedSec),
              etaSeconds: Math.ceil(eta),
              currentFileIndex: fileIndex,
              status: 'transferring',
            });
          }
        }

        fileOffset = batchEnd;
      }

      // 3. Send File Complete
      const endPayload = {
        type: 'file-end',
        fileId: fileItem.id,
        fileName: file.name,
      };

      if (conn && conn.open) {
        this.sendPeerPacket(conn, endPayload);
      } else if (this.safeBroadcast) {
        this.safeBroadcast.postMessage({
          targetId: targetPeer.id,
          senderId: this.peerId,
          ...endPayload,
        });
      }
    }

    if (!this.isCancelled) {
      // Do not mark the sender complete just because data was queued locally.
      // Wait for the receiver's acknowledgement so both progress modals stay in sync.
      const waitStartedAt = performance.now();
      while (!this.isCancelled && performance.now() - waitStartedAt < 45000) {
        const ack = this.outgoingTransferAcks.get(targetPeer.id);
        const receivedBytes = Math.min(totalBytes, Math.max(0, ack?.receivedBytes || 0));

        onProgress({
          transferredBytes: receivedBytes,
          totalBytes,
          status: ack?.complete || receivedBytes >= totalBytes ? 'completed' : 'transferring',
          currentSpeedBytes: ack?.currentSpeedBytes || 0,
          etaSeconds: ack?.currentSpeedBytes ? Math.ceil(Math.max(0, totalBytes - receivedBytes) / ack.currentSpeedBytes) : 0,
        });

        if (ack?.complete || receivedBytes >= totalBytes) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      const ack = this.outgoingTransferAcks.get(targetPeer.id);
      const receivedBytes = Math.min(totalBytes, Math.max(0, ack?.receivedBytes || 0));
      onProgress({
        transferredBytes: receivedBytes,
        totalBytes,
        status: 'failed',
        error: 'Pengirim selesai mengantrekan data, tetapi penerima belum mengonfirmasi seluruh file. Coba dekatkan perangkat atau ulangi transfer.',
        currentSpeedBytes: 0,
        etaSeconds: 0,
      });
    }
    } finally {
      this.sendingFilesByPeer.delete(targetPeer.id);
    }
  }

  public cancelTransfer() {
    this.isCancelled = true;
    this.incomingTransfer = null;

    const payload = { type: 'transfer-cancel', timestamp: Date.now() };

    for (const conn of this.activeConnections.values()) {
      try {
        if (conn.open) this.sendPeerPacket(conn, payload);
      } catch (e) {}

      // If a lot of chunks are already queued, a cancel message may sit behind them.
      // Close the channel shortly after sending cancel so both devices stop immediately.
      setTimeout(() => {
        try {
          const rawDc = (conn as any)?.dataChannel as RTCDataChannel | undefined;
          if (rawDc && rawDc.readyState !== 'closed') rawDc.close();
        } catch (e) {}
        try {
          conn.close();
        } catch (e) {}
      }, 80);
    }

    if (this.safeBroadcast && !this.isDestroyed) {
      try {
        for (const peer of this.discoveredPeers.values()) {
          this.safeBroadcast.postMessage({
            targetId: peer.id,
            senderId: this.peerId,
            ...payload,
          });
        }
      } catch (e) {}
    }
  }

  public setRoomCode(newRoom: string) {
    if (this.currentPeer) {
      this.currentPeer.roomCode = newRoom;
    }
    this.discoveredPeers.clear();
    this.broadcastPeerList();
    this.initRoomSignaling();
  }

  public updateProfile(name: string, avatar: string) {
    if (this.currentPeer) {
      this.currentPeer.name = name;
      this.currentPeer.avatar = avatar;
    }
    this.publishRoomPresence(false);
  }

  // Decide whether a peer may be shown in the radar.
  //
  // The unique random room code is the primary pairing key: two devices only ever share
  // a room when the user paired them deliberately (QR scan / copied link). Being in the
  // SAME room is therefore strong proof the peer is intended — show it regardless of IP.
  //   -> This is what makes a QR-paired peer show up in the radar even when the two
  //      devices are on DIFFERENT networks (QR/PeerJS bridges across networks via the
  //      internet — that's a feature, not a bug).
  //
  // The public IP is only an OPTIONAL extra safety net for peers we have NOT been paired
  // with (i.e. a peer that somehow announced on our topic without sharing our room): if
  // we know both IPs and they differ, hide it.
  private isSameNetworkPeer(peer: Peer): boolean {
    // Our own stale previous session (same persistent deviceId) is never shown.
    if (this.deviceId && peer.deviceId === this.deviceId) return false;

    // Peers that share our unique room are the deliberate QR/link pairing target →
    // always visible, regardless of network (QR bridges across networks).
    if (peer.roomCode && this.currentPeer && peer.roomCode === this.currentPeer.roomCode) {
      return true;
    }

    // Auto-discovery (same network/hotspot, different room): only accept a peer we can
    // verify. Require a deviceId (new code) AND a matching public IP. Peers without a
    // deviceId are stale/legacy cached announces (e.g. from before this deviceId system,
    // or replayed by ntfy) — dropping them is exactly what stops a device's own previous
    // session from resurfacing in the radar after a refresh.
    if (peer.deviceId && this.localPublicIp && peer.ip) {
      return peer.ip === this.localPublicIp;
    }
    return false;
  }

  private broadcastPeerList() {
    const list = Array.from(this.discoveredPeers.values())
      .filter((p) => p.id !== this.peerId)
      // Show peers that share our room (QR/link-paired) or are on the same network;
      // hide only clearly different-network, non-paired peers.
      .filter((p) => this.isSameNetworkPeer(p));
    this.callbacks.onPeerList?.(list);
  }

  public refreshMeshDiscovery() {
    // "Pindai Ulang" is the ONLY manual discovery trigger. It performs a fresh sweep:
    // clear the previous list so stale/left devices (and our own old session, filtered
    // by deviceId) never resurface, then register/publish our presence and PULL the
    // currently-active peers from the room bus, the network bus, and the /api/peers
    // registry. Only now does the radar fill with the devices currently online.
    this.attemptedPeers.clear();
    this.discoveredPeers.clear();
    this.broadcastPeerList();

    // 1) Re-register / announce ourselves so the other side can find us.
    this.publishRoomPresence(false);
    this.publishApiPresence();

    // 2) Pull currently-active peers from the first-party registry. This is scoped to
    //    the same network (same public IP), which surfaces same-network/hotspot devices
    //    — and it also tells us our own public IP.
    this.syncServerApiDiscovery();

    // 3) One-shot pull from the room bus to also surface a QR/PIN-paired peer (which may
    //    be on a different network), since it announced on our shared room topic.
    const cleanRoom = (this.currentPeer?.roomCode || 'HOTSPOT1').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    this.pollNtfyOnce(`shareit-mesh-${cleanRoom}`);

    if (this.currentPeer) {
      for (const [_, conn] of this.activeConnections) {
        if (conn && conn.open) {
          this.sendPeerPacket(conn, {
            type: 'handshake',
            peer: this.currentPeer,
            isReply: true,
          });
        }
      }
    }

    if (this.safeBroadcast && this.currentPeer) {
      this.safeBroadcast.postMessage({
        type: 'peer-presence',
        roomCode: this.currentPeer.roomCode,
        peer: this.currentPeer,
        senderId: this.peerId,
      });
    }
  }

  /**
   * "Terima Perangkat" — the receiver actively PULLS the sender into the radar and
   * forces an outbound WebRTC connection, instead of waiting on the (unreliable, TTL /
   * last-message) discovery buses. This is what fixes the profile-disappearing-after-a-
   * rescan: when BOTH sides tap "Temukan Perangkat", the sender's announce gets
   * overwritten in ntfy (single-slot) and its /api/peers entry may expire, so the
   * sender drops off the radar. Here the receiver re-registers, refreshes the registry,
   * and opportunistically connects to the sender — the resulting open DataChannel lets
   * each side announce itself again so BOTH profiles reappear and the transfer flow can
   * continue.
   */
  public async acceptDevice(targetPeer: Peer) {
    if (this.isDestroyed || !this.currentPeer) return;

    // 1) Make ourselves findable again (so the sender can still reach us).
    this.publishRoomPresence(false);
    this.publishApiPresence();

    // 2) Refresh the registry to learn the sender's current (possibly changed) id.
    targetPeer = await this.refreshPeersFromRegistry(targetPeer);

    // 3) Force an active connection. This bypasses discovery entirely — even if the
    //    sender isn't in our radar list yet, connectToPeer(targetPeer.id) opens a direct
    //    channel, and on open both devices exchange handshakes that re-surface each other.
    let conn = this.getActiveConnection(targetPeer.id);
    for (let attempt = 0; attempt < 4 && !conn; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
      conn = (await this.connectToPeer(targetPeer.id)) || undefined;
      if (!conn) conn = this.getActiveConnection(targetPeer.id);
    }

    // 4) Once connected, immediately announce ourselves over the channel so the sender
    //    learns who we are (and our avatar) even if it never received our room announce.
    if (conn && conn.open && this.currentPeer) {
      this.sendPeerPacket(conn, {
        type: 'handshake',
        peer: this.currentPeer,
        isReply: true,
      });
      // Refresh the radar so the sender now appears on OUR side too.
      this.refreshPeerListFromRegistry();
    }
  }

  /** Pull the freshest copy of a peer's live id + ensure it's in our radar. */
  private async refreshPeersFromRegistry(targetPeer: Peer): Promise<Peer> {
    if (!this.currentPeer || !this.peerId) return targetPeer;
    try {
      const room = (this.currentPeer.roomCode || 'HOTSPOT-1').toUpperCase();
      const url = `/api/peers?roomCode=${encodeURIComponent(room)}&excludeId=${encodeURIComponent(this.peerId)}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      const apiPeers: Peer[] = Array.isArray(data?.peers) ? data.peers : [];
      for (const p of apiPeers) {
        if (!p || !p.id || p.id === this.peerId) continue;
        this.discoveredPeers.set(p.id, {
          ...p,
          name: normalizeAnimeDeviceName(p.name),
          wifiBand: '5 GHz',
          signalStrength: 5,
          distanceLevel: 1,
        });
      }
      const fresh =
        (targetPeer.deviceId && apiPeers.find((p) => p.deviceId === targetPeer.deviceId)) ||
        apiPeers.find((p) => p.id === targetPeer.id) ||
        apiPeers.find((p) => p.name === targetPeer.name && p.roomCode === room);
      const peer = fresh || targetPeer;
      // Keep the freshest id, fall back to the caller's id if the registry is empty.
      return { ...targetPeer, ...peer, id: peer.id || targetPeer.id };
    } catch (e) {
      return targetPeer;
    }
  }

  /** Re-derive the radar list from the current discoveredPeers registry. */
  private refreshPeerListFromRegistry() {
    this.broadcastPeerList();
    try {
      if (this.currentPeer && this.peerId) {
        this.publishRoomPresence(false);
        this.publishApiPresence();
      }
    } catch (e) {}
  }

  public destroy() {
    this.isDestroyed = true;
    this.cleanupRoomSignaling();
    if (this.broadcastInterval !== null) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    if (this.safeBroadcast) {
      this.safeBroadcast.close();
      this.safeBroadcast = null;
    }
    if (this.peerJS) {
      try {
        this.peerJS.destroy();
      } catch (e) {}
      this.peerJS = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}
