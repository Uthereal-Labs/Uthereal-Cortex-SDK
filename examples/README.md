# Synthetic replay fixtures

These framework-independent files describe a fictional café garden trial. They
contain no customer data or credentials and require no service to replay. Both
Ask and RAG examples are included. Their presence does not grant API access.

In each directory, read its README, request, response and expected results.
Replace your HTTP transport with the fixture response in your own test harness.
Keep using the same parser and rendering code as a real response.

Ask is NDJSON with progressive complete answer snapshots. RAG is one JSON
retrieval response; do not treat it as a stream or an assistant-generated
answer. All IDs and URLs are synthetic. Never send fixture reference URLs to
Cortex. The raw responses test payload handling and geometry. The SDK transport
below also exercises PDF bytes, simulated renewal and in-memory persistence.
Real provider authorization and durable storage need the integration guide’s
live rehearsal.

## SDK transport and PDF fixture

`transport.ts` supplies an injected, synthetic upstream fetch. Feed it the
selected Ask NDJSON and/or RAG JSON; it fragments Ask UTF-8 one byte at a time.
The Ask selection includes `ask/pdf.json`, whose base64 decodes to a real
three-page PDF slice with 600×800 dimensions. `expireFirstPdf` simulates the
exact renewable 401; `pdfFailure` supplies a non-renewable status/code/request
ID. Inspect its `requests` to verify identity and page behavior. No network or
key is needed.

`tests/sdk_test.ts` connects the real browser client to the real server handler,
an in-memory store and this transport. It checks completed persistence, original
identity, one renewal, page replacement, cross-account denial and error details.
The transport is a test fixture, never a production fallback.
