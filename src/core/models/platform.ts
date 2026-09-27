/** Nen tang du lieu cua ANIGLOBAL. */

export type PlatformId = 'AV' | 'AE' | 'AC';

export const ALL_PLATFORMS: readonly PlatformId[] = ['AV', 'AE', 'AC'] as const;

/** Chi AV bat trong phien ban 1. AE/AC chi ton tai o dang interface. */
export const ENABLED_PLATFORMS: readonly PlatformId[] = ['AV'] as const;

export function isPlatformId(s: string): s is PlatformId {
  return (ALL_PLATFORMS as readonly string[]).includes(s);
}

export function isPlatformEnabled(id: PlatformId): boolean {
  return (ENABLED_PLATFORMS as readonly string[]).includes(id);
}

export const PLATFORM_LABEL: Record<PlatformId, string> = {
  AV: 'ANIVIET (Viet Nam)',
  AE: 'ANIENG (English)',
  AC: 'Chinese',
};
