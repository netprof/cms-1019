export interface PublishStatus {
  /** tinyint key, user-supplied (not IDENTITY). */
  pkid: number;
  description: string;
  isDraft: boolean;
  isPublished: boolean;
  isDiscontinued: boolean;
}

export type PublishStatusRequest = PublishStatus;

export interface PublishStatusQuery {
  keyword?: string | null;
  isDraft?: boolean | null;
  isPublished?: boolean | null;
  isDiscontinued?: boolean | null;
}

export interface PublishStatusLookup {
  pkid: number;
  description: string;
}
