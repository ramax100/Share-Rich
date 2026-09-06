import React from 'react';
import { Wifi, Zap, Smartphone, Laptop, Radio, CheckCircle, ShieldCheck, X, ArrowRight } from 'lucide-react';

interface HotspotGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotspotGuideModal: React.FC<HotspotGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      id="hotspot-guide-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-white border border-pink-100 shadow-2xl p-6 overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-pink-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Panduan Wi-Fi Direct & Hotspot Lokal
              </h3>
              <p className="text-xs text-slate-500">
                Kecepatan tinggi 5 GHz tanpa menggunakan kuota internet
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-pink-50 text-slate-400 hover:text-slate-900 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="overflow-y-auto pr-1 my-4 space-y-4">
          {/* Comparison Card: Bluetooth vs Wi-Fi */}
          <div className="p-4 rounded-2xl bg-pink-50 border border-pink-500/30">
            <h4 className="text-xs font-bold text-pink-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" />
              Perbandingan Kecepatan Frekuensi
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-pink-50 border border-pink-200">
                <span className="text-[10px] text-slate-500 block">Bluetooth Biasa</span>
                <span className="text-xs font-bold text-rose-600 mt-0.5 block">1 - 2 Mbps</span>
                <span className="text-[11px] text-slate-500 block">~0.2 MB/dtk</span>
              </div>
              <div className="p-2 rounded-xl bg-pink-50 border border-pink-200">
                <span className="text-[10px] text-slate-500 block">Wi-Fi 2.4 GHz</span>
                <span className="text-xs font-bold text-amber-600 mt-0.5 block">72 - 150 Mbps</span>
                <span className="text-[11px] text-slate-500 block">~10-18 MB/dtk</span>
              </div>
              <div className="p-2 rounded-xl bg-white border border-pink-300">
                <span className="text-[10px] text-pink-600 font-semibold block">Wi-Fi 5 GHz 🔥</span>
                <span className="text-xs font-bold text-emerald-600 mt-0.5 block">300 - 867 Mbps</span>
                <span className="text-[11px] text-pink-600 font-bold block">~40-100 MB/dtk!</span>
              </div>
            </div>
          </div>

          {/* Step-by-Step Guide */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              3 Langkah Transfer Langsung Antardua Perangkat
            </h4>

            {/* Step 1 */}
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white border border-pink-200">
              <div className="w-7 h-7 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                1
              </div>
              <div>
                <h5 className="text-xs font-bold text-slate-900">
                  Nyalakan Hotspot HP atau Gunakan Wi-Fi yang Sama
                </h5>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Di HP penerima atau pengirim, nyalakan <strong>Hotspot Portabel</strong> (pilih pita frekuensi 5 GHz di pengaturan Hotspot jika ada untuk kecepatan maksimal).
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white border border-pink-200">
              <div className="w-7 h-7 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                2
              </div>
              <div>
                <h5 className="text-xs font-bold text-slate-900">
                  Sambungkan Perangkat Kedua ke Hotspot Tersebut
                </h5>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Hubungkan HP kedua atau Laptop Anda ke nama Wi-Fi Hotspot tersebut. <em>(Tidak perlu kuota data internet aktif, koneksi murni jaringan lokal).</em>
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white border border-pink-200">
              <div className="w-7 h-7 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                3
              </div>
              <div>
                <h5 className="text-xs font-bold text-slate-900">
                  Buka Web Ini & Transfer Langsung
                </h5>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Buka aplikasi ini di kedua perangkat. Radar akan otomatis menemukan avatar perangkat Anda. Pilih file, klik Kirim, dan nikmati kecepatan transfer Wi-Fi berkecepatan tinggi!
                </p>
              </div>
            </div>
          </div>

          {/* Privacy & Zero-Cloud Benefit */}
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-[11px] text-emerald-700">
              <strong>100% Aman & Pribadi:</strong> File Anda ditransfer langsung dari chip Wi-Fi perangkat Anda ke chip Wi-Fi penerima (WebRTC P2P), tanpa pernah diunggah atau disimpan di server awan.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-pink-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-pink-500 hover:bg-pink-400 text-white font-bold text-xs shadow-lg shadow-pink-500/25 transition cursor-pointer"
          >
            Saya Mengerti, Mulai Transfer
          </button>
        </div>
      </div>
    </div>
  );
};
