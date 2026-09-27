/** Model nen tang cua ANIGLOBAL — dung chung cho ca 3 nen tang AV/AE/AC. */

import type { PlatformId } from './platform.ts';

export * from './platform.ts';

/** AV = ANIVIET (Viet Nam) | AE = ANIENG (English) | AC = Chinese */

export interface TitleSet {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  /** Ten da dich theo @locale */
  localized?: string | null;
}

export interface Anime {
  id: string;
  platform: PlatformId;
  type: 'anime' | 'movie' | 'ova' | 'special';
  title: TitleSet;
  description?: string | null;
  cover?: string | null;
  banner?: string | null;
  episodes?: number | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  format?: string | null;
  duration?: number | null;
  genres: string[];
  averageScore?: number | null;
  popularity?: number | null;
  synonyms: string[];
  /** ID nen tang goc (chi doi voi noi bo, khong phai contract public) */
  sourceId?: string | null;
  source?: string | null;
}

export interface Manga {
  id: string;
  platform: PlatformId;
  title: TitleSet;
  description?: string | null;
  cover?: string | null;
  banner?: string | null;
  chapters?: number | null;
  volumes?: number | null;
  status?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  genres: string[];
  averageScore?: number | null;
  popularity?: number | null;
  synonyms: string[];
  sourceId?: string | null;
  source?: string | null;
}

export interface Character {
  id: string;
  platform: PlatformId;
  name: string;
  nameNative?: string | null;
  romajiName?: string | null;
  alias?: string | null;
  image?: string | null;
  gender?: string | null;
  favourites?: number | null;
  age?: string | null;
  birthday?: string | null;
  bloodType?: string | null;
  height?: number | null;
  heightUnit?: string | null;
  description?: string | null;
  biography?: string | null;
  sourceId?: string | null;
  source?: string | null;
}

export interface Staff {
  id: string;
  platform: PlatformId;
  name: string;
  nameNative?: string | null;
  image?: string | null;
  occupations: string[];
  favourites?: number | null;
  description?: string | null;
  sourceId?: string | null;
  source?: string | null;
}

export interface Studio {
  id: string;
  platform: PlatformId;
  name: string;
  /** "anime" | "manga" | "both" */
  kind: string;
  sourceId?: string | null;
}

export interface Producer {
  id: string;
  platform: PlatformId;
  name: string;
  kind: string;
  sourceId?: string | null;
}

export interface Relation {
  id: string;
  platform: PlatformId;
  type: string;
  relatedId: string;
  relatedType: 'anime' | 'manga';
  title?: string | null;
  cover?: string | null;
  relation?: string | null;
  sourceId?: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
