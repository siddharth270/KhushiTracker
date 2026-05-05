export type Platform = 'x' | 'instagram' | 'linkedin';

export interface FollowerResponse {
  x: number | null;
  instagram: number | null;
  linkedin: number | null;
  cachedAt: number;
  servedFromCache: boolean;
}

export interface PlatformConfig {
  id: Platform;
  name: string;
  handle: string;
  url: string;
  iconBg: string;
}