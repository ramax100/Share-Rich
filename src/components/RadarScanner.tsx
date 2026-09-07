import React from 'react';
import { Wifi, RefreshCw, Send, Smartphone, Laptop, Tablet, Radio, QrCode, Check, Link2, Loader2 } from 'lucide-react';
import { Peer } from '../types';
import { AnimeAvatar } from './AnimeAvatar';

interface RadarScannerProps {
  currentPeer: Peer;
  peers: Peer[];
  selectedPeer: Peer | null;
  connectedPeerIds?: string[];
  connectingPeerIds?: string[];
  onSelectPeer: (peer: Peer) => void;
  onRefresh: () => void;
  onOpenQrReceiver: () => void;
}

export const RadarScanner: React.FC<RadarScannerProps> = ({
  currentPeer,
  peers,
  selectedPeer,
  connectedPeerIds = [],
  connectingPeerIds = [],
  onSelectPeer,
  onRefresh,
  onOpenQrReceiver,
}) => {
  const [isScanning, setIsScanning] = React.useState(true);
  // Separate flag so the radar sweep spins continuously, while the button icon only
  // animates for the ~2.5s window after the user taps it.
  const [isButtonSpinning, setIsButtonSpinning] = React.useState(false);

  const handleScan = () => {
    setIsButtonSpinning(true);
    onRefresh();
    setTimeout(() => setIsButtonSpinning(false), 2500);
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'desktop':
        return <Laptop className="h-4 w-4" />;
      case 'tablet':
        return <Tablet className="h-4 w-4" />;
      default:
        return <Smartphone className="h-4 w-4" />;
    }
  };

  const getOrbitPosition = (index: number, total: number) => {
    const radius = total > 3 ? 108 : 88;
    const angle = (index * (360 / Math.max(1, total)) - 90) * (Math.PI / 180);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  };

  return (
    <div id="radar-scanner-container" className="w-full">
      <div className="relative flex aspect-square max-h-[420px] min-h-[300px] w-full items-center justify-center overflow-hidden rounded-[2rem] border border-pink-200 bg-white shadow-inner">
        <div className="" />
        <div className="absolute h-40 w-40 rounded-full border border-pink-400/20" />
        <div className="absolute h-64 w-64 rounded-full border border-pink-400/10" />
        <div className="absolute h-80 w-80 rounded-full border border-pink-400/10" />
        <div className="absolute h-px w-full bg-pink-400/10" />
        <div className="absolute h-full w-px bg-pink-400/10" />

        <div
          className={`absolute left-1/2 top-1/2 h-1/2 w-[2px] origin-top animate-[spin_4s_linear_infinite] rounded-full bg-pink-400/70 ${
            isScanning ? 'animate-[spin_3s_linear_infinite]' : 'opacity-20'
          }`}
        />

        {/* "Menghubungkan…" status banner shown while a pairing handshake is in progress. */}
        {(() => {
          const cp = peers.find((p) => connectingPeerIds.includes(p.id) && !connectedPeerIds.includes(p.id));
          if (!cp) return null;
          return (
            <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-black text-amber-600 shadow-lg backdrop-blur-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
              Menghubungkan ke {cp.name}…
            </div>
          );
        })()}

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="relative flex h-20 w-20 items-center justify-center text-4xl">
            <AnimeAvatar avatar={currentPeer.avatar} size={74} />
          </div>
          <p className="mt-3 max-w-[190px] truncate text-sm font-black text-slate-900">{currentPeer.name}</p>
          <p className="mt-1 rounded-full border border-pink-400/20 bg-pink-400/10 px-2.5 py-1 text-[10px] font-bold text-pink-600">
            Perangkat ini siap
          </p>
        </div>

        {peers.map((peer, idx) => {
          const { x, y } = getOrbitPosition(idx, peers.length);
          const isSelected = selectedPeer?.id === peer.id;
          const isConnected = connectedPeerIds.includes(peer.id);
          const isConnecting = connectingPeerIds.includes(peer.id) && !isConnected;

          return (
            <button
              key={peer.id}
              id={`radar-peer-${peer.id}`}
              type="button"
              style={{ transform: `translate(${x}px, ${y}px)` }}
              onClick={() => onSelectPeer(peer)}
              className={`absolute z-20 flex min-w-24 flex-col items-center rounded-2xl border p-2 text-center shadow-xl transition hover:scale-105 active:scale-95 ${
                isConnected
                  ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-50 shadow-emerald-500/30 ring-2 ring-emerald-400/50'
                  : isConnecting
                    ? 'animate-pulse border-amber-300/60 bg-amber-500/10 text-amber-50 shadow-amber-500/20 ring-2 ring-amber-300/40'
                    : isSelected
                      ? 'border-pink-300 bg-pink-500 text-white shadow-pink-500/25 ring-4 ring-pink-400/20'
                      : 'border-pink-100 bg-white text-slate-700 hover:border-pink-400'
              }`}
            >
              <div className="relative">
                {isConnected && (
                  <div className="absolute -inset-1.5 rounded-2xl bg-emerald-400/25 blur-md" />
                )}
                {isConnecting && (
                  <div className="absolute -inset-1.5 rounded-2xl bg-amber-300/25 blur-md" />
                )}
                <div className="relative flex h-11 w-11 items-center justify-center text-xl">
                  <AnimeAvatar avatar={peer.avatar} size={42} />
                </div>
                {isConnected && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-400 text-white">
                    <Check className="h-2.5 w-2.5" strokeWidth={4} />
                  </span>
                )}
                {isConnecting && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-amber-400 text-white">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" strokeWidth={3} />
                  </span>
                )}
              </div>
              <span className={`mt-1 max-w-[90px] truncate text-[11px] font-black ${isConnected || isConnecting ? 'text-slate-900' : ''}`}>
                {peer.name}
              </span>
              {isConnected ? (
                <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-black text-white shadow-sm">
                  <Link2 className="h-3 w-3" /> Terhubung
                </span>
              ) : isConnecting ? (
                <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-black text-white shadow-sm">
                  <Loader2 className="h-3 w-3 animate-spin" /> Menghubung
                </span>
              ) : (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-bold">
                  {getDeviceIcon(peer.deviceType)} Kirim
                </span>
              )}
            </button>
          );
        })}

        {peers.length === 0 && (
          <div className="absolute bottom-4 left-4 right-4 z-10 rounded-2xl border border-pink-100 bg-white/85 p-3 text-center backdrop-blur-md">
            <p className="text-xs font-bold text-white">Mencari perangkat lain...</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Buka website ini di HP kedua pada Room yang sama, lalu tunggu beberapa detik.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          id="radar-refresh-btn"
          type="button"
          onClick={handleScan}
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-pink-50 px-3 py-3 text-xs font-black text-pink-700 transition hover:bg-white/10"
        >
          <RefreshCw className={`h-4 w-4 text-pink-600 ${isButtonSpinning ? 'animate-spin' : ''}`} />
          Temukan Perangkat
        </button>

        <button
          id="qr-receiver-btn"
          type="button"
          onClick={onOpenQrReceiver}
          className="flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-3 py-3 text-xs font-black text-white shadow-lg shadow-pink-300 transition hover:bg-pink-400"
        >
          <QrCode className="h-4 w-4" />
          QR Penerima
        </button>
      </div>

          {selectedPeer && (() => {
            const isConnected = connectedPeerIds.includes(selectedPeer.id);
            return (
              <div className={`mt-3 flex items-center gap-3 rounded-2xl border p-3 ${isConnected ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-pink-400/25 bg-pink-400/10'}`}>
                <div className="flex h-10 w-10 items-center justify-center text-xl">
                  <AnimeAvatar avatar={selectedPeer.avatar} size={38} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] font-bold ${isConnected ? 'text-emerald-600' : 'text-pink-600'}`}>
                    {isConnected ? 'Terhubung & siap transfer' : 'Tujuan dipilih'}
                  </p>
                  <p className="truncate text-sm font-black text-white">{selectedPeer.name}</p>
                </div>
                {isConnected ? <Link2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <Send className="h-4 w-4 text-pink-600 shrink-0" />}
              </div>
            );
          })()}
    </div>
  );
};
