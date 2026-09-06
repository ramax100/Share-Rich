import React from 'react';

export const ANIME_AVATAR_PROFILES = [
  { id: 'anime:ichika', name: 'Ichika', src: '/avatars/ichika.png' },
  { id: 'anime:nino', name: 'Nino', src: '/avatars/nino.png' },
  { id: 'anime:miku', name: 'Miku', src: '/avatars/miku.png' },
  { id: 'anime:yotsuba', name: 'Yotsuba', src: '/avatars/yotsuba-v2.png' },
  { id: 'anime:itsuki', name: 'Itsuki', src: '/avatars/itsuki.png' },
] as const;

export const ANIME_AVATAR_IDS = ANIME_AVATAR_PROFILES.map((profile) => profile.id);

const PROFILE_BY_ID = Object.fromEntries(
  ANIME_AVATAR_PROFILES.map((profile) => [profile.id, profile])
) as Record<string, (typeof ANIME_AVATAR_PROFILES)[number]>;

export function getAnimeAvatarName(avatar?: string) {
  return avatar ? PROFILE_BY_ID[avatar]?.name : undefined;
}

interface AnimeAvatarProps {
  avatar?: string;
  size?: number;
  className?: string;
  title?: string;
}

export const AnimeAvatar: React.FC<AnimeAvatarProps> = ({ avatar = 'anime:ichika', size = 48, className = '', title }) => {
  const profile = PROFILE_BY_ID[avatar];

  if (!profile) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
        title={title}
      >
        🌸
      </span>
    );
  }

  return (
    <img
      src={profile.src}
      alt={title || `${profile.name} chibi avatar`}
      title={title || profile.name}
      width={size}
      height={size}
      draggable={false}
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
