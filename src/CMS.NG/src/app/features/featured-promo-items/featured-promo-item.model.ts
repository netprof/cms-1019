export interface FeaturedPromoItem {
  /** int IDENTITY key. */
  pkid: number;
  /** ISO yyyy-MM-dd */
  scheduleOn: string;
  trainingCenterPkid: number;
  /** 1–3; unique per scheduleOn + trainingCenterPkid. */
  slot: number;
  promotionPkid: number;
  topic: string;
  description: string;
  promotion: PromotionLookup;
}

export interface FeaturedPromoItemRequest {
  pkid: number;
  scheduleOn: string;
  trainingCenterPkid: number;
  slot: number;
  promotionPkid: number;
  topic: string;
  description: string;
}

export interface FeaturedPromoItemQuery {
  trainingCenterPkid?: number | null;
  /** Any ISO day of the week; the API expands it to Monday–Sunday. */
  weekOf?: string | null;
  scheduleOnFrom?: string | null;
  scheduleOnTo?: string | null;
}

export interface PromotionLookup {
  pkid: number;
  promoCode: string;
  topic: string;
  description: string;
}

export interface TrainingCenterLookup {
  pkid: number;
  name: string;
}

/** Values held by Copy and applied by Paste (client-side only). */
export interface FeaturedPromoItemClip {
  promotion: PromotionLookup;
  topic: string;
  description: string;
}

/** Slots shown per day. */
export const SLOTS = [1, 2, 3] as const;
