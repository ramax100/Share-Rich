import React from 'react';
import { Wifi, XCircle, CheckCircle2, PlugZap } from 'lucide-react';
import { Peer } from '../types';
import { AnimeAvatar } from './AnimeAvatar';

interface AcceptDeviceDialogProps {
  peer: Peer | null;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * "Terima Perangkat" confirmation modal (receiver side). Shown when the receiver taps
 * the "Terima Perangkat" button to actively pull the sender back into the radar and
 * open a direct WebRTC connection. The receiver confirms here so the connection is
 * intentional (and the transfer flow lands on the receiving device).
 */
export const AcceptDeviceDialog: React.FC<AcceptDeviceDialogProps> = ({
  peer,
  onAccept,
  onReject,
}) => {
  if (!peer) return null;

  return (
    <div
      id="accept-device-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white border border-emerald-300 shadow-2xl p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Top visual glow */}
        <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500" />

        {/* Device Profile Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-emerald-100">
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center text-3xl">
              <AnimeAvatar avatar={peer.avatar} size={54} />
            </div>
            <div className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 p-1 ring-2 ring-white">
              <Wifi className="h-2.5 w-2.5 text-white" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Terima Perangkat
            </span>
            <h3 className="text-base font-bold text-slate-900 truncate">{peer.name}</h3>
            <p className="text-xs text-slate-500">Ingin terhubung dan menerima file dari perangkat ini</p>
          </div>
        </div>

        {/* Connection notice */}
        <div className="mt-4 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 mb-5 text-[11px] text-emerald-700">
          <PlugZap className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Tombol ini menyambungkan koneksi langsung ke perangkat pengirim, sehingga
            perangkat tersebut muncul kembali di radar dan file dapat masuk ke perangkat ini.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            id="reject-accept-device-btn"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onReject();
            }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 border border-slate-200 text-xs font-bold transition cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>Tolak</span>
          </button>

          <button
            id="confirm-accept-device-btn"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAccept();
            }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 transition cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Terima</span>
          </button>
        </div>
      </div>
    </div>
  );
};
