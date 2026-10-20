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

/** RowAudit.PrimaryKeyValues of a price, as the API writes it: `model,yyyy-MM-dd`. */
export function modelPriceAuditKey(model: string, effectiveDate: string): string {
  return `${model},${effectiveDate}`;
}

export type ModelPriceRequest = ModelPrice;

export interface ModelPriceQuery {
  keyword?: string | null;
  /** `yyyy-MM-dd`, inclusive */
  effectiveDateFrom?: string | null;
  /** `yyyy-MM-dd`, inclusive */
  effectiveDateTo?: string | null;
}
