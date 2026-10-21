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

/** One session's filtered usage, summed over its dates and models. */
export interface TokenUsageSessionRow extends TokenUsageTotals {
  sessionId: string;
  /** /rename title, else Claude's own; null when the session has none. */
  sessionName: string | null;
  userId: string;
  userName: string;
  project: string;
  /** `yyyy-MM-dd`, earliest Taipei date in the filtered rows. */
  firstDate: string;
  /** `yyyy-MM-dd`, latest Taipei date in the filtered rows. */
  lastDate: string;
  /** Distinct models, sorted, joined with ", ". */
  models: string;
}

export interface TokenUsageReport<TRow = TokenUsageReportRow> {
  items: TRow[];
  totalRecords: number;
  totals: TokenUsageTotals;
}

export type TokenUsageSessionReport = TokenUsageReport<TokenUsageSessionRow>;

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
  /** Contains; only the session report uses it. */
  sessionName?: string | null;
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

export type PivotDimension = 'user' | 'project' | 'model' | 'date';

/** `week` is the ISO week (Monday start, Taipei dates). */
export type DateGrain = 'day' | 'week' | 'month';

export interface TokenUsagePivotQuery extends TokenUsageReportFilters {
  rowDim: PivotDimension;
  /** null: no columns, each row has only its total. */
  colDim: PivotDimension | null;
  /** Used only when an axis is `date`. */
  dateGrain: DateGrain;
}

/** One value of a pivot axis. */
export interface TokenUsagePivotHeader {
  /** UserId, project, model or the date label (`2026-10-21`, `2026-W43`, `2026-10`). */
  key: string;
  /** The user's name for a user, else the key. */
  label: string;
  /** Tooltip: the UserId for a user, a week's `Monday ~ Sunday`; otherwise null. */
  title: string | null;
}

export interface TokenUsagePivotColumn extends TokenUsagePivotHeader {
  total: TokenUsageTotals;
}

export interface TokenUsagePivotRow extends TokenUsagePivotHeader {
  /** By column key; a column without data has no entry. */
  cells: Record<string, TokenUsageTotals>;
  total: TokenUsageTotals;
}

/** Ordered by key (dates ascending); the page re-sorts by the chosen measure. */
export interface TokenUsagePivot {
  rows: TokenUsagePivotRow[];
  columns: TokenUsagePivotColumn[];
  total: TokenUsageTotals;
}
