import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { QrCode, Camera, KeyRound, Copy, Check, X, Loader2, Wifi, AlertCircle } from 'lucide-react';
import { Peer } from '../types';

interface QrModalProps {
  isOpen: boolean;
  mode: 'receive' | 'send';
  // Optional override for which tab opens first (e.g. the Send button opens the camera
  // scanner directly). Falls back to mode-based default ('qr' for receive, 'pin' for send).
  initialTab?: 'qr' | 'scan' | 'pin';
  roomCode: string;
  currentPeer: Peer;
  // True once the peer has been assigned its real, contactable PeerJS id
  // (becomes true as soon as the WebRTC signaling channel is open).
  peerReady: boolean;
  onClose: () => void;
  onJoinRoom: (roomCode: string, targetPeerId?: string) => void;
}

export const QrModal: React.FC<QrModalProps> = ({
  isOpen,
  mode: initialMode,
  initialTab,
  roomCode,
  currentPeer,
  peerReady,
  onClose,
  onJoinRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'qr' | 'scan' | 'pin'>(
    initialTab || (initialMode === 'receive' ? 'qr' : 'pin')
  );
  const [pinInput, setPinInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanAnimFrameRef = useRef<number | null>(null);
  const hiddenScanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // The QR encodes the peer's real PeerJS id. Before the WebRTC signaling channel
  // opens, currentPeer.id is only a temporary local placeholder (generateId()) that
  // no other device can connect to. Only treat the QR as shareable once:
  //   1) the signaling channel is open (peerReady), AND
  //   2) the id has the final `shareit-` prefix produced by PeerJS.
  const isPeerReady =
    peerReady && typeof currentPeer.id === 'string' && currentPeer.id.startsWith('shareit-');

  // Sync tab with mode prop when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || (initialMode === 'receive' ? 'qr' : 'pin'));
      setScanSuccess(false);
    }
  }, [isOpen, initialMode, initialTab]);

  // Generate QR code when tab is 'qr', room changes, peer becomes ready, or id changes
  useEffect(() => {
    if (isOpen && activeTab === 'qr' && isPeerReady && canvasRef.current) {
      const shareUrl = `${window.location.origin}?room=${roomCode}&peer=${currentPeer.id}`;
      QRCode.toCanvas(
        canvasRef.current,
        shareUrl,
        {
          width: 240,
          margin: 1.5,
          color: {
            dark: '#0369a1',
            light: '#ffffff',
          },
        },
        (error) => {
          if (error) console.error('QR Code generation error:', error);
        }
      );
    }
  }, [isOpen, activeTab, roomCode, currentPeer.id, isPeerReady]);

  // Camera stream and QR scanner loop
  useEffect(() => {
    if (isOpen && activeTab === 'scan') {
      startCameraAndScan();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  const startCameraAndScan = async () => {
    setCameraError(null);
    setScanSuccess(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // Start scanning loop
        runScanLoop();
      }
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError('Izin kamera ditolak atau tidak didukung peramban. Silakan gunakan PIN 6-digit.');
    }
  };

  const runScanLoop = () => {
    if (!hiddenScanCanvasRef.current) {
      hiddenScanCanvasRef.current = document.createElement('canvas');
    }
    const canvas = hiddenScanCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const video = videoRef.current;

    const scanFrame = () => {
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA || !ctx) {
        scanAnimFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        console.log('Found QR Code:', code.data);
        setScanSuccess(true);
        try {
          if ('vibrate' in navigator) {
            navigator.vibrate(100);
          }
        } catch (e) {
          // ignore
        }

        let parsedRoom = code.data;
        let targetPeerId: string | undefined;

        try {
          if (code.data.includes('?')) {
            const url = new URL(code.data);
            parsedRoom = url.searchParams.get('room') || parsedRoom;
            targetPeerId = url.searchParams.get('peer') || undefined;
          }
        } catch (e) {
          // not full url, use raw data
        }

        stopCamera();
        setTimeout(() => {
          onJoinRoom(parsedRoom.toUpperCase(), targetPeerId);
          onClose();
        }, 500);
        return;
      }

      scanAnimFrameRef.current = requestAnimationFrame(scanFrame);
    };

    scanAnimFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const stopCamera = () => {
    if (scanAnimFrameRef.current) {
      cancelAnimationFrame(scanAnimFrameRef.current);
      scanAnimFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleCopyLink = () => {
    // Never share the temporary placeholder id (not contactable by others).
    if (!isPeerReady) return;
    const url = `${window.location.origin}?room=${roomCode}&peer=${currentPeer.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim().length >= 2) {
      onJoinRoom(pinInput.trim().toUpperCase());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="qr-modal-container"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white border border-pink-100 shadow-2xl p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-pink-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Koneksi Cepat QR & PIN
              </h3>
              <p className="text-[11px] text-slate-500">
                Hubungkan dua perangkat di jaringan Wi-Fi lokal
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-pink-50 text-slate-400 hover:text-slate-900 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 p-1 my-4 rounded-xl bg-pink-50 border border-pink-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 shrink-0 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'qr'
                ? 'bg-pink-500 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Kode QR Saya</span>
          </button>

          <button
            onClick={() => setActiveTab('pin')}
            className={`flex-1 shrink-0 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'pin'
                ? 'bg-pink-500 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Masukkan PIN</span>
          </button>

          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 shrink-0 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'scan'
                ? 'bg-pink-500 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Pindai Kamera</span>
          </button>
        </div>

        {/* Tab 1: QR Code Receiver */}
        {activeTab === 'qr' && (
          <div className="flex flex-col items-center text-center">
            {isPeerReady ? (
              <div className="p-3 bg-white rounded-2xl shadow-xl ring-4 ring-pink-500/20 my-2">
                <canvas ref={canvasRef} className="rounded-lg" />
              </div>
            ) : (
              <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-pink-50 border border-pink-200 my-2">
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <Loader2 className="h-7 w-7 animate-spin text-pink-400" />
                  <span className="text-[10px] font-semibold">Menyiapkan QR…</span>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500 font-medium mt-2">
              {isPeerReady
                ? 'Pindai QR ini dari perangkat pengirim untuk terhubung otomatis'
                : 'Menghubungkan ke jaringan. QR akan muncul seketika setelah siap.'}
            </p>

            {/* 6-Digit PIN display */}
            <div className="w-full mt-4 p-3 rounded-2xl bg-pink-50 border border-pink-200 flex items-center justify-between">
              <div className="text-left">
                <span className="text-[10px] text-slate-500 font-medium block">PIN Koneksi Cepat</span>
                <span className="text-lg font-mono font-extrabold text-pink-600 tracking-wider">
                  #{roomCode}
                </span>
              </div>
              <button
                onClick={handleCopyLink}
                disabled={!isPeerReady}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-pink-50 text-slate-600 border border-pink-200 text-xs font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin Tautan'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Manual PIN Input */}
        {activeTab === 'pin' && (
          <form onSubmit={handlePinSubmit} className="flex flex-col gap-4 py-2">
            <div className="text-center">
              <p className="text-xs text-slate-500">
                Masukkan PIN Room perangkat penerima untuk langsung tersambung:
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500">
                PIN Room / Kode Penerima
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                  placeholder="Contoh: 784219 atau LOBBY"
                  className="w-full px-4 py-3 rounded-xl bg-white border border-pink-200 text-slate-900 font-mono text-center text-lg font-bold tracking-widest focus:outline-none focus:border-pink-500"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={pinInput.trim().length < 2}
              className="w-full py-3 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-pink-500/25 transition cursor-pointer"
            >
              Sambungkan ke Room #{pinInput || '...'}
            </button>
          </form>
        )}

        {/* Tab 3: Real-Time Camera Scanner */}
        {activeTab === 'scan' && (
          <div className="flex flex-col items-center py-2">
            <div className="relative w-full aspect-square max-h-64 rounded-2xl bg-black overflow-hidden flex items-center justify-center border border-pink-200">
              {cameraError ? (
                <div className="p-4 text-center text-xs text-amber-600">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                  {cameraError}
                </div>
              ) : scanSuccess ? (
                <div className="flex flex-col items-center gap-2 p-6 text-emerald-400 bg-emerald-950/80 animate-in zoom-in-95">
                  <Check className="w-12 h-12 stroke-[3]" />
                  <span className="text-sm font-bold">QR Terdeteksi! Menghubungkan...</span>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  {/* Scanner Reticle Overlay */}
                  <div className="absolute inset-8 border-2 border-pink-400/80 rounded-2xl pointer-events-none animate-pulse flex flex-col justify-between p-2">
                    <div className="flex justify-between">
                      <span className="w-4 h-4 border-t-2 border-l-2 border-pink-400" />
                      <span className="w-4 h-4 border-t-2 border-r-2 border-pink-400" />
                    </div>
                    <div className="flex justify-between">
                      <span className="w-4 h-4 border-b-2 border-l-2 border-pink-400" />
                      <span className="w-4 h-4 border-b-2 border-r-2 border-pink-400" />
                    </div>
                  </div>
                </>
              )}
            </div>

            <p className="text-[11px] text-slate-500 text-center mt-3">
              Arahkan kamera ke QR Code di layar perangkat penerima
            </p>
          </div>
        )}

        {/* Wi-Fi Direct notice */}
        <div className="mt-4 pt-3 border-t border-pink-100 flex items-center gap-2 text-[11px] text-slate-500">
          <Wifi className="w-3.5 h-3.5 text-pink-400 shrink-0" />
          <span>Pastikan kedua perangkat tersambung ke Hotspot / Wi-Fi yang sama</span>
        </div>
      </div>
    </div>
  );
};
