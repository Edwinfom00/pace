"use client";

import { useMemo, useRef, useState } from "react";

import { FinanceNavigation } from "@/app/components/finance-navigation";
import {
  IMPORT_FIELDS,
  type ImportMapping,
  type ImportMappingDraft,
  type ImportPreview,
  type ImportResult,
  type ImportSessionStatus,
  type NormalizedImportRow,
} from "@/modules/imports/domain";
import { getTranslations, type MessageKey, type SupportedLanguage } from "@/i18n/messages";

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; kind: "EXPENSE" | "INCOME" };

interface ClientImportSession {
  id: string;
  status: ImportSessionStatus;
  headers: string[];
  preview: ImportPreview | null;
  result: ImportResult | null;
}

interface UploadResponse {
  session: ClientImportSession;
  mappingDraft: ImportMappingDraft;
  rows: NormalizedImportRow[];
}

export function ImportDashboard({
  accounts,
  categories,
  language,
  workspaceId,
}: {
  accounts: readonly Account[];
  categories: readonly Category[];
  language: SupportedLanguage;
  workspaceId: string | null;
}) {
  const t = getTranslations(language);
  const fileInput = useRef<HTMLInputElement>(null);
  const expenseCategories = useMemo(() => categories.filter((category) => category.kind === "EXPENSE"), [categories]);
  const incomeCategories = useMemo(() => categories.filter((category) => category.kind === "INCOME"), [categories]);
  const [session, setSession] = useState<ClientImportSession | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(() => initialMapping(accounts, expenseCategories, incomeCategories));
  const [rows, setRows] = useState<NormalizedImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const upload = async () => {
    if (!workspaceId || !fileInput.current?.files?.[0]) return;
    setBusy(true);
    setError(false);
    try {
      const data = new FormData();
      data.set("file", fileInput.current.files[0]);
      const response = await fetch(`/api/workspaces/${workspaceId}/imports`, { method: "POST", body: data });
      if (!response.ok) throw new Error("upload_failed");
      const payload = await response.json() as UploadResponse;
      setSession(payload.session);
      setRows(payload.rows);
      setMapping(mappingForDraft(payload.mappingDraft, accounts, expenseCategories, incomeCategories));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const prepare = async () => {
    if (!workspaceId || !session) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/imports/${session.id}/mapping`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      if (!response.ok) throw new Error("mapping_failed");
      const payload = await response.json() as Pick<UploadResponse, "session" | "rows">;
      setSession(payload.session);
      setRows(payload.rows);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const requestApproval = async () => {
    if (!workspaceId || !session) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/imports/${session.id}/approval`, { method: "POST" });
      if (!response.ok) throw new Error("approval_failed");
      const payload = await response.json() as Pick<UploadResponse, "session">;
      setSession(payload.session);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!workspaceId || !session) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/imports/${session.id}/execute`, { method: "POST" });
      if (!response.ok) throw new Error("execute_failed");
      const payload = await response.json() as Pick<UploadResponse, "session">;
      setSession(payload.session);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!workspaceId || !session) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/imports/${session.id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("cancel_failed");
      const payload = await response.json() as Pick<UploadResponse, "session">;
      setSession(payload.session);
      setRows([]);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const setColumn = (field: typeof IMPORT_FIELDS[number], header: string) => {
    setMapping((current) => ({
      ...current,
      columns: { ...current.columns, [field]: header || undefined },
    }));
  };

  const canStart = Boolean(workspaceId && accounts.length && expenseCategories.length && incomeCategories.length);
  const canMap = session?.status === "MAPPING_REQUIRED" || session?.status === "READY_FOR_PREVIEW" || session?.status === "PARTIALLY_COMPLETED";
  const preview = session?.preview;

  return (
    <main className="finance-shell">
      <FinanceNavigation active="imports" language={language} />
      <section className="finance-content import-content" aria-label={t("imports.title")}>
        <header className="finance-page-header">
          <div>
            <p className="finance-kicker">{t("brand.name")}</p>
            <h1>{t("imports.title")}</h1>
            <p>{t("imports.subtitle")}</p>
          </div>
          {session ? <span className="finance-chip">{t(`imports.status.${session.status}` as MessageKey)}</span> : null}
        </header>

        {error ? <p className="finance-error">{t("imports.error")}</p> : null}
        {!workspaceId ? <p className="finance-empty">{t("imports.noWorkspace")}</p> : null}
        {workspaceId && !canStart ? <p className="finance-empty">{t("imports.noLedgerSetup")}</p> : null}

        {!session && canStart ? (
          <section className="import-panel" aria-label={t("imports.upload")}>
            <h2>{t("imports.upload")}</h2>
            <p>{t("imports.uploadHint")}</p>
            <label className="import-field">
              <span>{t("imports.file")}</span>
              <input accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ref={fileInput} type="file" />
            </label>
            <button disabled={busy} onClick={() => void upload()} type="button">
              {busy ? t("imports.loading") : t("imports.start")}
            </button>
          </section>
        ) : null}

        {session && canMap ? (
          <section className="import-panel" aria-label={t("imports.mapping")}>
            <h2>{t("imports.mapping")}</h2>
            <p>{t("imports.mappingHint")}</p>
            <div className="import-mapping-grid">
              {IMPORT_FIELDS.map((field) => (
                <label className="import-field" key={field}>
                  <span>{t(`imports.field.${field}` as MessageKey)}</span>
                  <select onChange={(event) => setColumn(field, event.target.value)} value={mapping.columns[field] ?? ""}>
                    <option value="">{t("imports.unmapped")}</option>
                    {session.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>
              ))}
              <label className="import-field">
                <span>{t("imports.account")}</span>
                <select onChange={(event) => setMapping((current) => ({ ...current, accountId: event.target.value }))} value={mapping.accountId}>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
                </select>
              </label>
              <label className="import-field">
                <span>{t("imports.expenseCategory")}</span>
                <select onChange={(event) => setMapping((current) => ({ ...current, defaultExpenseCategoryId: event.target.value }))} value={mapping.defaultExpenseCategoryId}>
                  {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="import-field">
                <span>{t("imports.incomeCategory")}</span>
                <select onChange={(event) => setMapping((current) => ({ ...current, defaultIncomeCategoryId: event.target.value }))} value={mapping.defaultIncomeCategoryId}>
                  {incomeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="import-field">
                <span>{t("imports.transferAccount")}</span>
                <select onChange={(event) => setMapping((current) => ({ ...current, transferAccountId: event.target.value || null }))} value={mapping.transferAccountId ?? ""}>
                  <option value="">{t("imports.noTransferAccount")}</option>
                  {accounts.filter((account) => account.id !== mapping.accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="import-field">
                <span>{t("imports.amountMode")}</span>
                <select onChange={(event) => setMapping((current) => ({ ...current, amountMode: event.target.value as ImportMapping["amountMode"] }))} value={mapping.amountMode}>
                  <option value="SIGNED">{t("imports.signed")}</option>
                  <option value="DEBIT_CREDIT">{t("imports.debitCredit")}</option>
                </select>
              </label>
              {mapping.amountMode === "SIGNED" ? <label className="import-field">
                <span>{t("imports.signConvention")}</span>
                <select onChange={(event) => setMapping((current) => ({ ...current, signedAmountDirection: event.target.value || null } as ImportMapping))} value={mapping.signedAmountDirection ?? ""}>
                  <option value="">{t("imports.signUnset")}</option>
                  <option value="POSITIVE_IS_INCOME">{t("imports.positiveIncome")}</option>
                  <option value="POSITIVE_IS_EXPENSE">{t("imports.positiveExpense")}</option>
                </select>
              </label> : null}
              <label className="import-field">
                <span>{t("imports.dateFormat")}</span>
                <select onChange={(event) => setMapping((current) => ({ ...current, dateFormat: event.target.value as ImportMapping["dateFormat"] }))} value={mapping.dateFormat}>
                  <option value="AUTO">{t("imports.dateAuto")}</option>
                  <option value="YMD">{t("imports.dateYmd")}</option>
                  <option value="DMY">{t("imports.dateDmy")}</option>
                  <option value="MDY">{t("imports.dateMdy")}</option>
                </select>
              </label>
              <label className="import-field">
                <span>{t("imports.decimal")}</span>
                <select onChange={(event) => setMapping((current) => ({ ...current, decimalSeparator: event.target.value as ImportMapping["decimalSeparator"] }))} value={mapping.decimalSeparator}>
                  <option value="AUTO">{t("imports.decimalAuto")}</option>
                  <option value=".">.</option>
                  <option value=",">,</option>
                </select>
              </label>
            </div>
            <div className="import-actions">
              <button disabled={busy} onClick={() => void prepare()} type="button">{busy ? t("imports.loading") : t("imports.prepare")}</button>
              <button className="finance-secondary-button" disabled={busy} onClick={() => void cancel()} type="button">{t("imports.cancel")}</button>
            </div>
          </section>
        ) : null}

        {session && preview ? <Preview t={t} preview={preview} rows={rows} /> : null}

        {session?.status === "READY_FOR_PREVIEW" ? <section className="import-panel import-approval" aria-label={t("imports.approval")}>
          <h2>{t("imports.approval")}</h2>
          <p>{t("imports.approvalHint")}</p>
          <div className="import-actions">
            <button disabled={busy} onClick={() => void requestApproval()} type="button">{busy ? t("imports.loading") : t("imports.requestApproval")}</button>
            <button className="finance-secondary-button" disabled={busy} onClick={() => void cancel()} type="button">{t("imports.cancel")}</button>
          </div>
        </section> : null}

        {session?.status === "AWAITING_APPROVAL" ? <section className="import-panel import-approval" aria-label={t("imports.approval")}>
          <h2>{t("imports.approval")}</h2>
          <p>{t("imports.approvalHint")}</p>
          <div className="import-actions">
            <button disabled={busy} onClick={() => void execute()} type="button">{busy ? t("imports.loading") : t("imports.approve")}</button>
            <button className="finance-secondary-button" disabled={busy} onClick={() => void cancel()} type="button">{t("imports.cancel")}</button>
          </div>
        </section> : null}

        {session?.result ? <Result t={t} partial={session.status === "PARTIALLY_COMPLETED"} result={session.result} /> : null}
      </section>
    </main>
  );
}

function Preview({ t, preview, rows }: { t: ReturnType<typeof getTranslations>; preview: ImportPreview; rows: readonly NormalizedImportRow[] }) {
  const statistics: readonly [MessageKey, number][] = [
    ["imports.parsed", preview.parsedRowCount],
    ["imports.accepted", preview.acceptedRowCount],
    ["imports.invalid", preview.invalidRowCount],
    ["imports.exactDuplicates", preview.exactDuplicateRowCount],
    ["imports.likelyDuplicates", preview.likelyDuplicateRowCount],
    ["imports.transfers", preview.transferCandidateCount],
  ];
  return <section className="import-panel" aria-label={t("imports.preview")}>
    <h2>{t("imports.preview")}</h2>
    <dl className="import-statistics">
      {statistics.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
      <div><dt>{t("imports.dateRange")}</dt><dd>{preview.dateRange ? `${preview.dateRange.start} — ${preview.dateRange.end}` : t("imports.none")}</dd></div>
    </dl>
    <h3>{t("imports.totals")}</h3>
    <div className="import-totals">
      {preview.totalsByCurrency.map((total) => <article key={total.currency}>
        <h4>{total.currency}</h4>
        <p>{t("imports.expenses")}: {total.expenses.count} / {total.expenses.amountMinor} {t("imports.minorUnits")}</p>
        <p>{t("imports.income")}: {total.income.count} / {total.income.amountMinor} {t("imports.minorUnits")}</p>
        <p>{t("imports.transfer")}: {total.transfers.count} / {total.transfers.amountMinor} {t("imports.minorUnits")}</p>
      </article>)}
    </div>
    {rows.length ? <><h3>{t("imports.rows")}</h3><div className="import-table-wrap"><table className="import-table"><thead><tr><th>{t("imports.row")}</th><th>{t("imports.field.transactionDate")}</th><th>{t("imports.field.description")}</th><th>{t("imports.kind")}</th><th>{t("imports.amount")}</th><th>{t("imports.currency")}</th><th>{t("imports.status")}</th><th>{t("imports.issues")}</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.sourceRowNumber}><td>{row.sourceRowNumber}</td><td>{row.occurredAt.slice(0, 10)}</td><td>{row.description ?? row.merchantName ?? t("imports.none")}</td><td>{t(`imports.kind.${row.kind}` as MessageKey)}</td><td>{row.amountMinor}</td><td>{row.currency}</td><td>{row.disposition === "ACCEPT" ? t("imports.clean") : t("imports.issueCount", { count: row.issues.length })}</td><td>{row.issues.length ? row.issues.map((issue) => t(issueLabel(issue.code))).join("; ") : t("imports.none")}</td></tr>)}
    </tbody></table></div></> : null}
  </section>;
}

function issueLabel(code: string): MessageKey {
  const keys: Record<string, MessageKey> = {
    MISSING_DATE: "imports.issue.MISSING_DATE",
    INVALID_DATE: "imports.issue.INVALID_DATE",
    AMBIGUOUS_DATE: "imports.issue.AMBIGUOUS_DATE",
    MISSING_CURRENCY: "imports.issue.MISSING_CURRENCY",
    INVALID_CURRENCY: "imports.issue.INVALID_CURRENCY",
    ACCOUNT_CURRENCY_MISMATCH: "imports.issue.ACCOUNT_CURRENCY_MISMATCH",
    INVALID_AMOUNT: "imports.issue.INVALID_AMOUNT",
    BOTH_DEBIT_AND_CREDIT: "imports.issue.BOTH_DEBIT_AND_CREDIT",
    MISSING_AMOUNT: "imports.issue.MISSING_AMOUNT",
    SIGNED_DIRECTION_REQUIRED: "imports.issue.SIGNED_DIRECTION_REQUIRED",
    TRANSFER_ACCOUNT_REQUIRED: "imports.issue.TRANSFER_ACCOUNT_REQUIRED",
    TRANSFER_SAME_ACCOUNT: "imports.issue.TRANSFER_SAME_ACCOUNT",
    MISSING_DESCRIPTION: "imports.issue.MISSING_DESCRIPTION",
    TEXT_TOO_LONG: "imports.issue.TEXT_TOO_LONG",
    EXACT_DUPLICATE: "imports.issue.EXACT_DUPLICATE",
    LIKELY_DUPLICATE: "imports.issue.LIKELY_DUPLICATE",
  };
  return keys[code] ?? "imports.issue.GENERIC";
}

function Result({ t, partial, result }: { t: ReturnType<typeof getTranslations>; partial: boolean; result: ImportResult }) {
  return <section className="import-panel" aria-label={partial ? t("imports.partial") : t("imports.completed")}>
    <h2>{partial ? t("imports.partial") : t("imports.completed")}</h2>
    <dl className="import-statistics">
      <div><dt>{t("imports.imported")}</dt><dd>{result.importedRowCount}</dd></div>
      <div><dt>{t("imports.skipped")}</dt><dd>{result.skippedExactDuplicateRowCount}</dd></div>
      <div><dt>{t("imports.failed")}</dt><dd>{result.failedRowCount}</dd></div>
      <div><dt>{t("imports.deferred")}</dt><dd>{result.deferredPipelineCount}</dd></div>
    </dl>
  </section>;
}

function initialMapping(accounts: readonly Account[], expenseCategories: readonly Category[], incomeCategories: readonly Category[]): ImportMapping {
  return {
    columns: {},
    amountMode: "SIGNED",
    signedAmountDirection: null,
    dateFormat: "AUTO",
    decimalSeparator: "AUTO",
    accountId: accounts[0]?.id ?? "",
    transferAccountId: null,
    fallbackCurrency: null,
    defaultExpenseCategoryId: expenseCategories[0]?.id ?? "",
    defaultIncomeCategoryId: incomeCategories[0]?.id ?? "",
  };
}

function mappingForDraft(
  draft: ImportMappingDraft,
  accounts: readonly Account[],
  expenseCategories: readonly Category[],
  incomeCategories: readonly Category[],
): ImportMapping {
  const initial = initialMapping(accounts, expenseCategories, incomeCategories);
  return {
    ...initial,
    columns: draft.columns,
    amountMode: draft.columns.debit || draft.columns.credit ? "DEBIT_CREDIT" : "SIGNED",
  };
}
