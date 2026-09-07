import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, Video as VideoIcon, Music, FileText, Package, X, Send, Trash2, Sparkles } from 'lucide-react';
import { FileItem, FileCategory, Peer } from '../types';
import { formatBytes, detectFileCategory, generateId } from '../utils/helpers';
import { AnimeAvatar } from './AnimeAvatar';

interface FilePickerProps {
  selectedPeer: Peer | null;
  selectedFiles: FileItem[];
  onAddFiles: (files: FileItem[]) => void;
  onRemoveFile: (fileId: string) => void;
  onClearFiles: () => void;
  onStartTransfer: () => void;
  onOpenRadar: () => void;
}

export const FilePicker: React.FC<FilePickerProps> = ({
  selectedPeer,
  selectedFiles,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onStartTransfer,
  onOpenRadar,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (files: File[]) => {
    const newItems: FileItem[] = files.map((file) => {
      const category = detectFileCategory(file.name, file.type);
      return {
        id: generateId(),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        category,
        file,
        previewUrl: category === 'image' && file.size < 15 * 1024 * 1024 ? URL.createObjectURL(file) : undefined,
        status: 'pending',
      };
    });
    onAddFiles(newItems);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleLoadSampleFiles = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 1200, 800);
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(1, '#4f46e5');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 800);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 52px sans-serif';
      ctx.fillText('Share Rich P2P', 80, 360);
      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#bae6fd';
      ctx.fillText('File sampel untuk tes transfer', 80, 430);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const sampleImage = new File([blob], 'Sample_ShareRich.jpg', { type: 'image/jpeg' });
      const sampleDoc = new File(['Share Rich - file tes transfer P2P'], 'Catatan_Tes.txt', { type: 'text/plain' });
      processFiles([sampleImage, sampleDoc]);
    }, 'image/jpeg', 0.9);
  };

  const totalSelectedSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const getCategoryIcon = (cat: FileCategory) => {
    switch (cat) {
      case 'image': return <ImageIcon className="h-4 w-4 text-pink-500" />;
      case 'video': return <VideoIcon className="h-4 w-4 text-purple-500" />;
      case 'audio': return <Music className="h-4 w-4 text-pink-500" />;
      case 'document': return <FileText className="h-4 w-4 text-fuchsia-500" />;
      case 'app': return <Package className="h-4 w-4 text-amber-500" />;
      default: return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div id="file-picker-container" className="w-full space-y-4">
      <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />

      {selectedPeer && (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-cyan-200 bg-cyan-50 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center text-2xl"><AnimeAvatar avatar={selectedPeer.avatar} size={40} /></div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-600">Penerima aktif</p>
              <p className="truncate text-sm font-black text-slate-900">{selectedPeer.name}</p>
            </div>
          </div>
          <button onClick={onOpenRadar} className="rounded-2xl border border-cyan-200 bg-white px-3 py-2 text-xs font-black text-cyan-600 transition hover:bg-cyan-50">
            Ganti
          </button>
        </div>
      )}

      <div
        id="drop-zone"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) processFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative overflow-hidden rounded-[2rem] border-2 border-dashed p-5 text-center transition active:scale-[0.99] sm:p-7 ${
          isDragging ? 'border-pink-300 bg-pink-50' : 'border-pink-200 bg-white hover:border-pink-400 hover:bg-pink-50/40'
        }`}
      >
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-pink-500 text-white shadow-xl shadow-pink-200 transition group-hover:scale-105">
          <Upload className="h-8 w-8" />
        </div>
        <h3 className="relative mt-4 text-lg font-black text-slate-900">Pilih file untuk dikirim</h3>
        <p className="relative mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          Foto, video, dokumen, ZIP, APK, dan file lain. Transfer langsung P2P tanpa menyimpan file di server.
        </p>
        <div className="relative mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button type="button" className="pointer-events-none rounded-2xl bg-pink-500 px-5 py-3 text-xs font-black text-white shadow-lg shadow-pink-200">
            Jelajahi File
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleLoadSampleFiles(); }}
            className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 transition hover:bg-pink-50"
          >
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Contoh Tes</span>
          </button>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="rounded-[2rem] border border-pink-100 bg-white p-4 shadow-lg shadow-pink-100/40">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-pink-100 pb-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-slate-900">{selectedFiles.length} file siap dikirim</h3>
              <p className="text-xs font-mono text-pink-500">Total {formatBytes(totalSelectedSize)}</p>
            </div>
            <button onClick={onClearFiles} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-500 transition hover:bg-rose-100">
              <Trash2 className="h-3.5 w-3.5" /> Hapus
            </button>
          </div>

          <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {selectedFiles.map((file) => (
              <div key={file.id} id={`selected-file-${file.id}`} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-2.5 transition hover:bg-pink-50">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                  {file.previewUrl ? <img src={file.previewUrl} alt={file.name} className="h-full w-full object-cover" /> : getCategoryIcon(file.category)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900" title={file.name}>{file.name}</p>
                  <p className="mt-0.5 text-[11px] font-mono text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <button onClick={() => onRemoveFile(file.id)} className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500" title="Hapus file">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-[1.75rem] border border-pink-200 bg-white/95 p-3 shadow-xl shadow-pink-100 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 px-1">
            <p className="text-sm font-black text-slate-900">{formatBytes(totalSelectedSize)} siap dikirim</p>
            <p className="truncate text-xs text-slate-500">
              {selectedPeer ? `Tujuan: ${selectedPeer.name}` : 'Pilih penerima di Radar terlebih dahulu'}
            </p>
          </div>
          {!selectedPeer ? (
            <button id="select-target-peer-btn" onClick={onOpenRadar} className="rounded-2xl bg-pink-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:bg-pink-400">
              Pilih Penerima
            </button>
          ) : (
            <button id="confirm-send-files-btn" onClick={onStartTransfer} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:bg-pink-400 active:scale-95">
              <Send className="h-4 w-4" /> Kirim File
            </button>
          )}
        </div>
      )}
    </div>
  );
};
