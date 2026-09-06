import React, { Suspense, useState, useEffect, useRef } from 'react';
import { Send, Download, HelpCircle } from 'lucide-react';
import { Header } from './components/Header';
import { ConnectDevicesPanel } from './components/ConnectDevicesPanel';
import { RadarVisual } from './components/RadarVisual';
import { FilePicker } from './components/FilePicker';
import { IncomingTransferDialog } from './components/IncomingTransferDialog';
import { AcceptDeviceDialog } from './components/AcceptDeviceDialog';
import {
  Peer,
  FileItem,
  ActiveTransferSession,
  HistoryRecord,
  IncomingRequest,
} from './types';
import {
  getRandomDeviceProfile,
  getAnimeNameByAvatar,
  normalizeAnimeDeviceName,
  detectDeviceType,
  generateId,
  generatePin,
  getStablePeerId,
  resetDeviceIdentity,
  formatBytes,
  detectFileCategory,
} from './utils/helpers';
import { ANIME_AVATAR_IDS } from './components/AnimeAvatar';
import { WebRTCManager } from './utils/webrtc';

// Is `avatar` a real, known anime profile id? (e.g. 'anime:nino', not undefined/'📱').
const REAL_AVATAR_IDS = new Set<string>(ANIME_AVATAR_IDS as readonly string[]);
const isRealAnimeAvatar = (avatar?: string) => !!avatar && REAL_AVATAR_IDS.has(avatar);

// Merge an incoming registry list with the current peers, keyed by id, so a device's REAL
// avatar & name are preserved whenever an incoming record is missing a value or carries a
// placeholder. This is what stops a profile from "swapping" to a different avatar (e.g.
// Nino -> Ichika) when the network re-broadcasts the peer list after a refresh/re-order.
const mergePeerList = (prev: Peer[], incoming: Peer[]): Peer[] => {
  const prevById = new Map(prev.map((p) => [p.id, p]));
  return incoming.map((peer) => {
    const normalized: Peer = { ...peer, name: normalizeAnimeDeviceName(peer.name) };
    const existing = prevById.get(peer.id);
    // Prefer the incoming avatar; fall back to a previously-known real avatar only when the
    // incoming one is missing or a non-anime placeholder.
    if (existing && !isRealAnimeAvatar(normalized.avatar)) {
      normalized.avatar = existing.avatar || normalized.avatar;
    }
    return normalized;
  });
};


const TransferProgressModal = React.lazy(() =>
  import('./components/TransferProgressModal').then((m) => ({ default: m.TransferProgressModal }))
);
const QrModal = React.lazy(() =>
  import('./components/QrModal').then((m) => ({ default: m.QrModal }))
);
const HotspotGuideModal = React.lazy(() =>
  import('./components/HotspotGuideModal').then((m) => ({ default: m.HotspotGuideModal }))
);
const TransferHistory = React.lazy(() =>
  import('./components/TransferHistory').then((m) => ({ default: m.TransferHistory }))
);
const DeviceSettingsModal = React.lazy(() =>
  import('./components/DeviceSettingsModal').then((m) => ({ default: m.DeviceSettingsModal }))
);
const ChangeRoomModal = React.lazy(() =>
  import('./components/ChangeRoomModal').then((m) => ({ default: m.ChangeRoomModal }))
);
const WelcomeModal = React.lazy(() =>
  import('./components/WelcomeModal').then((m) => ({ default: m.WelcomeModal }))
);


export default function App() {
  // Persistent room code for this device, kept in localStorage so it survives a refresh.
  // Only regenerated when browser storage is cleared. A fresh, unpredictable room means
  // devices from other users (who also defaulted to the old shared "HOTSPOT-1") can never
  // collide in the public discovery mesh. The room is only shared deliberately with the
  // receiving device via the QR code / copied link.
  const initialRoom = React.useMemo(() => {
    try {
      const saved = localStorage.getItem('shareit_roomcode');
      if (saved && /^[a-zA-Z0-9]{2,20}$/.test(saved)) return saved;
      const fresh = generatePin();
      localStorage.setItem('shareit_roomcode', fresh);
      return fresh;
    } catch {
      return generatePin();
    }
  }, []);

  // 1. Current Peer & Room state
  const [currentPeer, setCurrentPeer] = useState<Peer>(() => {
    const savedName = localStorage.getItem('shareit_name');
    const savedAvatar = localStorage.getItem('shareit_avatar');

    let name: string;
    let avatar: string;

    // Reuse the profile persisted in localStorage so it survives a refresh. A fresh random
    // anime avatar + name is only assigned the very first time (when nothing is stored yet).
    // The user only asked to reset identity when browser storage is cleared — so we do NOT
    // re-roll the profile on every launch (that's why the old "not locked → re-randomize"
    // logic is removed).
    if (savedAvatar?.startsWith('anime:')) {
      avatar = savedAvatar;
      name = normalizeAnimeDeviceName(savedName) || getAnimeNameByAvatar(avatar) || 'Ichika';
    } else {
      const profile = getRandomDeviceProfile();
      name = profile.name;
      avatar = profile.avatar;
      localStorage.setItem('shareit_name', name);
      localStorage.setItem('shareit_avatar', avatar);
    }

    const deviceType = detectDeviceType();

    return {
      // Persistent contactable PeerJS id (survives refresh; reset only on storage clear).
      id: getStablePeerId(),
      name,
      avatar,
      deviceType,
      roomCode: initialRoom,
      isSelf: true,
      wifiBand: '5 GHz',
      signalStrength: 5,
    };
  });

  const [roomCode, setRoomCode] = useState<string>(initialRoom);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'home' | 'send' | 'receive'>('home');

  // 2. Discovered Peers & Selection
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  // Peers whose device pairing has been confirmed (receiver accepted / sender got the
  // accepted response). Drives the clear "Terhubung" (connected) badge on the radar.
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([]);
  // Peers currently in the "Menghubungkan…" handshake (sender tapped & waiting for the
  // receiver to accept, or a reconnect is in progress). Drives the radar loading spinner.
  const [connectingPeerIds, setConnectingPeerIds] = useState<string[]>([]);
  // Transient connection toast ("Koneksi terputus", "Menghubungkan…", etc).
  const [connToast, setConnToast] = useState<{ text: string; type: 'info' | 'error' } | null>(null);

  // 3. Selected Files to Send
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);

  // 4. Transfer Sessions
  const [activeSession, setActiveSession] = useState<ActiveTransferSession | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  // "Terima Perangkat" confirmation (receiver side): holds the sender the user tapped
  // to actively connect. Confirm opens the WebRTC connection and resurfacing.
  const [pendingAcceptPeer, setPendingAcceptPeer] = useState<Peer | null>(null);

  // 5. History
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);

  // 6. Modals
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrModalMode, setQrModalMode] = useState<'send' | 'receive'>('receive');
  // Which QR tab to open first ('scan' for the Send button's camera scanner, 'qr' for Terima).
  const [qrModalInitialTab, setQrModalInitialTab] = useState<'qr' | 'scan' | 'pin'>('qr');
  const [isHotspotGuideOpen, setIsHotspotGuideOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangeRoomOpen, setIsChangeRoomOpen] = useState(false);
  const [autoDownloadNotice, setAutoDownloadNotice] = useState<string | null>(null);
  // First-open welcome popup. Shows once unless the user checks "jangan tampilkan lagi"
  // (persisted in localStorage). Separate from identity keys — this is just a UI preference.
  const [isWelcomeOpen, setIsWelcomeOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('shareit_welcome_dismissed') !== '1';
    } catch {
      return true;
    }
  });

  // 7. WebRTC Manager Ref & Dynamic State References (prevent stale closure)
  const rtcManagerRef = useRef<WebRTCManager | null>(null);
  const selectedPeerRef = useRef<Peer | null>(null);
  selectedPeerRef.current = selectedPeer;
  const selectedFilesRef = useRef<FileItem[]>([]);
  selectedFilesRef.current = selectedFiles;
  const activeSessionRef = useRef<ActiveTransferSession | null>(null);
  activeSessionRef.current = activeSession;
  const transferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peersRef = useRef<Peer[]>([]);
  peersRef.current = peers;
  const qrModalOpenRef = useRef(isQrModalOpen);
  qrModalOpenRef.current = isQrModalOpen;
  const qrModalModeRef = useRef(qrModalMode);
  qrModalModeRef.current = qrModalMode;
  const connToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Track which peer ids we've already started streaming to on an accepted file-response,
  // so a DELAYED duplicate "accept" (the receiver relays its answer over several channels)
  // can't kick off a second send once the first already finished. Cleared when the user
  // starts a fresh transfer to that peer (handleStartTransfer/handleRetryTransfer).
  const handledAcceptRef = useRef<Set<string>>(new Set());
  // Prevents a double-tap on "Kirim File" from firing sendFileRequest twice (which would
  // create two transfer attempts / risk a duplicate send). Held only while a transfer is
  // being initiated; released when the modal closes or the attempt resolves.
  const startingTransferRef = useRef<boolean>(false);
  // Sessions that already recorded their files into history (sent list), so a duplicated
  // 'completed' progress update can't add the same file twice.
  const historyRecordedSessionRef = useRef<Set<string>>(new Set());

  // Show a transient connection-status toast that auto-dismisses.
  const showConnToast = (text: string, type: 'info' | 'error' = 'info') => {
    setConnToast({ text, type });
    if (connToastTimeoutRef.current) clearTimeout(connToastTimeoutRef.current);
    connToastTimeoutRef.current = setTimeout(() => setConnToast(null), 6000);
  };

  // Mark a peer as "Menghubungkan…" and arm a timeout in case the receiver never answers.
  const markPeerConnecting = (peerId: string, name: string) => {
    setConnectingPeerIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));
    const existing = connectTimeoutRef.current.get(peerId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setConnectingPeerIds((prev) => prev.filter((id) => id !== peerId));
      connectTimeoutRef.current.delete(peerId);
      showConnToast(`Koneksi ke ${name} tidak dijawab. Cek perangkat penerima.`, 'error');
    }, 25000);
    connectTimeoutRef.current.set(peerId, t);
  };

  // Resolve a peer's connecting state (accepted / rejected / dropped).
  const resolvePeerConnecting = (peerId: string) => {
    const t = connectTimeoutRef.current.get(peerId);
    if (t) clearTimeout(t);
    connectTimeoutRef.current.delete(peerId);
    setConnectingPeerIds((prev) => prev.filter((id) => id !== peerId));
  };

  const triggerAutoDownload = (blobUrl: string, fileName: string) => {
    try {
      const safeName = fileName || 'file-transfer';
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = safeName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setAutoDownloadNotice(`Download otomatis dimulai: ${safeName}`);
      window.setTimeout(() => setAutoDownloadNotice(null), 5000);
    } catch (err) {
      setAutoDownloadNotice('Download otomatis gagal. Klik tombol Unduh Berkas di layar selesai.');
      window.setTimeout(() => setAutoDownloadNotice(null), 7000);
    }
  };

  // Initialize WebRTC and Signaling
  useEffect(() => {
    const rtc = new WebRTCManager({
      onConnectionStatus: (online, mode) => {
        setIsOnline(online);
      },
      onAssignedPeerId: (realId) => {
        setCurrentPeer((prev) => ({ ...prev, id: realId }));
      },
      onPeerList: (newPeers) => {
        // MERGE (not replace) so a device's real avatar & name are never lost/downgraded
        // when the registry re-broadcasts a list (this is what made a profile "swap" to a
        // different avatar — e.g. Nino -> Ichika — after a network refresh/re-order).
        setPeers((prev) => mergePeerList(prev, newPeers));
      },
      // A live DeviceChannel dropped: clear the "Terhubung" state and notify the user.
      onPeerDisconnected: (peerId) => {
        setConnectedPeerIds((prev) => prev.filter((id) => id !== peerId));
        resolvePeerConnecting(peerId);
        const peer = peersRef.current.find((p) => p.id === peerId);
        const name = peer?.name || 'perangkat';
        showConnToast(`⚠️ Koneksi ke ${name} terputus.`, 'error');
      },
      // A DataChannel to a peer opened (QR/kode/reconnect): mark it "Terhubung".
      onPeerConnected: (peerId) => {
        if (peerId === currentPeer.id) return;
        setConnectedPeerIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));
        resolvePeerConnecting(peerId);
        // Auto-close: once a QR has been successfully scanned, the data channel opens on the
        // RECEIVING device too, so a real connection is established → close the receive QR modal
        // automatically (no need for the user to tap the close button).
        if (qrModalOpenRef.current) {
          setIsQrModalOpen(false);
        }
      },
      onFileRequest: (request) => {
        setIncomingRequest({ ...request, senderName: normalizeAnimeDeviceName(request.senderName) });
      },
      onFileResponse: (response) => {
        // Only respond to an accept that belongs to the CURRENT waiting send session. A
        // late/stale accept (e.g. a relayed copy that arrives after the transfer already
        // finished) must NOT start a new file stream.
        const activeSess = activeSessionRef.current;
        if (
          !activeSess ||
          activeSess.peerId !== response.senderId ||
          (activeSess.status !== 'waiting' && activeSess.status !== 'transferring')
        ) {
          return;
        }

        if (transferTimeoutRef.current) {
          clearTimeout(transferTimeoutRef.current);
          transferTimeoutRef.current = null;
        }
        if (response.accepted) {
          // Ignore a duplicate accept for a peer we're already / have already sent to. The
          // receiver relays its answer over several channels, so it can arrive more than once.
          if (handledAcceptRef.current.has(response.senderId)) return;
          handledAcceptRef.current.add(response.senderId);

          // Receiver accepted the request! Begin high-speed streaming
          setActiveSession((prev) => (prev ? { ...prev, status: 'transferring' } : null));

          const targetPeer = selectedPeerRef.current;
          const filesToSend =
            selectedFilesRef.current && selectedFilesRef.current.length > 0
              ? selectedFilesRef.current
              : activeSessionRef.current?.files || [];

          if (targetPeer && filesToSend.length > 0) {
            const sessionId = activeSessionRef.current?.sessionId || ('sess-' + generateId());
            rtcManagerRef.current?.sendFiles(targetPeer, filesToSend, (progress) => {
              setActiveSession((prev) => (prev ? { ...prev, ...progress } : null));

              if (progress.status === 'completed') {
                // Record the files into history exactly once per session, so a duplicated
                // 'completed' progress update can't add the same file twice.
                if (historyRecordedSessionRef.current.has(sessionId)) return;
                historyRecordedSessionRef.current.add(sessionId);

                const newRecords: HistoryRecord[] = filesToSend.map((fileItem) => ({
                  id: generateId(),
                  fileName: fileItem.name,
                  fileSize: fileItem.size,
                  fileType: fileItem.type,
                  category: fileItem.category,
                  direction: 'sent',
                  peerName: targetPeer.name,
                  peerAvatar: targetPeer.avatar,
                  timestamp: Date.now(),
                  blobUrl: fileItem.previewUrl,
                }));
                setHistoryRecords((prev) => [...newRecords, ...prev]);
              }
            });
          }
        } else {
          setActiveSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'rejected',
                  error: response.reason || 'Ditolak oleh penerima berkas',
                }
              : null
          );
        }
      },
      // The RECEIVER gets the pairing prompt (Bluetooth-style accept).
      onConnectRequest: (req) => {
        const peer: Peer = {
          id: req.senderId,
          name: req.senderName,
          avatar: req.senderAvatar,
          deviceType: 'mobile',
          roomCode,
          isSelf: false,
        };
        // Receiver side: the sender card is "Menghubungkan…" while we decide to accept.
        markPeerConnecting(peer.id, peer.name);
        setPendingAcceptPeer(peer);
      },
      // Back on the SENDER: the receiver accepted/rejected the connection request.
      onConnectResponse: (res) => {
        // The receiver answered — our "Menghubungkan…" spinner can now stop.
        resolvePeerConnecting(res.senderId);
        if (res.accepted) {
          // Receiver confirmed; re-resolve the sender so it stays visible & connected.
          const peer = selectedPeerRef.current;
          if (peer) {
            rtcManagerRef.current?.acceptDevice(peer);
          }
          // The receiver accepted → show the clear "Terhubung" state on their radar card.
          setConnectedPeerIds((prev) => (prev.includes(res.senderId) ? prev : [...prev, res.senderId]));
          showConnToast('Koneksi berhasil. Perangkat terhubung.', 'info');
        } else {
          // Rejected → unmark connected (in case the DataChannel briefly showed "Terhubung").
          setConnectedPeerIds((prev) => prev.filter((id) => id !== res.senderId));
          showConnToast(`Perangkat menolak permintaan koneksi.`, 'error');
        }
      },
      onProgress: (sessionUpdate) => {
        if (sessionUpdate.status === 'transferring' || sessionUpdate.status === 'completed' || (sessionUpdate.transferredBytes || 0) > 0) {
          if (transferTimeoutRef.current) {
            clearTimeout(transferTimeoutRef.current);
            transferTimeoutRef.current = null;
          }
        }
        setActiveSession((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            ...sessionUpdate,
          } as ActiveTransferSession;
        });
      },
      onFileComplete: (completed) => {
        setActiveSession((prev) => {
          if (prev) {
            return {
              ...prev,
              status: 'completed',
              completedBlobUrl: completed.blobUrl,
              completedFileName: completed.name,
              transferredBytes: completed.size,
              totalBytes: completed.size,
              currentSpeedBytes: 0,
              etaSeconds: 0,
            };
          }
          return {
            sessionId: generateId(),
            peerId: 'peer',
            peerName: completed.peerName || 'Perangkat Pengirim',
            peerAvatar: completed.peerAvatar || 'anime:ichika',
            direction: 'receiving',
            status: 'completed',
            files: [
              {
                id: generateId(),
                name: completed.name,
                size: completed.size,
                type: completed.type,
                category: detectFileCategory(completed.name, completed.type),
              },
            ],
            currentFileIndex: 0,
            transferredBytes: completed.size,
            totalBytes: completed.size,
            currentSpeedBytes: 0,
            peakSpeedBytes: 68 * 1024 * 1024,
            elapsedSeconds: 1,
            etaSeconds: 0,
            connectionType: 'WebRTC Direct P2P (Wi-Fi Local)',
            completedBlobUrl: completed.blobUrl,
            completedFileName: completed.name,
          };
        });

        // Add to history vault
        const record: HistoryRecord = {
          id: generateId(),
          fileName: completed.name,
          fileSize: completed.size,
          fileType: completed.type,
          category: detectFileCategory(completed.name, completed.type),
          direction: 'received',
          peerName: completed.peerName || 'Perangkat Pengirim',
          peerAvatar: completed.peerAvatar || 'anime:ichika',
          timestamp: Date.now(),
          blobUrl: completed.blobUrl,
          blob: completed.blob,
        };

        setHistoryRecords((prev) => [record, ...prev]);

        // Receiver experience: start browser download automatically when transfer is complete.
        // The manual button remains available as a fallback for browsers that restrict auto-download.
        triggerAutoDownload(completed.blobUrl, completed.name);
      },
    });

    rtc.init(currentPeer);
    rtcManagerRef.current = rtc;

    // Apply deep-link room & target peer from the URL (?room=&peer=) so the
    // WebRTC manager joins the correct room even on the very first page load
    // (e.g. opening a shared link or the QR code from a receiving device).
    // Without this, the manager stays on the default room (HOTSPOT-1) while the
    // UI shows the deep-linked room, which breaks peer discovery after a QR scan.
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const targetPeerParam = params.get('peer') || params.get('target');
    if (roomParam) {
      setRoomCode(roomParam);
      setCurrentPeer((prev) => ({ ...prev, roomCode: roomParam }));
      rtc.setRoomCode(roomParam);
    }
    if (targetPeerParam) {
      // Use the SAME canonical join-and-connect path as a manual QR scan
      // (handleJoinRoom) instead of re-implementing it here. This de-duplicates the
      // "receiver placeholder + connect" logic so a shared link and a QR scan always
      // build the receiver card identically — fixing the inconsistent/stale receiver
      // profile that reappeared after a refresh (e.g. showing placeholder Ichika).
      setActiveTab('send');
      setTimeout(() => {
        handleJoinRoom(roomParam || currentPeer.roomCode, targetPeerParam);
      }, 700);
    }

    return () => {
      if (transferTimeoutRef.current) {
        clearTimeout(transferTimeoutRef.current);
        transferTimeoutRef.current = null;
      }
      rtc.destroy();
    };
  }, []);

  // Update room when roomCode changes or peer target is provided
  const handleJoinRoom = (newRoom: string, targetPeerId?: string) => {
    setRoomCode(newRoom);
    setCurrentPeer((prev) => ({ ...prev, roomCode: newRoom }));
    try {
      localStorage.setItem('shareit_roomcode', newRoom);
    } catch {}
    rtcManagerRef.current?.setRoomCode(newRoom);
    const url = targetPeerId ? `?room=${newRoom}&peer=${targetPeerId}` : `?room=${newRoom}`;
    window.history.replaceState({}, '', url);

    if (targetPeerId) {
      // Surface the QR/code-paired receiver as a selectable device card, and select it.
      // IMPORTANT: use a NEUTRAL placeholder (empty avatar → the 🌸 glyph). We do NOT
      // hardcode a specific anime profile (e.g. 'anime:ichika') here, because the
      // receiver's real profile only becomes known once the P2P handshake arrives.
      // Hardcoding an anime caused the "Penerima aktif" / duel to show a wrong profile
      // (Ichika) after a refresh. Once the handshake lands, the selectedPeer sync + the
      // duel's resolveLivePeer replace this placeholder with the receiver's real profile.
      const pairedPeer: Peer = {
        id: targetPeerId,
        name: `Perangkat ${targetPeerId.slice(-5).toUpperCase()}`,
        avatar: '',
        deviceType: 'mobile',
        roomCode: newRoom,
        wifiBand: '5 GHz',
        signalStrength: 5,
        distanceLevel: 1,
      };
      setPeers((prev) =>
        prev.some((p) => p.id === targetPeerId) ? prev : [pairedPeer, ...prev]
      );
      setSelectedPeer((prev) => (prev?.id === targetPeerId ? prev : pairedPeer));
      rtcManagerRef.current?.connectToPeer(targetPeerId);
    }
  };

  // Keep the selected/active peer in sync with the freshest discovered identity.
  // After a QR scan, handleJoinRoom creates a placeholder receiver card (avatar 'anime:ichika',
  // name 'Perangkat ...') that we can't fully populate yet because the receiver's real profile
  // only arrives once the handshake/discovery broadcasts it. Without this sync, the "Aktif"/
  // connected receiver keeps showing the stale placeholder (Ichika) even though the real
  // avatar/name is now in the peers list. Adopt the real data whenever it appears.
  useEffect(() => {
    setSelectedPeer((prev) => {
      if (!prev) return prev;
      const fresh = peers.find((p) => p.id === prev.id);
      if (!fresh) return prev;
      // Already up to date (real name & avatar) — avoid an unnecessary re-render.
      if (fresh.name === prev.name && fresh.avatar === prev.avatar) return prev;
      return { ...prev, ...fresh, isSelf: prev.isSelf };
    });
  }, [peers]);

  // Resolve a peer against the latest discovered list. The transfer session (and its anime
  // "duel") snapshots the receiver's avatar/name at the moment it starts, so if the transfer
  // was launched right after a QR scan the receiver can still be the placeholder Ichika even
  // after the real profile arrives. Looking the peer up by id keeps the transfer UI always
  // showing the receiver's real profile.
  const resolveLivePeer = (peer: Peer | null): Peer | null => {
    if (!peer) return peer;
    const fresh = peers.find((p) => p.id === peer.id);
    return fresh ? { ...peer, ...fresh } : peer;
  };

  // Update Profile
  const handleSaveProfile = (name: string, avatar: string) => {
    const shortName = normalizeAnimeDeviceName(name);
    setCurrentPeer((prev) => ({ ...prev, name: shortName, avatar }));
    // The user actively chose this profile, so keep it (no longer random each load).
    localStorage.setItem('shareit_name', shortName);
    localStorage.setItem('shareit_avatar', avatar);
    localStorage.setItem('shareit_profile_locked', '1');
    rtcManagerRef.current?.updateProfile(name, avatar);
  };

  // Add Local Loopback Peer (Diagnostic test on single device)
  const handleLoopbackTest = () => {
    const loopbackProfile = getRandomDeviceProfile();
    const loopbackPeer: Peer = {
      id: `loopback-${Date.now()}`,
      name: loopbackProfile.name,
      avatar: loopbackProfile.avatar,
      deviceType: 'mobile',
      roomCode: roomCode,
      wifiBand: '5 GHz',
      signalStrength: 5,
      distanceLevel: 1,
    };
    setPeers((prev) => [loopbackPeer, ...prev.filter((p) => !p.id.startsWith('loopback-'))]);
    setSelectedPeer(loopbackPeer);
  };

  // File handling
  const handleAddFiles = (newFiles: FileItem[]) => {
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (fileId: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
  };

  // Start Real Transfer Execution
  const handleStartTransfer = async () => {
    if (!selectedPeer || selectedFiles.length === 0) return;

    // Check if loopback or virtual diagnostic test
    if (selectedPeer.id.startsWith('loopback-') || selectedPeer.id.startsWith('virtual-')) {
      simulateVirtualTransfer(selectedPeer, selectedFiles);
      return;
    }

    // Guard against a double-tap on "Kirim File": while a request is being sent, ignore
    // repeat calls so we never fire sendFileRequest twice for the same selection.
    if (startingTransferRef.current) return;
    startingTransferRef.current = true;
    try {
      // A fresh send to this peer is legitimate — allow a new accept to trigger streaming.
      handledAcceptRef.current.delete(selectedPeer.id);

      const totalBytes = selectedFiles.reduce((sum, f) => sum + f.size, 0);

      const session: ActiveTransferSession = {
        sessionId: generateId(),
        peerId: selectedPeer.id,
        peerName: selectedPeer.name,
        peerAvatar: selectedPeer.avatar,
        direction: 'sending',
        status: 'waiting', // Immediate loading & connecting state
        files: selectedFiles,
        currentFileIndex: 0,
        transferredBytes: 0,
        totalBytes,
        currentSpeedBytes: 0,
        peakSpeedBytes: 0,
        elapsedSeconds: 0,
        etaSeconds: 0,
        connectionType: 'WebRTC Direct P2P (Wi-Fi Local)',
      };

      // Set the ref immediately so an accept that arrives in the same tick is still gated
      // to THIS session (the ref is otherwise only updated on the next render).
      activeSessionRef.current = session;
      setActiveSession(session);

      if (transferTimeoutRef.current) {
        clearTimeout(transferTimeoutRef.current);
      }
      transferTimeoutRef.current = setTimeout(() => {
        setActiveSession((prev) =>
          prev && prev.sessionId === session.sessionId && prev.status === 'waiting'
            ? {
                ...prev,
                status: 'failed',
                error: 'Penerima tidak merespons. Pastikan kedua perangkat berada di room yang sama, layar penerima tetap terbuka, lalu coba pindai QR ulang.',
              }
            : prev
        );
      }, 20000);

      // 1. Notify receiver and wait for acceptance
      await rtcManagerRef.current?.sendFileRequest(selectedPeer, selectedFiles);
    } finally {
      // Release the guard shortly after so a deliberate re-send can run later if needed.
      setTimeout(() => { startingTransferRef.current = false; }, 1500);
    }
  };

  // "Hubungkan Ulang": re-trigger the file notification to the receiver after it didn't
  // show up. Forces a fresh connection + re-sends the file-request.
  const handleRetryTransfer = () => {
    if (!selectedPeer || selectedFiles.length === 0) return;
    if (selectedPeer.id.startsWith('loopback-') || selectedPeer.id.startsWith('virtual-')) return;
    // Guard against a double-tap on "Hubungkan Ulang" firing two retry notifications.
    if (startingTransferRef.current) return;
    startingTransferRef.current = true;
    setTimeout(() => { startingTransferRef.current = false; }, 1500);

    // A retry is a fresh attempt to notify the receiver — let a new accept start streaming.
    handledAcceptRef.current.delete(selectedPeer.id);

    // Re-arm the modal in the "connecting" state.
    setActiveSession((prev) => (prev ? { ...prev, status: 'waiting', error: undefined } : prev));

    if (transferTimeoutRef.current) clearTimeout(transferTimeoutRef.current);
    transferTimeoutRef.current = setTimeout(() => {
      setActiveSession((prev) =>
        prev && prev.status === 'waiting'
          ? {
              ...prev,
              status: 'failed',
              error: 'Penerima tidak merespons. Pastikan kedua perangkat berada di room yang sama, layar penerima tetap terbuka, lalu coba Hubungkan Ulang.',
            }
          : prev
      );
    }, 20000);

    // Re-trigger the notification on the receiver.
    rtcManagerRef.current?.retrySendFileRequest(selectedPeer, selectedFiles);
  };

  // Virtual demo transfer simulator (renders exact 5GHz Wi-Fi transmission with speedometer)
  const simulateVirtualTransfer = (targetPeer: Peer, files: FileItem[]) => {
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    let transferred = 0;
    const startTime = Date.now();

    // Start with brief waiting state to show connection handshake
    const initialSession: ActiveTransferSession = {
      sessionId: generateId(),
      peerId: targetPeer.id,
      peerName: targetPeer.name,
      peerAvatar: targetPeer.avatar,
      direction: 'sending',
      status: 'waiting',
      files,
      currentFileIndex: 0,
      transferredBytes: 0,
      totalBytes,
      currentSpeedBytes: 0,
      peakSpeedBytes: 0,
      elapsedSeconds: 0,
      etaSeconds: 0,
      connectionType: 'WebRTC Direct P2P (Wi-Fi Local)',
    };

    setActiveSession(initialSession);

    setTimeout(() => {
      // Transition to transferring state
      setActiveSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'transferring',
              currentSpeedBytes: 48 * 1024 * 1024,
              peakSpeedBytes: 65 * 1024 * 1024,
            }
          : null
      );

      const interval = setInterval(() => {
        // Transfer ~8-12MB per tick (200ms) = ~45-60MB/s Wi-Fi speed!
        const chunk = Math.min(
          totalBytes - transferred,
          Math.floor(7 * 1024 * 1024 + Math.random() * 5 * 1024 * 1024)
        );
        transferred += chunk;

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = chunk / 0.2;
        const remaining = Math.max(0, totalBytes - transferred);
        const eta = speed > 0 ? remaining / speed : 0;

        const currentFileIdx = Math.min(
          files.length - 1,
          Math.floor((transferred / Math.max(1, totalBytes)) * files.length)
        );

        if (transferred >= totalBytes) {
          clearInterval(interval);
          setActiveSession((prev) =>
            prev
              ? {
                  ...prev,
                  transferredBytes: totalBytes,
                  status: 'completed',
                  currentSpeedBytes: 0,
                  etaSeconds: 0,
                }
              : null
          );

          const newRecords: HistoryRecord[] = files.map((fileItem) => ({
            id: generateId(),
            fileName: fileItem.name,
            fileSize: fileItem.size,
            fileType: fileItem.type,
            category: fileItem.category,
            direction: 'sent',
            peerName: targetPeer.name,
            peerAvatar: targetPeer.avatar,
            timestamp: Date.now(),
            blobUrl: fileItem.previewUrl,
          }));
          setHistoryRecords((prev) => [...newRecords, ...prev]);
        } else {
          setActiveSession((prev) =>
            prev
              ? {
                  ...prev,
                  transferredBytes: transferred,
                  currentSpeedBytes: speed,
                  currentFileIndex: currentFileIdx,
                  elapsedSeconds: Math.floor(elapsed),
                  etaSeconds: Math.ceil(eta),
                }
              : null
          );
        }
      }, 200);
    }, 600);
  };

  // Instant Quick Demo Test Trigger
  const handleTriggerQuickDemo = () => {
    const demoFiles: FileItem[] = [
      {
        id: generateId(),
        name: 'Video_Liburan_4K_60FPS.mp4',
        size: 64 * 1024 * 1024,
        type: 'video/mp4',
        category: 'video',
        status: 'pending',
      },
      {
        id: generateId(),
        name: 'Berkas_Dokumen_Proyek.pdf',
        size: 18 * 1024 * 1024,
        type: 'application/pdf',
        category: 'document',
        status: 'pending',
      },
    ];

    setSelectedFiles(demoFiles);

    const demoProfile = getRandomDeviceProfile();
    const demoPeer: Peer = {
      id: `virtual-${generateId()}`,
      name: demoProfile.name,
      avatar: demoProfile.avatar,
      deviceType: 'mobile',
      roomCode,
      wifiBand: '5 GHz',
      signalStrength: 5,
      distanceLevel: 1,
    };

    setPeers((prev) => [demoPeer, ...prev.filter((p) => !p.id.startsWith('virtual-'))]);
    setSelectedPeer(demoPeer);

    simulateVirtualTransfer(demoPeer, demoFiles);
  };

  // Incoming Request responses
  const handleAcceptIncoming = () => {
    try {
      if (!incomingRequest) return;
      const req = incomingRequest;

      try {
        rtcManagerRef.current?.respondFileRequest(req.senderId, true);
      } catch (err) {
        console.warn('Could not send respondFileRequest:', err);
      }

      const safeFiles: FileItem[] = Array.isArray(req.files) && req.files.length > 0
        ? req.files.map((f) => ({
            id: f.id || generateId(),
            name: f.name || 'File Masuk',
            size: Number(f.size) || 0,
            type: f.type || 'application/octet-stream',
            category: f.category || detectFileCategory(f.name || '', f.type),
            status: 'transferring' as const,
          }))
        : [
            {
              id: generateId(),
              name: 'Berkas Masuk',
              size: Number(req.totalSize) || 0,
              type: 'application/octet-stream',
              category: 'other',
              status: 'transferring' as const,
            },
          ];

      const safeTotal = Math.max(1, Number(req.totalSize) || safeFiles.reduce((acc, f) => acc + f.size, 0) || 1);

      const session: ActiveTransferSession = {
        sessionId: generateId(),
        peerId: req.senderId,
        peerName: req.senderName || 'Perangkat Pengirim',
        peerAvatar: req.senderAvatar || 'anime:ichika',
        direction: 'receiving',
        status: 'waiting',
        files: safeFiles,
        currentFileIndex: 0,
        transferredBytes: 0,
        totalBytes: safeTotal,
        currentSpeedBytes: 0,
        peakSpeedBytes: 0,
        elapsedSeconds: 0,
        etaSeconds: 0,
        connectionType: 'WebRTC Direct P2P (Wi-Fi Local)',
      };

      setActiveSession(session);
      setIncomingRequest(null);

      if (transferTimeoutRef.current) {
        clearTimeout(transferTimeoutRef.current);
      }
      transferTimeoutRef.current = setTimeout(() => {
        setActiveSession((prev) =>
          prev && prev.sessionId === session.sessionId && prev.status === 'waiting'
            ? {
                ...prev,
                status: 'failed',
                error: 'Pengirim belum mengirim data. Pastikan koneksi P2P tersambung, lalu minta pengirim mencoba ulang.',
              }
            : prev
        );
      }, 20000);
    } catch (e) {
      console.error('Error in handleAcceptIncoming:', e);
      setIncomingRequest(null);
    }
  };

  const handleRejectIncoming = () => {
    try {
      if (!incomingRequest) return;
      rtcManagerRef.current?.respondFileRequest(incomingRequest.senderId, false, 'Ditolak oleh pengguna');
      setIncomingRequest(null);
    } catch (e) {
      console.warn('Error in handleRejectIncoming:', e);
      setIncomingRequest(null);
    }
  };

  // Receiver confirms "Terima Perangkat": actively connect to the sender so the sender
  // reappears in the radar and the receiver can accept the incoming transfer.
  const handleConfirmAcceptDevice = () => {
    if (!pendingAcceptPeer) return;
    const peer = pendingAcceptPeer;
    setPendingAcceptPeer(null);
    setSelectedPeer(peer);
    // Stop the "Menghubungkan…" spinner; the sender card is now connected.
    resolvePeerConnecting(peer.id);
    // Mark as connected so the radar shows the clear "Terhubung" state on the sender card.
    setConnectedPeerIds((prev) => (prev.includes(peer.id) ? prev : [...prev, peer.id]));
    showConnToast('Koneksi berhasil. Perangkat terhubung.', 'info');
    // Receiver accepted → confirm the pairing and actively connect back to the sender,
    // so BOTH devices appear in each other's radar.
    rtcManagerRef.current?.respondToConnect(peer.id, peer, true);
  };

  const handleRejectAcceptDevice = () => {
    const peer = pendingAcceptPeer;
    setPendingAcceptPeer(null);
    if (peer) {
      // Receiver declined the pairing.
      resolvePeerConnecting(peer.id);
      showConnToast('Perangkat menolak permintaan koneksi.', 'error');
      rtcManagerRef.current?.respondToConnect(peer.id, peer, false);
    }
  };

  // Download record from history safely
  const handleDownloadRecord = (record: HistoryRecord) => {
    if (!record.blobUrl) return;
    try {
      const a = document.createElement('a');
      a.href = record.blobUrl;
      a.download = record.fileName || 'file_download';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch (e) {}
      }, 500);
    } catch (err) {
      console.warn('Error in handleDownloadRecord:', err);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#fbf4f8] text-slate-900 flex flex-col font-sans selection:bg-pink-500 selection:text-white">
      {/* 1. Header */}
      <Header
        currentPeer={currentPeer}
        roomCode={roomCode}
        isOnline={isOnline}
        historyCount={historyRecords.length}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenHotspotGuide={() => setIsHotspotGuideOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenChangeRoom={() => setIsChangeRoomOpen(true)}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-7 flex flex-col gap-4 sm:gap-6">
        
        {/* Clean Main Action Panel */}
        <section className="rounded-[2rem] border border-pink-100 bg-white p-3 shadow-xl shadow-pink-100/50 sm:p-5">
          <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-500 sm:text-xs">Share Rich P2P</p>
              <h1 className="mt-0.5 text-lg font-black tracking-tight text-slate-900 sm:mt-1 sm:text-3xl">
                Kirim file langsung antar perangkat
              </h1>
              <p className="mt-1.5 max-w-2xl text-[11px] leading-snug text-slate-500 sm:mt-2 sm:text-sm sm:leading-relaxed">
                Buka website ini di dua perangkat, lalu sambungkan lewat QR atau kode PIN. Pilih file, kirim ke perangkat tujuan, dan file diterima otomatis masuk ke Download.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:min-w-[360px]">
              <button
                id="send-action-card"
                type="button"
                onClick={() => {
                  setActiveTab('send');
                  // Sender flow starts by scanning the receiver's QR.
                  setQrModalMode('send');
                  setQrModalInitialTab('scan');
                  setIsQrModalOpen(true);
                }}
                className={`rounded-2xl border p-2.5 text-left transition active:scale-[0.98] sm:p-4 ${
                  activeTab === 'send'
                    ? 'border-pink-400 bg-pink-50 shadow-lg shadow-pink-200/60'
                    : 'border-slate-200 bg-slate-50/50 hover:border-pink-300 hover:bg-pink-50'
                }`}
              >
                <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-pink-500 text-white shadow-lg shadow-pink-200/60 sm:mb-3 sm:h-10 sm:w-10">
                  <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <h2 className="text-sm font-black text-slate-900">Kirim</h2>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500 sm:text-[11px] sm:leading-relaxed">Pilih file dan perangkat tujuan.</p>
              </button>

              <button
                id="receive-action-card"
                type="button"
                onClick={() => {
                  setActiveTab('receive');
                  setQrModalInitialTab('qr');
                  setIsQrModalOpen(true);
                  setQrModalMode('receive');
                }}
                className={`rounded-2xl border p-2.5 text-left transition active:scale-[0.98] sm:p-4 ${
                  activeTab === 'receive'
                    ? 'border-cyan-300 bg-cyan-50 shadow-lg shadow-cyan-100'
                    : 'border-slate-200 bg-slate-50/50 hover:border-cyan-300 hover:bg-cyan-50'
                }`}
              >
                <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-lg shadow-cyan-100 sm:mb-3 sm:h-10 sm:w-10">
                  <Download className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <h2 className="text-sm font-black text-slate-900">Terima</h2>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500 sm:text-[11px] sm:leading-relaxed">Tampilkan QR dan tunggu file masuk.</p>
              </button>
            </div>
          </div>
        </section>

        {/* Dynamic Workspace: File Picker + Local Radar Scanner */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: decorative radar + connect via QR / code & connected devices */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <RadarVisual
              currentPeer={currentPeer}
              peers={peers}
              selectedPeer={selectedPeer}
              connectedPeerIds={connectedPeerIds}
              connectingPeerIds={connectingPeerIds}
            />
            <ConnectDevicesPanel
              peers={peers}
              selectedPeer={selectedPeer}
              connectedPeerIds={connectedPeerIds}
              connectingPeerIds={connectingPeerIds}
              onSelectPeer={(p) => {
                setSelectedPeer(p);
                // Loopback/virtual are single-device diagnostics — don't trigger pairing.
                if (p.id.startsWith('loopback-') || p.id.startsWith('virtual-')) return;
                // Bluetooth-style: tapping a connected/paired device that isn't yet
                // connected immediately fires the "Terima Perangkat" prompt on the RECEIVER.
                if (!connectedPeerIds.includes(p.id)) {
                  markPeerConnecting(p.id, p.name);
                  showConnToast(`Menghubungkan ke ${p.name}…`, 'info');
                }
                rtcManagerRef.current?.sendConnectRequest(p);
              }}
            />

          </div>

          {/* Right Column: File Explorer & Category Upload */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <FilePicker
              selectedPeer={selectedPeer}
              selectedFiles={selectedFiles}
              onAddFiles={handleAddFiles}
              onRemoveFile={handleRemoveFile}
              onClearFiles={handleClearFiles}
              onStartTransfer={handleStartTransfer}
              onOpenRadar={() => {
                const el = document.getElementById('radar-scanner-container');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            />

          </div>
        </section>
      </main>

      {/* Clear success notice for automatic downloads */}
          {autoDownloadNotice && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-xs font-bold text-emerald-700 shadow-2xl shadow-emerald-200/40 backdrop-blur-md">
          {autoDownloadNotice}
        </div>
      )}

      {/* Modals & Dialogs */}

      <Suspense fallback={null}>
        {/* 0. First-open Welcome popup */}
        {isWelcomeOpen && (
          <WelcomeModal
            isOpen={isWelcomeOpen}
            onClose={(neverShowAgain) => {
              if (neverShowAgain) {
                try {
                  localStorage.setItem('shareit_welcome_dismissed', '1');
                } catch {}
              }
              setIsWelcomeOpen(false);
            }}
          />
        )}

        {/* 1. Live Transfer Progress Modal (Speedometer + Wave + Stats) */}
        {activeSession && (() => {
          const selfPeer: Peer = { id: 'self', name: currentPeer.name, avatar: currentPeer.avatar, deviceType: currentPeer.deviceType, roomCode: currentPeer.roomCode, isSelf: true };
          const remotePeer: Peer = { id: activeSession.peerId, name: activeSession.peerName, avatar: activeSession.peerAvatar, deviceType: 'mobile', roomCode: roomCode };
          // Resolve the remote side against the live peers list so the anime duel never
          // shows a stale placeholder (e.g. Ichika) once the real profile is known.
          const activeSender = activeSession.direction === 'sending' ? selfPeer : resolveLivePeer(remotePeer) || remotePeer;
          const activeReceiver = activeSession.direction === 'sending' ? resolveLivePeer(remotePeer) || remotePeer : selfPeer;
          return (
          <TransferProgressModal
            session={activeSession}
            sender={activeSender}
            receiver={activeReceiver}
            onCancel={() => {
              rtcManagerRef.current?.cancelTransfer();
              setActiveSession((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
            }}
            onRetry={() => handleRetryTransfer()}
            onClose={() => setActiveSession(null)}
            onOpenHistory={() => setIsHistoryOpen(true)}
          />
          );
        })()}

        {/* 3. QR Code & PIN Modal */}
        {isQrModalOpen && (
          <QrModal
            isOpen={isQrModalOpen}
            mode={qrModalMode}
            initialTab={qrModalInitialTab}
            roomCode={roomCode}
            currentPeer={currentPeer}
            peerReady={isOnline}
            onClose={() => setIsQrModalOpen(false)}
            onJoinRoom={handleJoinRoom}
          />
        )}

        {/* 4. Wi-Fi Direct & Hotspot Setup Guide Modal */}
        {isHotspotGuideOpen && (
          <HotspotGuideModal
            isOpen={isHotspotGuideOpen}
            onClose={() => setIsHotspotGuideOpen(false)}
          />
        )}

        {/* 5. Transfer History / Vault Modal */}
        {isHistoryOpen && (
          <TransferHistory
            isOpen={isHistoryOpen}
            records={historyRecords}
            onClose={() => setIsHistoryOpen(false)}
            onClearHistory={() => setHistoryRecords([])}
            onDownloadRecord={handleDownloadRecord}
          />
        )}

        {/* 6. Device Profile & Settings Modal */}
        {isProfileOpen && (
          <DeviceSettingsModal
            isOpen={isProfileOpen}
            currentPeer={currentPeer}
            onClose={() => setIsProfileOpen(false)}
            onSaveProfile={handleSaveProfile}
            onResetIdentity={() => {
              // Manually reset device id + profile + room. Clears identity keys in storage,
              // then reloads the app to the HOME page (stripping any ?room=&peer= deep-link so
              // it does NOT re-join the old room). This is the only place identity is ever
              // reset (refresh alone never resets it).
              resetDeviceIdentity();
              // Remove the ?room=&peer= params and reload to the app root (home). Navigating
              // to the same path without a query lets the app start fresh with a new room.
              window.location.href = window.location.pathname;
            }}
          />
        )}

        {/* 7. Change Room / Hotspot Code Modal */}
        {isChangeRoomOpen && (
          <ChangeRoomModal
            isOpen={isChangeRoomOpen}
            currentRoomCode={roomCode}
            onClose={() => setIsChangeRoomOpen(false)}
            onChangeRoom={(code) => {
              handleJoinRoom(code);
              setIsChangeRoomOpen(false);
            }}
          />
        )}
      </Suspense>

      {/* 2. Incoming Transfer Request Prompt (Receiver) */}
      <IncomingTransferDialog
        request={incomingRequest}
        onAccept={handleAcceptIncoming}
        onReject={handleRejectIncoming}
      />

      {/* 2b. Receiver "Terima Perangkat" confirmation */}
      <AcceptDeviceDialog
        peer={pendingAcceptPeer}
        onAccept={handleConfirmAcceptDevice}
        onReject={handleRejectAcceptDevice}
      />

      {/* Connection status toast (Menghubungkan / terputus / ditolak). */}
      {connToast && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] w-[92%] max-w-md -translate-x-1/2 animate-in">
            <div
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl backdrop-blur-md ${
                connToast.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-pink-200 bg-white text-slate-900'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  connToast.type === 'error' ? 'bg-red-100 text-red-500' : 'bg-pink-100 text-pink-500'
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">{connToast.text}</span>
              <button
                type="button"
                onClick={() => setConnToast(null)}
                className="pointer-events-auto shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200"
              >
                Tutup
              </button>
            </div>
        </div>
      )}
    </div>
  );
}
