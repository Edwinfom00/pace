"use client";

import { useRef, useState, type ComponentType } from "react";

import type {
  FinancialReportDTO,
  ReportLanguage,
} from "../domain/financial-report.types";
import {
  giveSvgImagesIntrinsicSize,
  makeColorsCanvasSafe,
  waitForImages,
  withAccurateTextBaselines,
} from "./html2canvas-compat";

export type ReportExportStage =
  | "idle"
  | "preparing"
  | "rendering"
  | "exporting";
export type ReportExportError = "request" | "render";

export interface FinancialReportPdfRequest {
  readonly workspaceSlug: string;
  readonly period: string;
  readonly currency: string;
  readonly language: ReportLanguage;
  readonly sections: string;
}

type ReportDocument = ComponentType<{
  readonly report: FinancialReportDTO;
  readonly pdf?: boolean;
}>;

class ReportRequestError extends Error {}

export function useFinancialReportPdf() {
  const [stage, setStage] = useState<ReportExportStage>("idle");
  const [error, setError] = useState<ReportExportError | null>(null);
  const [savedFile, setSavedFile] = useState<string | null>(null);
  const [rendered, setRendered] = useState<{
    readonly report: FinancialReportDTO;
    readonly Document: ReportDocument;
  } | null>(null);
  const renderHost = useRef<HTMLDivElement>(null);

  async function generate(request: FinancialReportPdfRequest) {
    setError(null);
    setSavedFile(null);
    setStage("preparing");
    try {
      const response = await fetch("/api/reports/financial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(request),
      }).catch((cause: unknown) => {
        throw new ReportRequestError("Report request failed", { cause });
      });
      if (!response.ok) {
        throw new ReportRequestError(
          `Report request failed with ${response.status}`,
        );
      }
      const document = (await response.json()) as FinancialReportDTO;
      const { FinancialReportDocument } =
        await import("./financial-report-document");
      setRendered({ report: document, Document: FinancialReportDocument });
      setStage("rendering");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await window.document.fonts.ready;
      const element = renderHost.current?.firstElementChild;
      if (!(element instanceof HTMLElement))
        throw new Error("Report was not rendered");
      await waitForImages(element);
      await giveSvgImagesIntrinsicSize(element);
      setStage("exporting");
      const { default: html2pdf } = await import("html2pdf.js");
      await withAccurateTextBaselines(() =>
        html2pdf()
          .set({
            margin: 0,
            filename: document.meta.fileName,
            image: { type: "jpeg", quality: 0.95 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              backgroundColor: "#fff",
              onclone: (_clone: Document, reference: HTMLElement) =>
                makeColorsCanvasSafe(reference),
            },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          })
          .from(element)
          .save(),
      );
      setSavedFile(document.meta.fileName);
    } catch (cause) {
      console.error("[reports] Financial report export failed", cause);
      setError(cause instanceof ReportRequestError ? "request" : "render");
    } finally {
      setRendered(null);
      setStage("idle");
    }
  }

  return {
    stage,
    error,
    savedFile,
    generate,
    clearError: () => setError(null),
    reset: () => {
      setError(null);
      setSavedFile(null);
    },
    renderHost: rendered ? (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-[-10000px]"
        ref={renderHost}>
        <rendered.Document pdf report={rendered.report} />
      </div>
    ) : null,
  };
}
