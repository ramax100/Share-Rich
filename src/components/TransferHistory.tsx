import React, { useState } from 'react';
import {
  History,
  Download,
  Eye,
  Trash2,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  CheckCircle2,
} from 'lucide-react';
import { HistoryRecord } from '../types';
import { formatBytes } from '../utils/helpers';

interface TransferHistoryProps {
  isOpen: boolean;
  records: HistoryRecord[];
  onClose: () => void;
  onClearHistory: () => void;
  onDownloadRecord: (record: HistoryRecord) => void;
}

export const TransferHistory: React.FC<TransferHistoryProps> = ({
  isOpen,
  records,
  onClose,
  onClearHistory,
  onDownloadRecord,
}) => {
  const [filter, setFilter] = useState<'all' | 'received' | 'sent'>('all');
  const [previewItem, setPreviewItem] = useState<HistoryRecord | null>(null);

  if (!isOpen) return null;

  const filteredRecords = filter === 'all'
    ? records
    : records.filter((r) => r.direction === filter);

  return (
    <div
      id="transfer-history-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-xl rounded-3xl bg-white border border-pink-100 shadow-2xl p-6 overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-pink-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Riwayat & Brankas File ({records.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                File yang diterima dan dikirim selama sesi ini
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {records.length > 0 && (
              <button
                onClick={onClearHistory}
                className="text-xs text-rose-400 hover:text-rose-600 flex items-center gap-1 transition cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bersihkan</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-pink-50 text-slate-500 hover:text-slate-900 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 my-3 overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              filter === 'all'
                ? 'bg-pink-500 text-white'
                : 'bg-pink-50 text-slate-500 hover:text-slate-800'
            }`}
          >
            Semua ({records.length})
          </button>
          <button
            onClick={() => setFilter('received')}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              filter === 'received'
                ? 'bg-emerald-600 text-white'
                : 'bg-pink-50 text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
            <span>Diterima ({records.filter((r) => r.direction === 'received').length})</span>
          </button>
          <button
            onClick={() => setFilter('sent')}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              filter === 'sent'
                ? 'bg-fuchsia-600 text-white'
                : 'bg-pink-50 text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowUpRight className="w-3 h-3 text-pink-400" />
            <span>Terkirim ({records.filter((r) => r.direction === 'sent').length})</span>
          </button>
        </div>

        {/* Records List */}
        <div className="overflow-y-auto pr-1 flex-1 space-y-2">
          {filteredRecords.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Belum ada file dalam riwayat transfer.</p>
            </div>
          ) : (
            filteredRecords.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-pink-50 hover:bg-pink-100 border border-pink-200 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white border border-pink-200 flex items-center justify-center shrink-0 overflow-hidden">
                    {item.category === 'image' && item.blobUrl ? (
                      <img
                        src={item.blobUrl}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : item.category === 'video' ? (
                      <Video className="w-4 h-4 text-purple-400" />
                    ) : item.category === 'audio' ? (
                      <Music className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-pink-400" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate max-w-[220px]" title={item.fileName}>
                      {item.fileName}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span className="font-mono">{formatBytes(item.fileSize)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        {item.direction === 'received' ? (
                          <span className="text-emerald-400">Dari: {item.peerName}</span>
                        ) : (
                          <span className="text-pink-400">Ke: {item.peerName}</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {item.blobUrl && (
                    <button
                      onClick={() => setPreviewItem(item)}
                      className="p-2 rounded-xl bg-pink-50 hover:bg-pink-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                      title="Pratinjau File"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => onDownloadRecord(item)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-pink-500 hover:bg-pink-400 text-white text-xs font-semibold shadow-md transition cursor-pointer"
                    title="Unduh ke perangkat"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Unduh</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* File Preview Sub-Modal */}
        {previewItem && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md">
            <div className="relative max-w-2xl w-full bg-white border border-pink-100 rounded-3xl p-4 overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
              <div className="flex items-center justify-between pb-3 border-b border-pink-100">
                <span className="text-xs font-bold text-slate-900 truncate">
                  {previewItem.fileName}
                </span>
                <button
                  onClick={() => setPreviewItem(null)}
                  className="p-1 rounded-lg hover:bg-pink-50 text-slate-500 hover:text-slate-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 flex items-center justify-center overflow-auto my-4 min-h-60">
                {previewItem.category === 'image' && previewItem.blobUrl ? (
                  <img
                    src={previewItem.blobUrl}
                    alt={previewItem.fileName}
                    className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-xl"
                    referrerPolicy="no-referrer"
                  />
                ) : previewItem.category === 'video' && previewItem.blobUrl ? (
                  <video
                    src={previewItem.blobUrl}
                    controls
                    autoPlay
                    className="max-h-[60vh] max-w-full rounded-xl"
                  />
                ) : previewItem.category === 'audio' && previewItem.blobUrl ? (
                  <audio src={previewItem.blobUrl} controls className="w-full" />
                ) : (
                  <div className="text-center text-slate-500 text-xs">
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Pratinjau langsung tidak didukung untuk tipe file ini.</p>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-pink-100 flex justify-end">
                <button
                  onClick={() => {
                    onDownloadRecord(previewItem);
                    setPreviewItem(null);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-400 text-white text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh File ({formatBytes(previewItem.fileSize)})</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
