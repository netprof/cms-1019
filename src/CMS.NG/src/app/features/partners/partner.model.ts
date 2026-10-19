export interface Partner {
  /** smallint IDENTITY key. */
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}

export type PartnerRequest = Partner;

export interface PartnerQuery {
  keyword?: string | null;
}

export interface PartnerLookup {
  pkid: number;
  name: string;
}
