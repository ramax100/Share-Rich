import React, { useState } from 'react';
import { Settings, Smartphone, Wifi, Check, X, Shield, Cpu, RefreshCw, AlertTriangle } from 'lucide-react';
import { Peer } from '../types';
import { AnimeAvatar, ANIME_AVATAR_IDS, getAnimeAvatarName } from './AnimeAvatar';

interface DeviceSettingsModalProps {
  isOpen: boolean;
  currentPeer: Peer;
  onClose: () => void;
  onSaveProfile: (name: string, avatar: string) => void;
  onResetIdentity: () => void;
}

const AVATAR_OPTIONS = ANIME_AVATAR_IDS;

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  currentPeer,
  onClose,
  onSaveProfile,
  onResetIdentity,
}) => {
  const [name, setName] = useState(currentPeer.name);
  const [avatar, setAvatar] = useState(currentPeer.avatar);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSaveProfile(name.trim(), avatar);
      onClose();
    }
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      // Auto-cancel the confirmation after a short delay so a stray second tap doesn't reset.
      setTimeout(() => setConfirmReset(false), 6000);
      return;
    }
    onResetIdentity();
  };

  return (
    <div
      id="device-settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white border border-pink-100 shadow-2xl p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-pink-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Profil Avatar Anime
              </h3>
              <p className="text-[11px] text-slate-500">
                Nama ini terlihat di radar Wi-Fi perangkat lain
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-pink-50 text-slate-500 hover:text-slate-900 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSubmit} className="space-y-4 my-4">
          {/* Avatar Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-2">
              Pilih Avatar Chibi:
            </label>
            <div className="grid grid-cols-5 gap-2 p-2 rounded-2xl bg-pink-50 border border-pink-200">
              {AVATAR_OPTIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => {
                    setAvatar(item);
                    setName(getAnimeAvatarName(item) || name);
                  }}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition cursor-pointer ${
                    avatar === item
                      ? 'bg-pink-500 text-white shadow-md ring-2 ring-pink-300 scale-105'
                      : 'hover:bg-pink-100 text-slate-600'
                  }`}
                >
                  <AnimeAvatar avatar={item} size={42} />
                </button>
              ))}
            </div>
          </div>

          {/* Name Input */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Nama Perangkat:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Galaxy S24 Ultra / MacBook Pro"
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-pink-200 text-slate-900 text-xs font-medium focus:outline-none focus:border-pink-500"
              maxLength={30}
              required
            />
          </div>

          {/* Network Specs Diagnostic */}
          <div className="p-3 rounded-2xl bg-pink-50 border border-pink-200 text-xs space-y-1.5 text-slate-500">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600">Jalur Transfer:</span>
              <span className="font-mono text-pink-400 font-semibold">WebRTC Direct DataChannel</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600">Pita Frekuensi:</span>
              <span className="font-mono text-emerald-400 font-semibold">Wi-Fi 5 GHz / 2.4 GHz</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600">Ukuran Chunk Transfer:</span>
              <span className="font-mono text-slate-500">128 KB Responsive Stream</span>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-pink-500 hover:bg-pink-400 text-white font-bold text-xs shadow-lg shadow-pink-500/25 transition cursor-pointer"
            >
              Simpan Profil
            </button>
          </div>
        </form>

        {/* Reset Device Identity */}
        <div className="pt-3 border-t border-pink-100">
          <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Reset akan mengganti ID, nama, avatar, dan Room perangkat. Semua perangkat lain
              yang menyimpan ID lama harus menscan ulang agar bisa terhubung lagi.
            </span>
          </div>

          {confirmReset ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold shadow-lg shadow-red-500/25 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Ya, Reset Sekarang
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white hover:bg-red-50 text-red-500 hover:text-red-600 border border-red-200 text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset ID & Profil Perangkat
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
