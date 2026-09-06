import React, { useRef, useState, useLayoutEffect } from 'react';
import { Loader2, Check, Wifi } from 'lucide-react';
import { Peer } from '../types';
import { AnimeAvatar } from './AnimeAvatar';

interface RadarVisualProps {
  currentPeer: Peer;
  peers: Peer[];
  selectedPeer: Peer | null;
  connectedPeerIds: string[];
  connectingPeerIds: string[];
}

// Simple deterministic PRNG so each device gets a STABLE position (no jitter on re-render,
// no movement over time, and — crucially — no swapping between avatars on re-order).
const hashString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

// Fractional ring radii (0..1 of the container's half-size) so avatars always fit inside the
// radar — scaled down on narrow phones, scaled up on large screens. No more edge clipping.
const RING_FRACS = [0.44, 0.66, 0.88];

// Golden-angle spread (137.5°) + alternating radius gives even, non-overlapping spacing.
// A tiny per-peer angle jitter keeps it looking organically scattered. `seed` is derived
// from the peer id, never from the array index.
const positionFor = (seed: number, index: number, half: number) => {
  const jitter = (seed % 12) - 6; // -6..6 degrees
  const angle = (index * 137.508 + jitter) * (Math.PI / 180);
  const r = RING_FRACS[index % RING_FRACS.length] * half;
  return { x: Math.round(Math.cos(angle) * r), y: Math.round(Math.sin(angle) * r) };
};

// Decorative, non-interactive radar. Avatars sit at RANDOM but FIXED positions, are all the
// SAME size, and have transparent backgrounds. Peers are sorted deterministically by id hash
// so the layout never changes on re-discover / re-order.
export const RadarVisual: React.FC<RadarVisualProps> = ({
  currentPeer,
  peers,
  selectedPeer,
  connectedPeerIds = [],
  connectingPeerIds = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  // Track the container's actual box so avatar positions scale proportionally on any screen.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize(Math.min(r.width, r.height));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const half = Math.max(0, size / 2);
  const avatarSize = Math.round(Math.min(52, Math.max(40, half * 0.24)));

  // Deterministic, stable ordering keyed ONLY on peer.id: this keeps every avatar locked to
  // its own position even when the peers array reorders (fixes Nino<->Ichika "swap").
  const sortedPeers = React.useMemo(
    () => [...peers].sort((a, b) => hashString(a.id) - hashString(b.id)),
    [peers]
  );

  return (
    <div
      ref={containerRef}
      className="relative flex aspect-square max-h-[440px] w-full items-center justify-center overflow-hidden rounded-[2rem] border border-pink-100 bg-white shadow-inner shadow-pink-100/60"
    >
      {/* Rings + crosshair (solid pink, no gradient) */}
      <div className="absolute h-36 w-36 rounded-full border border-pink-200/70" />
      <div className="absolute h-56 w-56 rounded-full border border-pink-200/50" />
      <div className="absolute h-80 w-80 rounded-full border border-pink-200/40" />
      <div className="absolute h-px w-full bg-pink-200/50" />
      <div className="absolute h-full w-px bg-pink-200/50" />

      {/* Sweeping radar beam (solid pink, no gradient) */}
      <div className="absolute left-1/2 top-1/2 h-1/2 w-[2px] origin-top animate-[spin_4s_linear_infinite] rounded-full bg-pink-400/70" />

      {/* Center: current device (no pink glow, same avatar size) */}
      <div className="relative z-10 flex flex-col items-center text-center">
        <AnimeAvatar avatar={currentPeer.avatar} size={avatarSize} className="relative" />
        <p className="mt-1.5 max-w-[140px] truncate text-xs font-black text-slate-900 sm:text-sm">
          {currentPeer.name}
        </p>
        <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-bold text-pink-500">
          <Wifi className="h-3 w-3" /> Perangkat ini siap
        </p>
      </div>

      {/* Connected/selected devices — random but fixed, well-spaced, same size, transparent */}
      {sortedPeers.map((peer, idx) => {
        const isConnected = connectedPeerIds.includes(peer.id);
        const isConnecting = connectingPeerIds.includes(peer.id) && !isConnected;
        const pos = positionFor(hashString(peer.id), idx, half);

        return (
          <div
            key={peer.id}
            id={`radar-visual-peer-${peer.id}`}
            className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex flex-col items-center text-center"
            style={{ transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)` }}
          >
            <div className="relative flex flex-col items-center">
              {/* Transparent avatar — no background box, no pink glow */}
              <AnimeAvatar
                avatar={peer.avatar}
                size={avatarSize}
                className="relative drop-shadow-[0_6px_16px_rgba(0,0,0,0.35)]"
              />
              {isConnected && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-slate-950">
                  <Check className="h-2.5 w-2.5" strokeWidth={4} />
                </span>
              )}
              {isConnecting && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-slate-950">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" strokeWidth={3} />
                </span>
              )}
              <span className="mt-1 max-w-[70px] truncate text-[10px] font-black text-slate-900 sm:max-w-[80px] sm:text-[11px]">
                {peer.name}
              </span>
              {isConnected && (
                <span className="mt-0.5 text-[10px] font-bold text-emerald-600">
                  Terhubung
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Empty hint */}
      {peers.length === 0 && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-2xl border border-pink-100 bg-white/95 px-4 py-3.5 text-center shadow-lg shadow-pink-100/50 backdrop-blur-md">
          <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-pink-100 text-pink-500 ring-1 ring-pink-200">
            <Wifi className="h-4 w-4" />
          </div>
          <p className="text-xs font-black text-slate-900">Menunggu perangkat terhubung</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Buka tab <strong className="text-pink-500">Terima</strong>, scan QR atau masukkan PIN
            penerima, lalu perangkat akan muncul di radar ini.
          </p>
        </div>
      )}
    </div>
  );
};
