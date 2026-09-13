"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { CatalogError, downloadRun, listSamples, loadRun, processCatalog } from "@/lib/catalog-client";
import { CATALOG_COLUMNS, type CatalogFailure, type CatalogRun, type Rules, type Sample } from "@/lib/catalog-types";
import styles from "./catalog-workflow.module.css";

type Phase = "ready" | "processing" | "restoring";
type Selection = { kind: "sample" | "upload"; sampleId: string; file: File | null; rules: Rules };
const DEFAULT_RULES: Rules = { title_prefix: "", exclude_unavailable: false };
const FILE_LIMIT = 1024 * 1024;

function asFailure(cause: unknown): CatalogFailure {
  return cause instanceof CatalogError ? cause.failure : {
    code: "service_unavailable", message: "The request could not be completed. Make a new attempt.", details: [], details_truncated: false,
  };
}

function completionUncertain(failure: CatalogFailure): boolean {
  return ["database_unavailable", "deadline_exceeded", "cancelled", "request_cancelled", "service_unavailable", "internal_error"].includes(failure.code);
}

function setRunLocation(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("run", id); else url.searchParams.delete("run");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function FailurePanel({ failure, title, focus = true }: { failure: CatalogFailure; title: string; focus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [failure, focus]);
  return <div ref={ref} className={styles.error} role="alert" tabIndex={-1}>
    <h3>{title}</h3>
    <p>{failure.message}</p>
    {failure.details.length > 0 && <ul className={styles.issues}>
      {failure.details.map((issue, index) => <li key={`${issue.code}-${index}`}>
        {issue.row !== undefined && <strong>Row {issue.row}: </strong>}
        {issue.row === undefined && issue.line !== undefined && <strong>Line {issue.line}: </strong>}
        {issue.field && <strong>{issue.field}: </strong>}{issue.message}
      </li>)}
    </ul>}
    {failure.details_truncated && <p>Only the first 100 issues are shown. Correct these issues, then process the file again.</p>}
  </div>;
}

export function CatalogWorkflow({ initialRunId }: { initialRunId: string | null }) {
  const [phase, setPhase] = useState<Phase>(initialRunId ? "restoring" : "ready");
  const [sourceKind, setSourceKind] = useState<"sample" | "upload">("sample");
  const [sampleId, setSampleId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(true);
  const [sampleFailure, setSampleFailure] = useState<CatalogFailure | null>(null);
  const [run, setRun] = useState<CatalogRun | null>(null);
  const [resultSelection, setResultSelection] = useState<Selection | null>(null);
  const [failure, setFailure] = useState<CatalogFailure | null>(null);
  const [downloadFailure, setDownloadFailure] = useState<CatalogFailure | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const sampleRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const refreshSamples = useCallback(async () => {
    sampleRequest.current?.abort();
    const controller = new AbortController();
    sampleRequest.current = controller;
    setSamplesLoading(true);
    setSampleFailure(null);
    try {
      const available = await listSamples(controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      setSamples(available);
      setSampleId((previous) => previous || available[0]?.id || "");
      if (!available.length) setSampleFailure({ code: "source_unavailable", message: "No sample is available. You can upload a supported CSV or try loading samples again.", details: [], details_truncated: false });
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setSampleFailure(asFailure(cause));
    } finally {
      if (!controller.signal.aborted && mounted.current) setSamplesLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshSamples();
    if (initialRunId) {
      const controller = new AbortController();
      activeRequest.current = controller;
      void loadRun(initialRunId, controller.signal).then((saved) => {
        if (controller.signal.aborted) return;
        setRun(saved);
        setSourceKind(saved.source.kind);
        setSampleId((current) => saved.source.sample_id ?? current);
        setRules(saved.rules);
        setResultSelection({ kind: saved.source.kind, sampleId: saved.source.sample_id ?? "", file: null, rules: saved.rules });
        if (saved.status === "failed" && saved.failure) setFailure(saved.failure);
        setAnnouncement(saved.status === "completed" ? "Saved catalog result loaded." : "The saved run has no completed output.");
      }).catch((cause) => { if (!controller.signal.aborted) setFailure(asFailure(cause)); })
        .finally(() => { if (!controller.signal.aborted) setPhase("ready"); });
    }
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
      sampleRequest.current?.abort();
    };
  }, [initialRunId, refreshSamples]);

  const prefixLength = Array.from(rules.title_prefix).length;
  const selectionError = file && file.size > FILE_LIMIT ? "Choose a CSV no larger than 1 MiB." : null;
  const serverPrefixError = failure?.details.find((issue) => issue.field === "title_prefix")?.message;
  const prefixError = prefixLength > 64 ? "Use no more than 64 characters for the title prefix." : serverPrefixError ?? null;
  const busy = phase !== "ready" || downloading;
  const sourceReady = sourceKind === "sample" ? Boolean(sampleId && !samplesLoading && !sampleFailure) : Boolean(file && !selectionError);
  const stale = Boolean(run?.status === "completed" && resultSelection && (
    resultSelection.kind !== sourceKind ||
    (sourceKind === "sample" && resultSelection.sampleId !== sampleId) ||
    (sourceKind === "upload" && resultSelection.file !== file) ||
    resultSelection.rules.title_prefix !== rules.title_prefix || resultSelection.rules.exclude_unavailable !== rules.exclude_unavailable
  ));
  const uncertainFailure = Boolean(failure && completionUncertain(failure) && run?.status !== "failed");

  function editPrefix(value: string) {
    setRules((previous) => ({ ...previous, title_prefix: value }));
    setFailure((previous) => {
      if (!previous?.details.some((issue) => issue.field === "title_prefix")) return previous;
      const remaining = previous.details.filter((issue) => issue.field !== "title_prefix");
      return remaining.length === 0 ? null : { ...previous, details: remaining };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !sourceReady || prefixError) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const captured: Selection = { kind: sourceKind, sampleId, file, rules: { ...rules } };
    setRun(null);
    setResultSelection(null);
    setFailure(null);
    setDownloadFailure(null);
    setRunLocation(null);
    setPhase("processing");
    setAnnouncement("Processing catalog. Please wait.");
    try {
      const source = captured.kind === "sample" ? { sampleId: captured.sampleId } : { file: captured.file! };
      const result = await processCatalog(source, captured.rules, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      setRun(result);
      setResultSelection(captured);
      setRunLocation(result.id);
      if (result.status === "failed" && result.failure) {
        setFailure(result.failure);
        setAnnouncement("Catalog processing failed. Review the error.");
      } else {
        setAnnouncement(result.status === "completed" ? `Catalog completed. ${result.counts?.included ?? 0} products included.` : "The catalog has no completed output yet.");
      }
    } catch (cause) {
      if (controller.signal.aborted || !mounted.current) return;
      const detail = asFailure(cause);
      setFailure(detail);
      setAnnouncement(completionUncertain(detail)
        ? "Completion could not be confirmed. No confirmed result is shown for this attempt."
        : "Catalog processing did not complete. Review the error and make a new attempt.");
    } finally {
      if (!controller.signal.aborted && mounted.current) setPhase("ready");
    }
  }

  async function download(event: MouseEvent<HTMLAnchorElement>) {
    if (!busy && run?.export_available && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    event.preventDefault();
    if (busy || !run?.export_available) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setDownloading(true);
    setDownloadFailure(null);
    try {
      const blob = await downloadRun(run.id, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "catalog-output.csv";
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAnnouncement("The completed CSV download is ready.");
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setDownloadFailure(asFailure(cause));
    } finally {
      if (!controller.signal.aborted && mounted.current) setDownloading(false);
    }
  }

  return <>
    <a className={styles.skipLink} href="#catalog-main">Skip to catalog</a>
    <main id="catalog-main" className={styles.page} tabIndex={-1}>
      <header className={styles.header}>
        <div><h1>Catalog workbench</h1><p>Validate product data, apply two rules, and download the result.</p></div>
        <span className={styles.workspace}>Demo workspace</span>
      </header>
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      <div className={styles.workbench}>
        <form className={styles.controls} onSubmit={submit} aria-label="Catalog settings">
          <fieldset disabled={busy}>
            <legend>Catalog source</legend>
            <label className={styles.choice}><input type="radio" name="source" value="sample" checked={sourceKind === "sample"} onChange={() => { setSourceKind("sample"); setFile(null); }} />Use sample</label>
            <label className={styles.choice}><input type="radio" name="source" value="upload" checked={sourceKind === "upload"} onChange={() => setSourceKind("upload")} />Upload CSV</label>
            {sourceKind === "sample" ? <div className={styles.sourceDetails}>
              {samplesLoading ? <p>Loading samples…</p> : sampleFailure ? <>
                <FailurePanel failure={sampleFailure} title="Samples unavailable" focus={false} />
                <button className={styles.secondaryButton} type="button" onClick={() => void refreshSamples()}>Load samples again</button>
              </> : <>
                <label htmlFor="sample-choice">Sample catalog</label>
                <select id="sample-choice" name="sample_id" value={sampleId} onChange={(event) => setSampleId(event.target.value)}>
                  {samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}
                </select>
                <p className={styles.helper}>{samples.find((sample) => sample.id === sampleId)?.description}</p>
              </>}
            </div> : <div className={styles.sourceDetails}>
              <label htmlFor="catalog-file">CSV file</label>
              <input id="catalog-file" name="file" type="file" accept=".csv,text/csv" aria-describedby="upload-help file-feedback" aria-invalid={Boolean(selectionError)} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <p id="file-feedback" className={selectionError ? styles.fieldError : styles.helper} role={selectionError ? "alert" : undefined}>{selectionError ?? (file ? "CSV selected. Product values will be validated when you process it." : "Choose a file to begin.")}</p>
            </div>}
            <p id="upload-help" className={styles.helper}>Use synthetic product data only. Up to 1 MiB and 1,000 products.</p>
            <details className={styles.formatHelp}><summary>Supported CSV format</summary><p>Required headers, in any order:</p><code>sku,title,price,currency,availability</code><p>Use a decimal price, a three-letter uppercase currency, and availability <code>in_stock</code> or <code>out_of_stock</code>.</p></details>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Output rules</legend>
            <label htmlFor="title-prefix">Title prefix</label>
            <input id="title-prefix" name="title_prefix" type="text" value={rules.title_prefix} autoComplete="off" spellCheck={false} aria-describedby={`prefix-help prefix-count${prefixError ? " prefix-error" : ""}`} aria-invalid={Boolean(prefixError)} onChange={(event) => editPrefix(event.target.value)} />
            <div className={styles.prefixMeta}><p id="prefix-help" className={styles.helper}>Added once to each original title. Spaces are kept.</p><span id="prefix-count" className={prefixError ? styles.fieldError : styles.helper}>{prefixLength}/64</span></div>
            {prefixError && <p id="prefix-error" className={styles.fieldError} role="alert">{prefixError}</p>}
            <label className={styles.choice}><input type="checkbox" name="exclude_unavailable" checked={rules.exclude_unavailable} onChange={(event) => setRules((previous) => ({ ...previous, exclude_unavailable: event.target.checked }))} />Exclude unavailable products</label>
            <p className={styles.helper}>Every row is validated before this rule excludes products.</p>
          </fieldset>
          <button className={styles.primaryButton} type="submit" disabled={busy || !sourceReady || Boolean(prefixError)}>{phase === "processing" ? "Processing catalog…" : "Process catalog"}</button>
        </form>
        <section className={styles.results} aria-labelledby="result-heading" aria-busy={phase !== "ready"}>
          <div className={styles.resultHeader}><h2 id="result-heading">Catalog result</h2>{run?.status === "completed" && <span className={styles.completed}>Completed</span>}</div>
          {phase !== "ready" ? <div className={styles.emptyState}><span className={styles.progress} aria-hidden="true" /><h3>{phase === "restoring" ? "Loading saved result…" : "Processing catalog…"}</h3><p>{phase === "restoring" ? "Retrieving the completed rows and their saved settings." : "Your catalog is being validated and processed. This may take up to 30 seconds."}</p></div> : failure ? <>
            <FailurePanel failure={failure} title={uncertainFailure ? "Completion could not be confirmed" : failure.code === "validation_error" || failure.code === "input_limit" ? "Catalog needs attention" : "Catalog could not be completed"} />
            <p className={styles.helper}>{uncertainFailure
              ? "No confirmed result is shown for this attempt. A result may have been saved; a new submission starts a separate run."
              : "No completed output is available for this attempt. Update your input or settings, then process again."}</p>
          </> : run?.status === "completed" && run.preview && run.counts ? <>
            <p className={styles.resultMeta}>Source: {run.source.kind === "sample" ? "sample catalog" : "uploaded CSV"}. Saved prefix: <span className={styles.literal}>{run.rules.title_prefix ? `“${run.rules.title_prefix}”` : "none"}</span>. Exclusion: {run.rules.exclude_unavailable ? "on" : "off"}.</p>
            {stale && <p className={styles.notice} role="status">This result uses your previous settings. Process again to apply your changes.</p>}
            <dl className={styles.counts}>
              <div><dt>Input products</dt><dd data-testid="summary-input">{run.counts.input}</dd></div>
              <div><dt>Included</dt><dd data-testid="summary-included">{run.counts.included}</dd></div>
              <div><dt>Excluded</dt><dd data-testid="summary-excluded">{run.counts.excluded}</dd></div>
            </dl>
            <div className={styles.downloadBar}><p className={styles.helper}>The CSV contains these completed output rows, in this order.</p>{run.export_available && <a className={styles.download} href={`/api/catalog/runs/${run.id}/export`} onClick={download} aria-disabled={busy}>{downloading ? "Preparing download…" : "Download CSV"}</a>}</div>
            {downloadFailure && <FailurePanel failure={downloadFailure} title="Download unavailable" />}
            {run.preview.rows.length === 0 && <p className={styles.notice}>All products were excluded by the availability rule. The CSV contains the header only.</p>}
            <div className={styles.tableContainer} tabIndex={0} role="region" aria-label="Scrollable catalog output">
              <table><caption>Completed catalog output</caption><thead><tr>{CATALOG_COLUMNS.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>
                {run.preview.rows.map((product) => <tr key={product.sku}>{CATALOG_COLUMNS.map((column) => <td key={column} className={column === "title" ? styles.titleCell : column === "price" ? styles.priceCell : undefined}>{product[column]}</td>)}</tr>)}
              </tbody></table>
            </div>
          </> : run?.status === "processing" ? <div className={styles.emptyState}><h3>No completed output yet</h3><p>This saved run is still marked as processing. Refresh to check its recorded outcome; a new submission starts a separate attempt.</p></div> : <div className={styles.emptyState}><h3>Your output will appear here</h3><p>Choose the sample or upload a CSV, set your rules, and process the catalog. You can review the full result before downloading.</p><div className={styles.flow} aria-hidden="true"><span>Source</span><span>Rules</span><span>CSV output</span></div></div>}
        </section>
      </div>
    </main>
  </>;
}
