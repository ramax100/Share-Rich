import React, { useState } from 'react';
import { Send, Gift, Sparkles, Check, ArrowRight, ExternalLink, Zap } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: (neverShowAgain: boolean) => void;
}

/**
 * First-open welcome popup. Shows a friendly note that Share Rich is completely FREE,
 * and invites the user to join the official Telegram channel (Rich Store). A checkbox lets
 * the user stop it from appearing again (persisted in localStorage).
 *
 * Mobile-first layout: the content scrolls in the body while the "Jangan tampilkan lagi"
 * checkbox and the primary "Mulai Menggunakan" button are pinned in a sticky bottom bar,
 * so they are always visible on small screens without needing to scroll to the bottom.
 */
export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  const [neverShow, setNeverShow] = useState(false);

  if (!isOpen) return null;

  const handleJoin = () => {
    window.open('https://t.me/ChRichStore', '_blank', 'noopener,noreferrer');
  };

  const handleProceed = () => {
    onClose(neverShow);
  };

  return (
    <div
      id="welcome-modal"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 bg-white/70 backdrop-blur-md animate-in fade-in duration-150"
    >
      {/* Flex column so the footer stays pinned while the body scrolls on short screens. */}
      <div className="relative flex w-full max-w-md sm:max-w-lg max-h-[calc(100dvh-2rem)] flex-col rounded-3xl bg-white border border-pink-100 shadow-2xl overflow-hidden">
        {/* Decorative glows */}
        <div className="pointer-events-none absolute top-0 right-0 -mr-20 -mt-20 h-60 w-60 rounded-full bg-pink-500/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 -ml-20 -mb-20 h-60 w-60 rounded-full bg-fuchsia-600/10 blur-3xl" />

        {/* Scrollable body (min-h-0 lets it shrink and scroll inside the fixed-height column). */}
        <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pt-6 pb-2 sm:px-8 sm:pt-8">
          {/* Brand header */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-pink-200 bg-white shadow-lg shadow-pink-200/60 sm:h-14 sm:w-14">
              <img src="/icons/logo.png" alt="Share Rich" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">Selamat Datang di Share Rich 👋</h2>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-pink-300 bg-pink-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-pink-500">
                <Sparkles className="h-3 w-3" /> Gratis Selamanya
              </span>
            </div>
          </div>

          {/* Welcome copy */}
          <div className="mt-4 space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <p>
              Terima kasih sudah membuka <strong className="text-slate-900">Share Rich</strong>! 🎉
            </p>
            <p>
              Website ini <strong className="text-pink-500">100% GRATIS</strong> dan bebas digunakan.
              Kirim file langsung antar perangkat secara <strong className="text-slate-900">P2P</strong> tanpa batas,
              tanpa iklan, dan tanpa biaya — cukup hubungkan dua perangkat lewat{' '}
              <strong className="text-slate-900">QR Code atau PIN</strong>.
            </p>
            <p>
              Semua file dipindahkan langsung dari perangkat satu ke perangkat lain, <strong className="text-slate-900">Tanpa diunggah ke server</strong>.
              Jadi aman, cepat, dan sangat pas untuk berbagi foto, video, dokumen, hingga file besar.
            </p>
          </div>

          {/* Telegram channel CTA */}
          <div className="mt-4 rounded-2xl border border-pink-200 bg-pink-50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500 text-white shadow-md shadow-pink-200">
                <Send className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">Gabung Channel Telegram</p>
                <p className="text-[11px] text-slate-500">Rich Store — info update</p>
              </div>
            </div>
            <a
              href="https://t.me/ChRichStore"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleJoin}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-pink-500 py-2.5 text-xs sm:text-sm font-black text-white shadow-lg shadow-pink-500/25 transition hover:bg-pink-400"
            >
              <ExternalLink className="h-4 w-4" />
              Gabung Sekarang
            </a>
          </div>

          {/* Feature ticks */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
              <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> Transfer Cepat 5 GHz
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-[11px] font-bold text-pink-700">
              <Gift className="h-3.5 w-3.5 shrink-0 text-pink-500" /> Free & Tanpa Batas
            </div>
          </div>
        </div>

        {/* Sticky footer: always-visible actions (no need to scroll down on mobile). */}
        <div className="relative shrink-0 border-t border-pink-100 bg-white/95 px-6 py-3 backdrop-blur sm:px-8">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-600 transition hover:border-pink-200 hover:bg-pink-50">
            <input
              type="checkbox"
              checked={neverShow}
              onChange={(e) => setNeverShow(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-pink-500"
            />
            <span>Jangan tampilkan lagi</span>
          </label>

          <button
            type="button"
            onClick={handleProceed}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs sm:text-sm font-black text-white transition hover:bg-slate-800"
          >
            <Check className="h-4 w-4 text-emerald-400" />
            Mulai Menggunakan
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
