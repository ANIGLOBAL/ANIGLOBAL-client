/**
 * Khu vuc du lieu cua ANIGLOBAL.
 *
 * Khu vuc la cap tren cung. Ben trong mot khu vuc, ngon ngu duoc chon bang
 * directive `@locale` — vi du `@locale("vi-VN")` hay `@locale("en")`.
 *
 *   AGQL -> ASIA @locale("vi-VN") { ... }
 *
 * Chi ASIA bat trong phien ban 1, vi day la noi du lieu ANIVIET (Viet Nam)
 * dang chay. Cac khu vuc khac chi ton tai o dang interface.
 */

export type RegionId = 'ASIA';

export const ALL_REGIONS: readonly RegionId[] = ['ASIA'] as const;

export const ENABLED_REGIONS: readonly RegionId[] = ['ASIA'] as const;

export function isRegionId(s: string): s is RegionId {
  return (ALL_REGIONS as readonly string[]).includes(s.toUpperCase());
}

export function isRegionEnabled(id: RegionId): boolean {
  return (ENABLED_REGIONS as readonly string[]).includes(id);
}

export const REGION_LABEL: Record<RegionId, string> = {
  ASIA: 'Asia (ANIVIET — Viet Nam)',
};

/** Ngon ngu ho tro trong khu vuc ASIA. */
export type Locale = 'vi-VN' | 'en';

export const REGION_LOCALES: Record<RegionId, readonly Locale[]> = {
  ASIA: ['vi-VN', 'en'],
};

export const LOCALE_LABEL: Record<Locale, string> = {
  'vi-VN': 'Tieng Viet',
  en: 'English',
};

export function isLocale(s: string): s is Locale {
  return s === 'vi-VN' || s === 'en';
}

/**
 * Chuan hoa `@locale`: cho phep "vi", "vi-VN", "VI" -> "vi-VN".
 * Tra null neu khong ho tro.
 */
export function normalizeLocale(s: string): Locale | null {
  const v = s.trim().toLowerCase();
  if (v === 'vi' || v === 'vi-vn' || v === 'vi_vn') return 'vi-VN';
  if (v === 'en' || v === 'en-us' || v === 'en_us') return 'en';
  return null;
}
