import React from 'react';
import { Peer } from '../types';

// Map avatar id (anime:xxx) to the full-body PNG for the dueling transfer animation.
const FULL_BODY: Record<string, string> = {
  'anime:ichika': '/avatars/full/ichika.png',
  'anime:nino': '/avatars/full/nino.png',
  'anime:miku': '/avatars/full/miku.png',
  'anime:yotsuba': '/avatars/full/yotsuba.png',
  'anime:itsuki': '/avatars/full/itsuki.png',
};

function fullBodyFor(avatar?: string): string {
  if (!avatar) return '/avatars/full/ichika.png';
  return FULL_BODY[avatar] || '/avatars/full/ichika.png';
}

const SENDER_NAMES: Record<string, string> = {
  'anime:ichika': 'Ichika',
  'anime:nino': 'Nino',
  'anime:miku': 'Miku',
  'anime:yotsuba': 'Yotsuba',
  'anime:itsuki': 'Itsuki',
};

// Utility to map an anime avatar id to a friendly display name.
function displayNameFor(avatar?: string, fallback?: string): string {
  if (avatar && SENDER_NAMES[avatar]) return SENDER_NAMES[avatar];
  return fallback || 'Perangkat';
}

interface TransferDuelProps {
  sender?: Peer | null;
  receiver?: Peer | null;
  direction: 'sending' | 'receiving';
  sideLabel?: string;
}

/**
 * Fun animated "duel" shown while a transfer is in progress.
 * Renders the full-body avatars of BOTH the sender and the receiver, and a paper
 * plane that flies from the sender to the receiver repeatedly for the duration of
 * the transfer (loading). Which side is "sending" depends on `direction`.
 */
export const TransferDuel: React.FC<TransferDuelProps> = ({
  sender,
  receiver,
  direction,
  sideLabel,
}) => {
  const isSending = direction === 'sending';

  // The left peer is whoever is sending the file; right is receiving.
  const leftPeer = isSending ? sender : receiver;
  const rightPeer = isSending ? receiver : sender;

  const leftName = displayNameFor(leftPeer?.avatar, leftPeer?.name);
  const rightName = displayNameFor(rightPeer?.avatar, rightPeer?.name);
  const leftSrc = fullBodyFor(leftPeer?.avatar);
  const rightSrc = fullBodyFor(rightPeer?.avatar);

  return (
    <div
      id="transfer-duel"
      className="relative w-full flex flex-col items-center overflow-hidden rounded-[2rem] border border-pink-100 bg-white p-6"
    >
      {sideLabel && (
        <div className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-pink-400">
          {sideLabel}
        </div>
      )}

      <div className="relative flex w-full items-end justify-between gap-2 min-h-[220px] sm:min-h-[260px]">
        {/* Left peer (sender full-body) */}
        <div className="flex flex-col items-center gap-2 w-[104px] sm:w-[150px]">
          <div className="relative h-[168px] w-[104px] flex items-end justify-center sm:h-[230px] sm:w-[150px]">
            <div className="absolute inset-x-4 bottom-2 h-6 rounded-full bg-pink-500/30 blur-xl" />
            <img
              src={leftSrc}
              alt={leftName}
              className="relative max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(236,72,153,0.35)]"
              draggable={false}
            />
          </div>
          <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-[11px] font-black text-pink-600">
            {leftName}
          </span>
        </div>

        {/* Center: flying paper plane */}
        <div className="relative flex-1 h-[168px] flex items-center sm:h-[230px]">
          {/* ground glow */}
          <div className="absolute left-0 right-0 bottom-2 mx-auto h-6 w-40 rounded-full bg-pink-500/20 blur-xl" />

          {/* The plane flies left->right (sender -> receiver) repeatedly */}
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <svg
              className="absolute left-0 animate-plane-fly"
              width="52"
              height="52"
              viewBox="0 0 52 52"
              fill="none"
            >
              {/* paper plane pointing right */}
              <path
                d="M4 28 L46 12 L34 46 L26 33 Z"
                fill="url(#planeGrad)"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="1"
                strokeLinejoin="round"
              />
              <path d="M46 12 L26 33" stroke="rgba(0,0,0,0.15)" strokeWidth="1.4" />
              <defs>
                <linearGradient id="planeGrad" x1="4" y1="28" x2="46" y2="12">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#fda4af" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* dotted flight trail */}
          <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 flex items-center justify-between px-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-pink-300/40" />
            ))}
          </div>
        </div>

        {/* Right peer (receiver full-body) */}
        <div className="flex flex-col items-center gap-2 w-[104px] sm:w-[150px]">
          <div className="relative h-[168px] w-[104px] flex items-end justify-center sm:h-[230px] sm:w-[150px]">
            <div className="absolute inset-x-4 bottom-2 h-6 rounded-full bg-fuchsia-500/30 blur-xl" />
            <img
              src={rightSrc}
              alt={rightName}
              className="relative max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(217,70,239,0.35)]"
              draggable={false}
            />
          </div>
          <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-black text-fuchsia-600">
            {rightName}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes planeFly {
          0%   { left: -10%; transform: translateY(6px) rotate(-6deg); opacity: 0; }
          8%   { opacity: 1; }
          50%  { left: 50%; transform: translateY(-6px) rotate(3deg); opacity: 1; }
          92%  { opacity: 1; }
          100% { left: 105%; transform: translateY(6px) rotate(-4deg); opacity: 0; }
        }
        .animate-plane-fly {
          animation: planeFly 2.2s linear infinite;
        }
      `}</style>
    </div>
  );
};
