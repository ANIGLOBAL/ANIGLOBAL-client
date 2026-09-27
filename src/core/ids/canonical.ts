/**
 * Canonical ID cua ANIGLOBAL.
 *
 * Nguon ben ngoai (slug, AniList ID, path) chi la chi tiot trien khai.
 * moi thu cong khai deu dung ID dang:
 *
 *   ag_anime_<n>
 *   ag_manga_<n>
 *   ag_character_<n>
 *   ag_staff_<n>
 *   ag_studio_<n>
 *   ag_producer_<n>
 *   ag_relation_<n>
 *
 * So thu tu la kiem soat: mot thu tu chon ID moi, khong bao gio dung lai ID cu.
 */

export type CanonicalKind = 'anime' | 'manga' | 'character' | 'staff' | 'studio' | 'producer' | 'relation';
const PREFIX: Record<CanonicalKind, string> = {
  anime: 'ag_anime_',
  manga: 'ag_manga_',
  character: 'ag_character_',
  staff: 'ag_staff_',
  studio: 'ag_studio_',
  producer: 'ag_producer_',
  relation: 'ag_relation_',
};

export function formatId(kind: CanonicalKind, n: number): string {
  return `${PREFIX[kind]}${n}`;
}

const RE = /^ag_(anime|manga|character|staff|studio|producer|relation)_(\d+)$/;

export function parseId(id: string): { kind: CanonicalKind; n: number } | null {
  const m = RE.exec(id);
  if (!m) return null;
  return { kind: m[1] as CanonicalKind, n: Number(m[2]) };
}

export function isCanonicalId(id: string): boolean {
  return RE.test(id);
}

/** Tra ve kind neu chuoi co dang canonical ID, khong phai null. */
export function kindOf(id: string): CanonicalKind | null {
  return parseId(id)?.kind ?? null;
}
