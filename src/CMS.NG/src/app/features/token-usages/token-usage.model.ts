/** Token sums shared by a report row and the totals row. */
export interface TokenUsageTotals {
  inputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  /** input + both cache writes + cache read (computed by the API). */
  tokenIn: number;
  /** USD; null until a model price applies. */
  cost: number | null;
}

/** Usage aggregated by (user, date, project, model). */
export interface TokenUsageReportRow extends TokenUsageTotals {
  /** `yyyy-MM-dd`, Taipei date. */
  usageDate: string;
  userId: string;
  userName: string;
  project: string;
  model: string;
}

export interface TokenUsageReport {
  items: TokenUsageReportRow[];
  totalRecords: number;
  totals: TokenUsageTotals;
}

export interface TokenUsageReportFilters {
  /** `yyyy-MM-dd`, inclusive. */
  from?: string | null;
  /** `yyyy-MM-dd`, inclusive. */
  to?: string | null;
  userId?: string | null;
  /** Contains. */
  project?: string | null;
  /** Contains. */
  model?: string | null;
}

export interface TokenUsageReportQuery extends TokenUsageReportFilters {
  first: number;
  rows: number;
  sortField: string;
  /** 1 ascending, -1 descending. */
  sortOrder: number;
}

export interface AppUserLookup {
  userId: string;
  userName: string;
}
