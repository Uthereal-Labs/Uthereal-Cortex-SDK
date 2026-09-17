# RAG: retrieve evidence

`request.json` is a public RAG request body. Both `response.json` and
`empty.json` represent HTTP 200 with `Content-Type: application/json`. Choose
one per request; they are alternative outcomes, not consecutive events. A
simulated transport can delay delivery, but the API returns one JSON object
rather than streamed answers.

Parse the complete body with the generated RAG type and runtime schema. For the
populated response, compare result IDs and ranks with `expected.json`. The
second hit intentionally has empty metadata. For the empty response, assert an
empty result list and render your application's empty-results state.

Results are retrieved evidence for your application's synthesis layer. Do not
invent GIST/CIT markers, PDF capabilities, a model answer, or required metadata
fields that this endpoint does not provide. The query and identifiers here are
synthetic and need not match the agent selected for a live integration.
