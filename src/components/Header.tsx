import React from 'react';
import { HelpCircle, History, Settings, Copy, Check, Sparkles } from 'lucide-react';
import { Peer } from '../types';
import { AnimeAvatar } from './AnimeAvatar';

interface HeaderProps {
  currentPeer: Peer;
  roomCode: string;
  isOnline: boolean;
  historyCount: number;
  onOpenProfile: () => void;
  onOpenHotspotGuide: () => void;
  onOpenHistory: () => void;
  onOpenChangeRoom: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPeer,
  roomCode,
  isOnline,
  historyCount,
  onOpenProfile,
  onOpenHotspotGuide,
  onOpenHistory,
  onOpenChangeRoom,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <header id="shareit-header" className="sticky top-0 z-30 w-full border-b border-pink-100 bg-white/85 text-slate-900 shadow-lg shadow-pink-100/40 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-pink-200 bg-white shadow-lg shadow-pink-200/60 sm:h-11 sm:w-11 sm:rounded-2xl">
            <img src="/icons/logo.png" alt="Share Rich" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-black tracking-tight sm:text-xl">Share Rich</h1>
              <span className="hidden rounded-full border border-pink-300 bg-pink-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-pink-500 sm:inline-flex">
                P2P
              </span>
            </div>
            <p className="hidden text-[11px] font-medium text-slate-500 sm:block">
              Transfer file support semua Perangkat
            </p>
          </div>
        </div>

        {/* Room */}
        <button
          id="room-code-badge"
          onClick={onOpenChangeRoom}
          className="group hidden items-center gap-2 rounded-2xl border border-pink-200 bg-pink-50 px-3 py-2 text-xs transition hover:border-pink-300 hover:bg-pink-100 md:flex"
          title="Klik untuk mengganti Room"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_14px_rgba(52,211,153,.9)]' : 'bg-amber-500'}`} />
          <span className="text-slate-500">Room</span>
          <strong className="font-mono tracking-wider text-pink-500">#{roomCode}</strong>
          <span onClick={handleCopyLink} className="rounded-lg p-1 text-pink-400 transition hover:bg-pink-100">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </span>
        </button>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            id="hotspot-guide-btn"
            onClick={onOpenHotspotGuide}
            className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-pink-200 hover:bg-pink-50 sm:flex"
            title="Panduan koneksi"
          >
            <HelpCircle className="h-4 w-4 text-amber-500" />
            Bantuan
          </button>

          <button
            id="history-vault-btn"
            onClick={onOpenHistory}
            className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:border-pink-200 hover:bg-pink-50"
            title="Riwayat file"
          >
            <History className="h-4 w-4 text-pink-500" />
            {historyCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
                {historyCount}
              </span>
            )}
          </button>

          <button
            id="device-profile-btn"
            onClick={onOpenProfile}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white py-1.5 pl-2 pr-2 text-xs text-slate-700 transition hover:border-pink-200 hover:bg-pink-50 sm:pr-3"
            title="Pengaturan perangkat"
          >
            {/* Avatar with transparent background. */}
            <div className="flex h-8 w-8 items-center justify-center">
              <AnimeAvatar avatar={currentPeer.avatar} size={32} />
            </div>
            <span className="hidden max-w-[110px] truncate font-bold sm:inline">{currentPeer.name}</span>
            <Settings className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 pb-2 text-[11px] md:hidden">
        <button onClick={onOpenChangeRoom} className="flex min-w-0 items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-pink-500" />
          <span className="text-slate-500">Room</span>
          <strong className="truncate font-mono text-pink-500">#{roomCode}</strong>
        </button>
        <button onClick={onOpenHotspotGuide} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-slate-600">
          <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
          Bantuan
        </button>
      </div>
    </header>
  );
};
