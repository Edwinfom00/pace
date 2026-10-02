import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseImportUpload } from "@/modules/imports/parsers";
import { detectImportMapping } from "@/modules/imports/mapping";
import { buildDetectedColumns, buildPreviewRows, columnsFromAssignments, evaluateImportColumns, initialColumnAssignments, assignFieldToColumn } from "@/modules/imports/mapping/column-mapping";
import { getImportMappingLabels } from "@/modules/imports/ui/import-mapping-labels";
import { ImportMappingScreen } from "@/modules/imports/ui/views/import-mapping-view";

void (async () => {
  const bytes = new Uint8Array(readFileSync("tests/fixtures/imports/pace_import_test_october_2026.xlsx"));
  const p = await parseImportUpload({ name: "x.xlsx", mimeType: null, bytes });
  const columns = buildDetectedColumns(p.parsed.headers, p.parsed.rows, detectImportMapping(p.parsed.headers));
  const previewRows = buildPreviewRows(p.parsed.headers, p.parsed.rows);
  const variant = process.argv[2] ?? "ready";
  let assignments = initialColumnAssignments(columns, null);
  if (variant === "missing") assignments = assignFieldToColumn(assignments, "amount", null);
  const css = (await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" })).css;
  const body = renderToStaticMarkup(createElement(ImportMappingScreen, {
    labels: getImportMappingLabels("fr"), locale: "fr-CM",
    session: { id: "s", fileName: "pace_import_test_october_2026.xlsx", fileType: "XLSX", fileChecksum: "x", rowCount: 30 },
    columns, previewRows, assignments, evaluation: evaluateImportColumns(columnsFromAssignments(assignments).columns),
    errorCode: null, busy: false, workspaceSlug: "house",
  }));
  writeFileSync("C:/Users/PKT/AppData/Local/Temp/claude/d--Projects-pace/915704a3-eae7-4ac7-877f-4afd4fab521f/scratchpad/mapping-" + variant + ".html", "<!doctype html><html><head><meta charset=utf-8><style>" + css + "</style></head><body style='background:#f7f9fc;font-family:Inter,Segoe UI,system-ui,sans-serif'>" + body + "</body></html>");
  console.log("ok", css.length);
})();
