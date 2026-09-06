import React, { useEffect, useRef } from 'react';
import {
  Wifi,
  Zap,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  FolderDown,
  X,
  Loader2,
  AlertCircle,
  Download,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ActiveTransferSession, Peer } from '../types';
import { formatBytes, formatSpeed, formatDuration } from '../utils/helpers';
import { TransferDuel } from './TransferDuel';

interface TransferProgressModalProps {
  session: ActiveTransferSession | null;
  sender?: Peer | null;
  receiver?: Peer | null;
  onCancel: () => void;
  onRetry?: () => void;
  onClose: () => void;
  onOpenHistory: () => void;
}

export const TransferProgressModal: React.FC<TransferProgressModalProps> = ({
  session,
  sender,
  receiver,
  onCancel,
  onRetry,
  onClose,
  onOpenHistory,
}) => {
  const hasTriggeredConfetti = useRef(false);

  useEffect(() => {
    if (session?.status === 'completed' && !hasTriggeredConfetti.current) {
      hasTriggeredConfetti.current = true;
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#0284c7', '#38bdf8', '#6366f1', '#10b981'],
        });
      } catch (e) {
        // Safe fallback in restrictive iframes
      }
    } else if (session?.status !== 'completed') {
      hasTriggeredConfetti.current = false;
    }
  }, [session?.status]);

  if (!session) return null;

  const isSending = session.direction === 'sending';
  const isWaiting = session.status === 'waiting';
  const isCompleted = session.status === 'completed';
  const isFailed = session.status === 'failed';
  const isCancelled = session.status === 'cancelled';
  const isRejected = session.status === 'rejected';

  const safeTotal = Math.max(1, session.totalBytes || 1);
  const safeTransferred = Math.min(safeTotal, Math.max(0, session.transferredBytes || 0));
  const percent = isCompleted
    ? 100
    : Math.min(99, Math.max(0, Math.round((safeTransferred / safeTotal) * 100)));

  const speedData = formatSpeed(session.currentSpeedBytes || (session.status === 'transferring' ? 52 * 1024 * 1024 : 0));
  const filesList = session.files || [];
  const safeIndex = Math.min(Math.max(0, session.currentFileIndex || 0), Math.max(0, filesList.length - 1));
  const currentFile = filesList[safeIndex] || { name: 'File Sedang Diproses', size: safeTotal };

  // Calculate SVG stroke offset safely
  const radius = 68;
  const circumference = 2 * Math.PI * radius; // ~427
  const strokeDashoffset = isNaN(percent)
    ? circumference
    : circumference - (circumference * percent) / 100;

  return (
    <div
      id="transfer-progress-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-white border border-pink-100 shadow-2xl p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Glow backdrop */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-60 h-60 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-60 h-60 rounded-full bg-fuchsia-600/10 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-pink-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isCompleted
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : isCancelled || isFailed || isRejected
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-pink-500/20 text-pink-400 border border-pink-500/30 animate-pulse'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : isCancelled || isFailed || isRejected ? (
                <XCircle className="w-5 h-5" />
              ) : isSending ? (
                <ArrowUpRight className="w-5 h-5" />
              ) : (
                <ArrowDownLeft className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {isCompleted
                  ? 'Transfer Selesai 100%!'
                  : isRejected
                  ? 'Transfer Ditolak Penerima'
                  : isCancelled
                  ? 'Transfer Dibatalkan'
                  : isFailed
                  ? 'Transfer Gagal Terhubung'
                  : isWaiting
                  ? isSending
                    ? 'Menunggu Persetujuan Penerima...'
                    : 'Menghubungkan Perangkat...'
                  : isSending
                  ? 'Mengirim File via Wi-Fi...'
                  : 'Menerima File via Wi-Fi...'}
              </h2>
              <p className="text-xs text-slate-500">
                {isRejected
                  ? session.error || 'Penerima tidak menyetujui transfer berkas'
                  : isSending
                  ? `Tujuan: ${session.peerName}`
                  : `Dari: ${session.peerName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 text-[11px] font-mono text-pink-500">
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>5 GHz Direct</span>
            </div>
            {(isCompleted || isCancelled || isFailed || isRejected) && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-pink-50 text-slate-400 hover:text-slate-900 transition cursor-pointer"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Fun full-body dueling avatars + paper plane (while loading/transferring) */}
        {(() => {
          const showDuel = isWaiting || (!isCompleted && !isCancelled && !isFailed && !isRejected);
          const isTransferring = session.status === 'transferring';
          return showDuel ? (
            <div className="my-6">
              <TransferDuel
                direction={session.direction}
                sender={sender}
                receiver={receiver}
                sideLabel={isSending ? 'Mengirim file…' : 'Menerima file…'}
              />
              {/* Loading / progress bar under the anime animation */}
              <div className="mt-4 rounded-2xl border border-pink-200 bg-pink-50/60 p-3">
                <div className="flex items-center justify-between gap-3 text-[11px] font-mono text-slate-500">
                  <span className="min-w-0 flex-1 truncate font-bold text-slate-900">
                    {currentFile.name}
                  </span>
                  <span className="shrink-0 text-pink-500">
                    {formatBytes(safeTransferred)} / {formatBytes(safeTotal)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-pink-100">
                    {isTransferring ? (
                      <div
                        className="h-full rounded-full bg-pink-500 transition-all duration-200"
                        style={{ width: `${percent}%` }}
                      />
                    ) : (
                      <div className="h-full w-full animate-[shine_1.2s_linear_infinite] rounded-full bg-pink-400" />
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-black text-slate-900">
                    {isTransferring ? `${percent}%` : 'Menghubung…'}
                  </span>
                </div>
                {isTransferring && (
                  <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Zap className="h-3 w-3 text-amber-400" />
                      {speedData.mbs} · {speedData.mbps}
                    </span>
                    <span>EES {Math.ceil(session.etaSeconds || 0)} dtk</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
          <div className="my-6 flex flex-col items-center justify-center">
          <div className="relative w-44 h-44 flex items-center justify-center">
            {/* SVG Progress Circle */}
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="stroke-slate-300"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="80"
                cy="80"
                r={radius}
                className={`transition-all duration-300 ${
                  isCompleted
                    ? 'stroke-emerald-500'
                    : isCancelled || isFailed
                    ? 'stroke-red-500'
                    : 'stroke-pink-400'
                }`}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Inner Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3">
              {isWaiting ? (
                <>
                  <Loader2 className="w-10 h-10 text-pink-400 animate-spin" />
                  <span className="text-xs font-bold text-pink-600 mt-2">Menyambung...</span>
                  <span className="text-[10px] text-slate-500">Handshake P2P</span>
                </>
              ) : isCompleted ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
                  <span className="text-xs font-bold text-emerald-600 mt-1">100% Sukses</span>
                </>
              ) : isCancelled || isFailed ? (
                <>
                  {isFailed ? <AlertCircle className="w-12 h-12 text-amber-400" /> : <XCircle className="w-12 h-12 text-red-400" />}
                  <span className="text-xs font-bold text-red-600 mt-1">
                    {isFailed ? 'Gagal Terhubung' : 'Dibatalkan'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-black text-slate-900 tracking-tight">
                    {percent}%
                  </span>
                  <div className="flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-pink-500/20 text-pink-600 text-xs font-bold font-mono">
                    <Zap className="w-3 h-3 text-amber-400 animate-pulse" />
                    <span>{speedData.mbs}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {speedData.mbps}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Current File Information */}
          <div className="w-full mt-4 p-3 rounded-2xl bg-pink-50/70 border border-pink-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-pink-200 flex items-center justify-center text-pink-500 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate" title={currentFile.name}>
                {currentFile.name}
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-1">
                <span>
                  {filesList.length > 0 ? `File ${safeIndex + 1} dari ${filesList.length}` : 'Menyiapkan...'}
                </span>
                <span className="font-semibold text-pink-400">
                  {formatBytes(safeTransferred)} / {formatBytes(safeTotal)}
                </span>
              </div>
              {/* Mini linear progress bar */}
              <div className="w-full h-1.5 bg-pink-100 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    isCompleted ? 'bg-emerald-400' : isCancelled || isFailed ? 'bg-red-500' : 'bg-pink-400'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
          );
        })()}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-pink-50/60 border border-pink-200 text-center">
          <div className="p-2">
            <span className="text-[10px] text-slate-500 font-medium block">Kecepatan Wi-Fi</span>
            <span className="text-xs font-mono font-bold text-pink-600 mt-0.5 block truncate">
              {isCompleted ? 'Terkirim' : speedData.mbs}
            </span>
          </div>

          <div className="p-2 border-x border-pink-200">
            <span className="text-[10px] text-slate-500 font-medium block">Sisa Waktu (ETA)</span>
            <span className="text-xs font-mono font-bold text-slate-700 mt-0.5 block truncate">
              {isCompleted ? '0 dtk' : formatDuration(session.etaSeconds || 0)}
            </span>
          </div>

          <div className="p-2">
            <span className="text-[10px] text-slate-500 font-medium block">Jalur Transfer</span>
            <span className="text-xs font-mono font-bold text-emerald-400 mt-0.5 block truncate">
              P2P Langsung 5 GHz
            </span>
          </div>
        </div>

        {isCompleted && session.direction === 'receiving' && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-[11px] text-emerald-700">
            <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <p className="leading-tight">
              Download otomatis sudah dicoba. Jika browser menahan download, tekan tombol <strong>Unduh Ulang Berkas</strong> di bawah.
            </p>
          </div>
        )}

        {/* Share Rich Turbo Speed Tip */}
        {!isCompleted && !isCancelled && !isFailed && !isRejected && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-pink-50 border border-pink-200 flex items-center gap-2 text-[11px] text-pink-700">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <p className="leading-tight">
              <span className="font-semibold text-slate-900">Mode Turbo Share Rich:</span> Aktifkan Hotspot di HP 1 lalu sambungkan HP 2 ke Hotspot tersebut (5 GHz) untuk kecepatan maksimal 30–60 MB/s!
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2">
          {isCompleted && session.direction === 'receiving' && session.completedBlobUrl && (
            <a
              id="direct-download-file-btn"
              href={session.completedBlobUrl}
              download={session.completedFileName || 'file-transfer'}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Ulang Berkas ({session.completedFileName || 'File'})</span>
            </a>
          )}

          {/* "Hubungkan Ulang": re-trigger the file notification on the receiver when it
              didn't appear (sender side, while still waiting / after a failed connect). */}
          {isSending && (isWaiting || isFailed) && (
            <div className="-mt-2 rounded-2xl border border-amber-400/25 bg-amber-500/5 p-2.5 text-center">
              <p className="mb-2 text-[11px] font-medium leading-tight text-amber-600">
                Penerima belum muncul notifikasinya? Coba hubungkan ulang untuk memicu ulang notif ke perangkat penerima.
              </p>
              <button
                id="retry-connect-btn"
                type="button"
                onClick={onRetry}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-black shadow-lg shadow-amber-500/25 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Hubungkan Ulang</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {!isCompleted && !isCancelled && !isFailed && !isRejected ? (
              <button
                id="cancel-transfer-btn"
                type="button"
                onClick={onCancel}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-600 border border-red-200 text-xs font-bold transition cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Batalkan Transfer</span>
              </button>
            ) : (
              <>
                <button
                  id="view-vault-btn"
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenHistory();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition cursor-pointer"
                >
                  <FolderDown className="w-4 h-4 text-pink-400" />
                  <span>Buka Riwayat File</span>
                </button>

                <button
                  id="close-transfer-btn"
                  type="button"
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-pink-500 hover:bg-pink-400 text-white text-xs font-bold shadow-lg shadow-pink-500/25 transition cursor-pointer"
                >
                  <span>Selesai & Tutup</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Loading bar shimmer keyframes */}
      <style>{`
        @keyframes shine {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  );
};
