import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import { type InlineReference, pdfLocation } from "../core.ts";
import type { PdfLoader } from "../browser.ts";

// Bundle the worker matching the pinned renderer; no CDN or private Cortex UI dependency.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfEvidence({ messageId, reference, authScope, loadPdf }: {
  messageId: string;
  reference: InlineReference;
  authScope: string;
  loadPdf: PdfLoader;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [resource, setResource] = useState<{ blob: Blob; url: string }>();
  const location = pdfLocation(reference);
  const query = useQuery({
    queryKey: ["cortex-sdk-pdf", authScope, messageId, reference.id],
    enabled: Boolean(authScope && messageId && location),
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) =>
      loadPdf({ messageId, inlineId: reference.id, signal }),
  });
  useEffect(() => {
    if (!query.data) return;
    const url = URL.createObjectURL(query.data);
    setResource({ blob: query.data, url });
    return () => URL.revokeObjectURL(url);
  }, [query.data]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width)
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const url = resource?.blob === query.data ? resource?.url : undefined;
  return (
    <div ref={container} className="cortex-pdf">
      {!location
        ? <p>Text-only evidence; no PDF geometry supplied.</p>
        : !authScope || !messageId
        ? <p>Sign in and save the answer to open its PDF.</p>
        : query.error
        ? (
          <p role="alert">
            Source unavailable: {query.error.message}
          </p>
        )
        : !url || !width
        ? <p role="status">Loading source…</p>
        : (
          <>
            <p>Source page {location.sourcePage + 1}</p>
            <Document
              file={url}
              loading={<p role="status">Rendering source…</p>}
              error={<p role="alert">The PDF could not be rendered.</p>}
            >
              <div className="cortex-pdf-page">
                <Page
                  pageNumber={location.slicePage}
                  width={width}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
                <div
                  aria-label="Cited passage highlight"
                  className="cortex-pdf-highlight"
                  style={{
                    left: `${location.left}%`,
                    top: `${location.top}%`,
                    width: `${location.width}%`,
                    height: `${location.height}%`,
                  }}
                />
              </div>
            </Document>
          </>
        )}
    </div>
  );
}
