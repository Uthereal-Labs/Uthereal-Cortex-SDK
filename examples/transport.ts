/** Synthetic upstream transport for tests only. Never install it in production. */
export function createReplayTransport(fixtures: {
  ask?: string;
  rag?: unknown;
  pdf?: Uint8Array;
  pdfFailure?: { status: number; code: string; requestId: string };
  expireFirstPdf?: boolean;
}) {
  const requests: Request[] = [];
  let reads = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/ask") && fixtures.ask !== undefined) {
      const bytes = new TextEncoder().encode(fixtures.ask);
      let offset = 0;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            request.signal.throwIfAborted();
            if (offset === bytes.length) controller.close();
            else controller.enqueue(bytes.slice(offset, ++offset));
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    if (path.endsWith("/rag") && fixtures.rag !== undefined) {
      return Response.json(fixtures.rag);
    }
    if (path.endsWith("/pdf/refresh")) {
      return Response.json({
        secure_url: "/chat/reference/pdf/fixture.renewed.invalid?page=99",
      });
    }
    if (path.includes("/reference/pdf/")) {
      reads++;
      if (fixtures.pdfFailure) {
        return Response.json({ code: fixtures.pdfFailure.code }, {
          status: fixtures.pdfFailure.status,
          headers: { "x-request-id": fixtures.pdfFailure.requestId },
        });
      }
      if (fixtures.expireFirstPdf && reads === 1) {
        return Response.json({ detail: "Invalid or expired reference token" }, {
          status: 401,
        });
      }
      if (fixtures.pdf) {
        return new Response(Uint8Array.from(fixtures.pdf), {
          headers: { "content-type": "application/pdf" },
        });
      }
    }
    return Response.json({ code: "FIXTURE_NOT_SELECTED" }, { status: 404 });
  };
  return { fetch: fetcher, requests };
}
