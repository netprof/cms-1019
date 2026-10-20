/** One change in a record's audit history, from `GET /api/rowaudit`. */
export interface RowAuditRecord {
  /** UTC without an offset: append `Z` before formatting. */
  dateTime: string;
  userName: string;
  /** `Insert` | `Update` | `Delete`. */
  actionType: string;
  /** Insert/Delete: the record's first text field; Update: the changed field names. */
  actionDesc: string | null;
}

/** A history row of one of several records, from `POST /api/rowaudit/query`. */
export interface RowAuditKeyedRecord extends RowAuditRecord {
  primaryKeyValues: string;
}
