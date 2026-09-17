import { useState } from "react";
import { type Answer, pdfLocation, resolveMarker } from "../core.ts";
import type { PdfLoader } from "../browser.ts";
import { PdfEvidence } from "./PdfEvidence.tsx";
import "./styles.css";

export function CitedAnswer(
  { answer, messageId, authScope, loadPdf }: {
    answer: Answer;
    messageId?: string;
    authScope: string;
    loadPdf: PdfLoader;
  },
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = answer.references.inline.find((item) =>
    item.id === selectedId
  );
  const source = answer.references.datasources.find((item) =>
    item.id === selected?.id_datasource
  );
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (
    const match of answer.utterance.matchAll(/\{\{(GIST|CIT):([^}]+)\}\}/g)
  ) {
    pieces.push(answer.utterance.slice(cursor, match.index));
    const references = resolveMarker(
      answer,
      match[1] === "GIST" ? "GIST" : "CIT",
      match[2],
    );
    if (!references.length) pieces.push(match[0]); // Unresolved evidence must not silently disappear.
    for (const reference of references) {
      pieces.push(
        <button
          key={`${match.index}:${reference.id}`}
          type="button"
          aria-label={`Open reference ${
            answer.reference_numbering[reference.id] ?? reference.id
          }`}
          onClick={() => setSelectedId(reference.id)}
        >
          [{answer.reference_numbering[reference.id] ?? reference.id}]
        </button>,
      );
    }
    cursor = match.index + match[0].length;
  }
  pieces.push(answer.utterance.slice(cursor));
  return (
    <>
      <div className="cortex-answer">{pieces}</div>
      {selected && (
        <section className="cortex-evidence" aria-label="Citation evidence">
          <button
            type="button"
            onClick={() =>
              setSelectedId(null)}
          >
            Close source
          </button>
          <h3>{source?.title ?? "Source"}</h3>
          <blockquote>
            {selected.content ?? (typeof selected.gist === "string"
              ? selected.gist
              : "Text evidence")}
          </blockquote>
          {messageId && pdfLocation(selected)
            ? (
              <PdfEvidence
                key={`${authScope}:${messageId}:${selected.id}`}
                authScope={authScope}
                loadPdf={loadPdf}
                messageId={messageId}
                reference={selected}
              />
            )
            : (
              <p>
                {pdfLocation(selected)
                  ? "PDF access is available after the answer has been saved."
                  : "Text-only evidence; no PDF geometry supplied."}
              </p>
            )}
        </section>
      )}
    </>
  );
}
