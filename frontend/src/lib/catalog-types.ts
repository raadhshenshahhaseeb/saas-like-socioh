export const CATALOG_COLUMNS = ["sku", "title", "price", "currency", "availability"] as const;
export type Product = Record<(typeof CATALOG_COLUMNS)[number], string>;
export type Rules = { title_prefix: string; exclude_unavailable: boolean };
export type CatalogIssue = { code: string; message: string; field?: string; row?: number; line?: number };
export type CatalogFailure = { code: string; message: string; details: CatalogIssue[]; details_truncated: boolean; run_id?: string };
export type Sample = { id: string; label: string; description: string };
export type CatalogRun = {
  id: string;
  status: "processing" | "completed" | "failed";
  source: { kind: "sample" | "upload"; sample_id?: string };
  rules: Rules;
  counts: { input: number; included: number; excluded: number } | null;
  started_at: string;
  finished_at: string | null;
  preview: { columns: string[]; rows: Product[] } | null;
  export_available: boolean;
  failure: CatalogFailure | null;
};

export const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
