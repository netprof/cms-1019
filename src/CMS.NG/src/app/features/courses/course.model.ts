import { CourseGroupLookup } from '../course-groups/course-group.model';
import { PartnerLookup } from '../partners/partner.model';
import { PublishStatusLookup } from '../publish-statuses/publish-status.model';

export interface Course {
  /** int IDENTITY key. */
  pkid: number;
  title: string;
  officialTitle: string | null;
  courseId: string;
  prodCourseId: string;
  friendlyUrl: string;
  displayOrder: number;
  partnerPkid: number;
  courseGroupPkid: number | null;
  publishStatusPkid: number;
  /** ISO yyyy-MM-dd */
  scheduleOn: string;
  /** ISO yyyy-MM-dd */
  scheduleOff: string;
  hour: number;
  listPrice: number;
  learningCredit: number;
  material: string | null;
  objective: string | null;
  target: string | null;
  prerequisites: string | null;
  outline: string | null;
  towardCertOrExam: string | null;
  note: string | null;
  otherInfo: string | null;
  canRepeat: boolean;
  certificationCount: number;
  jobCategoryCount: number;
  partner: PartnerLookup;
  courseGroup: CourseGroupLookup | null;
  publishStatus: PublishStatusLookup;
  /** Populated for single-record reads only. */
  certificationPkids: number[];
  /** Populated for single-record reads only. */
  jobCategoryPkids: number[];
}

export interface CourseRequest {
  pkid: number;
  title: string;
  officialTitle: string | null;
  courseId: string;
  prodCourseId: string;
  friendlyUrl: string;
  displayOrder: number;
  partnerPkid: number;
  courseGroupPkid: number | null;
  publishStatusPkid: number;
  scheduleOn: string;
  scheduleOff: string;
  hour: number;
  listPrice: number;
  learningCredit: number;
  material: string | null;
  objective: string | null;
  target: string | null;
  prerequisites: string | null;
  outline: string | null;
  towardCertOrExam: string | null;
  note: string | null;
  otherInfo: string | null;
  canRepeat: boolean;
  certificationPkids: number[];
  jobCategoryPkids: number[];
}

export interface CourseQuery {
  keyword?: string | null;
  partnerPkid?: number | null;
  courseGroupPkid?: number | null;
  publishStatusPkid?: number | null;
  canRepeat?: boolean | null;
  scheduleOnFrom?: string | null;
  scheduleOnTo?: string | null;
  scheduleOffFrom?: string | null;
  scheduleOffTo?: string | null;
}

export interface CertificationLookup {
  pkid: number;
  title: string;
  partnerPkid: number;
}

export interface JobCategoryLookup {
  pkid: number;
  description: string;
}
