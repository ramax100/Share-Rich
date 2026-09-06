import React, { useEffect, useState } from 'react';
import { KeyRound, X, Check, Wifi, ArrowRight } from 'lucide-react';

interface ChangeRoomModalProps {
  isOpen: boolean;
  currentRoomCode: string;
  onClose: () => void;
  onChangeRoom: (newRoomCode: string) => void;
}

/**
 * Styled white/pink modal for changing the active P2P Room / Hotspot code.
 * Replaces the old browser-native `prompt()` that popped up when clicking the
 * "Room" badge, so the whole flow matches the light theme.
 */
export const ChangeRoomModal: React.FC<ChangeRoomModalProps> = ({
  isOpen,
  currentRoomCode,
  onClose,
  onChangeRoom,
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset the input + error each time the modal is opened.
  useEffect(() => {
    if (isOpen) {
      setCode('');
      setError(null);
    }
  }, [isOpen]);

  // Close on Escape key.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (value.length < 2) {
      setError('Masukkan PIN Room minimal 2 karakter (contoh: 784219 atau LOBBY).');
      return;
    }
    // Do nothing if the user just re-enters the current room.
    if (value === currentRoomCode.toUpperCase()) {
      onClose();
      return;
    }
    onChangeRoom(value);
  };

  return (
    <div
      id="change-room-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white border border-pink-100 shadow-2xl p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-pink-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Ganti Room / Kode</h3>
              <p className="text-[11px] text-slate-500">
                Satu PIN agar dua perangkat bisa bertemu
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-pink-50 text-slate-500 hover:text-slate-900 transition cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-4">
          {/* Current room */}
          <div className="rounded-2xl bg-pink-50 border border-pink-200 flex items-center justify-between px-4 py-3">
            <div className="text-left">
              <span className="text-[10px] text-slate-500 font-medium block">Room Sekarang</span>
              <span className="text-lg font-mono font-extrabold text-pink-500 tracking-wider">
                #{currentRoomCode}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-white border border-pink-200 flex items-center justify-center text-pink-400">
              <Wifi className="w-4 h-4" />
            </div>
          </div>

          {/* New code input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500">
              PIN Room / Kode Baru
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Contoh: 784219 atau LOBBY"
              className="w-full px-4 py-3 rounded-xl bg-white border border-pink-200 text-slate-900 font-mono text-center text-lg font-bold tracking-widest focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 placeholder:text-slate-300"
              autoFocus
              maxLength={24}
            />
            {error && (
              <p className="text-[11px] font-medium text-rose-500 px-1">{error}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-pink-500 hover:bg-pink-400 text-white font-bold text-xs shadow-lg shadow-pink-500/25 transition cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            Pindah ke Room
            {code.trim() && <span className="font-mono">#{code.trim().toUpperCase()}</span>}
          </button>
        </form>

        {/* Footer hint */}
        <div className="pt-3 border-t border-pink-100 flex items-center gap-2 text-[11px] text-slate-500">
          <Check className="w-3.5 h-3.5 text-pink-400 shrink-0" />
          <span>Perangkat lain harus memakai PIN Room yang sama agar bisa terhubung.</span>
        </div>
      </div>
    </div>
  );
};
