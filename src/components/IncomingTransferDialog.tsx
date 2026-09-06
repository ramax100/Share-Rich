import React from 'react';
import { Download, XCircle, CheckCircle2, ShieldCheck, FileText, Wifi } from 'lucide-react';
import { IncomingRequest } from '../types';
import { formatBytes } from '../utils/helpers';
import { AnimeAvatar } from './AnimeAvatar';

interface IncomingTransferDialogProps {
  request: IncomingRequest | null;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingTransferDialog: React.FC<IncomingTransferDialogProps> = ({
  request,
  onAccept,
  onReject,
}) => {
  if (!request) return null;

  return (
    <div
      id="incoming-transfer-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white border border-pink-300 shadow-2xl p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Top visual glow */}
        <div className="absolute top-0 inset-x-0 h-1 bg-pink-500" />

        {/* Sender Profile Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-pink-100">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-pink-500 flex items-center justify-center text-3xl shadow-lg shadow-pink-500/20">
              <AnimeAvatar avatar={request.senderAvatar} size={54} />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1 bg-pink-500 rounded-full ring-2 ring-white">
              <Wifi className="w-2.5 h-2.5 text-white" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-pink-400 uppercase tracking-wider">
              Permintaan Masuk Wi-Fi Direct
            </span>
            <h3 className="text-base font-bold text-slate-900 truncate">
              {request.senderName}
            </h3>
            <p className="text-xs text-slate-500">
              Ingin mentransfer {request.files.length} file ({formatBytes(request.totalSize)})
            </p>
          </div>
        </div>

        {/* Files Preview List */}
        <div className="my-4">
          <span className="text-xs font-semibold text-slate-600 block mb-2">
            Rincian File:
          </span>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {request.files.map((f, idx) => (
              <div
                key={f.id || idx}
                className="flex items-center justify-between p-2.5 rounded-xl bg-pink-50 border border-pink-200 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-pink-500 shrink-0">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-medium text-slate-700 truncate max-w-[200px]" title={f.name}>
                    {f.name}
                  </span>
                </div>
                <span className="font-mono text-slate-600 shrink-0 ml-2">
                  {formatBytes(f.size)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Security / Network Notice */}
        <div className="p-2.5 rounded-xl bg-pink-50 border border-pink-200 flex items-center gap-2.5 mb-5 text-[11px] text-pink-700">
          <ShieldCheck className="w-4 h-4 text-pink-400 shrink-0" />
          <span>
            Setelah selesai, file akan otomatis masuk ke download perangkat ini. Tombol unduh ulang tetap tersedia sebagai cadangan.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            id="reject-transfer-btn"
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
            id="accept-transfer-btn"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAccept();
            }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-pink-500 hover:bg-pink-400 text-white text-xs font-bold shadow-lg shadow-pink-500/25 transition cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Terima File</span>
          </button>
        </div>
      </div>
    </div>
  );
};
