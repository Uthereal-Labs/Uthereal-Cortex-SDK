import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CitedAnswer } from "../sdk/react.ts";
import { CortexError, ragResponseSchema, readAnswers } from "../sdk/core.ts";

const fixtures = import.meta.glob<string>(
  "../examples/{ask,rag}/*.{ndjson,json}",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

/** Optional offline demonstration. Selected fixtures only; no authentication or network. */
export function Replay() {
  const [scenario, setScenario] = useState("pdf");
  const [account, setAccount] = useState("fixture-account-a");
  const ask = fixtures["../examples/ask/response.ndjson"];
  const rag = fixtures["../examples/rag/response.json"];
  const query = useQuery({
    queryKey: ["cortex-fixture-answer"],
    enabled: Boolean(ask),
    queryFn: async () => {
      let final;
      for await (const answer of readAnswers(new Response(ask))) final = answer;
      if (!final) throw new Error("No Ask fixture selected");
      return final;
    },
  });
  return (
    <main>
      <h1>Cortex SDK replay</h1>
      <p>Synthetic evidence. No API key or live agent is used.</p>
      {ask && (
        <>
          <label>
            PDF scenario<select
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
            >
              <option value="pdf">PDF and highlight</option>
              <option value="denied">Access denied with request ID</option>
            </select>
          </label>
          <label>
            Account<select
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            >
              <option value="fixture-account-a">Account A</option>
              <option value="fixture-account-b">Account B</option>
            </select>
          </label>
          {query.data && (
            <CitedAnswer
              key={`${account}:${scenario}`}
              answer={query.data}
              messageId="fixture-message"
              authScope={account}
              loadPdf={async ({ signal }) => {
                signal?.throwIfAborted();
                if (scenario === "denied") {
                  throw new CortexError(403, "SCOPE_DENIED", "fixture-request");
                }
                const pdf = JSON.parse(fixtures["../examples/ask/pdf.json"]);
                return new Blob([
                  Uint8Array.from(
                    atob(pdf.base64),
                    (char) => char.charCodeAt(0),
                  ),
                ], { type: "application/pdf" });
              }}
            />
          )}
        </>
      )}
      {rag && (
        <section>
          <h2>RAG evidence</h2>
          {ragResponseSchema.parse(JSON.parse(rag)).results.map((hit) => (
            <p key={hit.id_element}>{hit.content}</p>
          ))}
        </section>
      )}
      {!ask && !rag && (
        <p>
          Replay fixtures are unavailable. Check that examples/ was copied from
          the SDK repository.
        </p>
      )}
      {query.error && <p role="alert">{query.error.message}</p>}
    </main>
  );
}
