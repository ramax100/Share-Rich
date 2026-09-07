import React from 'react';
import { Link2, Check, Loader2, Smartphone, Laptop, Tablet, Wifi } from 'lucide-react';
import { Peer } from '../types';
import { AnimeAvatar } from './AnimeAvatar';

interface ConnectDevicesPanelProps {
  peers: Peer[];
  selectedPeer: Peer | null;
  connectedPeerIds: string[];
  connectingPeerIds: string[];
  onSelectPeer: (peer: Peer) => void;
}

const getDeviceIcon = (type: string) => {
  switch (type) {
    case 'desktop':
      return <Laptop className="h-3.5 w-3.5" />;
    case 'tablet':
      return <Tablet className="h-3.5 w-3.5" />;
    default:
      return <Smartphone className="h-3.5 w-3.5" />;
  }
};

export const ConnectDevicesPanel: React.FC<ConnectDevicesPanelProps> = ({
  peers,
  selectedPeer,
  connectedPeerIds = [],
  connectingPeerIds = [],
  onSelectPeer,
}) => {
  const connectedCount = peers.filter((p) => connectedPeerIds.includes(p.id)).length;

  return (
    <div id="connect-devices-panel" className="w-full">
      <div className="rounded-3xl border border-pink-100 bg-white p-4 shadow-lg shadow-pink-100/40">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pink-100 pb-3">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-pink-500 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Perangkat Terhubung
            </h3>
          </div>
          <span className="text-[11px] font-mono rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-pink-500">
            {connectedCount}/{peers.length} Aktif
          </span>
        </div>

        {/* Device list — connect via the "Terima" tab's QR / PIN. */}
        <div className="mt-3 flex flex-col gap-2">
          {peers.length === 0 && (
            <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/50 p-4 text-center">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-pink-100 text-pink-500">
                <Link2 className="h-4 w-4" />
              </div>
              <p className="text-xs font-bold text-slate-900">Belum ada perangkat terhubung</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Buka tab <strong className="text-pink-500">Terima</strong>, scan QR perangkat lain
                atau masukkan PIN untuk tersambung.
              </p>
            </div>
          )}

          {peers.map((peer) => {
            const isSelected = selectedPeer?.id === peer.id;
            const isConnected = connectedPeerIds.includes(peer.id);
            const isConnecting = connectingPeerIds.includes(peer.id) && !isConnected;

            return (
              <button
                key={peer.id}
                id={`connect-peer-${peer.id}`}
                type="button"
                onClick={() => onSelectPeer(peer)}
                className={`flex items-center gap-3 rounded-2xl border p-2.5 text-left transition hover:bg-pink-50/70 ${
                  isConnected
                    ? 'border-emerald-300 bg-emerald-50'
                    : isConnecting
                      ? 'border-amber-300 bg-amber-50'
                      : isSelected
                        ? 'border-pink-300 bg-pink-50'
                        : 'border-slate-200 bg-white hover:border-pink-200'
                }`}
              >
                {/* Avatar (transparent, no colored box) */}
                <div className="relative shrink-0">
                  <div className="flex h-11 w-11 items-center justify-center text-xl">
                    <AnimeAvatar avatar={peer.avatar} size={42} />
                  </div>
                  {isConnected && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
                      <Check className="h-2.5 w-2.5" strokeWidth={4} />
                    </span>
                  )}
                  {isConnecting && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-white">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" strokeWidth={3} />
                    </span>
                  )}
                </div>

                {/* Name + status */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{peer.name}</p>
                  <div className="mt-0.5 flex items-center gap-1">
                    {isConnected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-black text-white">
                        <Link2 className="h-3 w-3" /> Terhubung
                      </span>
                    )}
                    {isConnecting && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">
                        <Loader2 className="h-3 w-3 animate-spin" /> Menghubung
                      </span>
                    )}
                    {!isConnected && !isConnecting && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {getDeviceIcon(peer.deviceType)} Siap kirim
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && <span className="text-[10px] font-bold text-pink-500">Dipilih</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
