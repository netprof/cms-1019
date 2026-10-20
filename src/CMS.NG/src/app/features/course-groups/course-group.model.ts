export interface CourseGroup {
  /** smallint IDENTITY key. */
  pkid: number;
  description: string;
}

export type CourseGroupRequest = CourseGroup;

export interface CourseGroupQuery {
  keyword?: string | null;
}

export interface CourseGroupLookup {
  pkid: number;
  description: string;
}
