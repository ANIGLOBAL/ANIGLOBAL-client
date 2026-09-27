/** Model nen tang cua ANIGLOBAL — dung chung cho moi khu vuc. */

import type { RegionId } from './region.ts';

export * from './region.ts';

export interface TitleSet {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  /** Ten da dich theo @locale */
  localized?: string | null;
}

export interface Anime {
  id: string;
  region: RegionId;
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
  /** ID du lieu goc — chi noi bo, khong phai contract public */
  sourceId?: string | null;
  source?: string | null;
}

export interface Manga {
  id: string;
  region: RegionId;
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
  region: RegionId;
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
  region: RegionId;
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
  region: RegionId;
  name: string;
  /** "anime" | "manga" | "both" */
  kind: string;
  sourceId?: string | null;
}

export interface Producer {
  id: string;
  region: RegionId;
  name: string;
  kind: string;
  sourceId?: string | null;
}

export interface Relation {
  id: string;
  region: RegionId;
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

/**
 * Interface chung cho mot khu vuc. Chi ASIA co implementation that trong v1.
 * Cac khu vuc khuc ton tai o dang interface de san mo rong, khong duoc
 * chua du lieu gia lap.
 */
export interface RegionProvider {
  id: RegionId;
  getAnime(id: string): Promise<Anime | null>;
  getManga(id: string): Promise<Manga | null>;
  getCharacter(id: string): Promise<Character | null>;
  getStaff(id: string): Promise<Staff | null>;
  search(query: string, limit: number): Promise<Page<Anime | Manga>>;
}
