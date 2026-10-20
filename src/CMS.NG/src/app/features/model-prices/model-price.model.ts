/** Claude model prices in USD per million tokens. Key: (model, effectiveDate). */
export interface ModelPrice {
  model: string;
  /** `yyyy-MM-dd` */
  effectiveDate: string;
  inputPrice: number;
  cacheWrite5mPrice: number;
  cacheWrite1hPrice: number;
  cacheReadPrice: number;
  outputPrice: number;
}

export type ModelPriceRequest = ModelPrice;

export interface ModelPriceQuery {
  keyword?: string | null;
  /** `yyyy-MM-dd`, inclusive */
  effectiveDateFrom?: string | null;
  /** `yyyy-MM-dd`, inclusive */
  effectiveDateTo?: string | null;
}
