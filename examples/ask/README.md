# Ask Question: replay an answer

`request.json` is a public Ask request body. Use the assistant and external
session in the route described by `openapi.json`. The recorded response is
`response.ndjson`: HTTP 200, `Content-Type: text/event-stream`, UTF-8 NDJSON.
There are no SSE `data:` prefixes, delays or application-specific `saved`
events.

| Line | Meaning                                                                        | Expected behavior                                                               |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1    | Empty utterance with source, inline reference, claim and numbering metadata    | Retain metadata before visible text; do not show a completed answer             |
| 2    | First visible full utterance, with metadata omitted                            | Replace the text and retain line 1 metadata; GIST 1 resolves to ref-light       |
| 3    | Final full utterance, an additional reference and occurrence of the same claim | Replace text, merge by durable IDs, retain both occurrences and source metadata |

Feed the original bytes through your streaming implementation in this order and
close the response. Compare each accumulated snapshot to `expected.json`'s
`snapshots` array, and the completed state to `finalAnswer`. Also compare
`markers` and `locations` against your citation resolver and geometry
calculation.

Repeat with multiple lines per chunk, one byte per chunk (splitting the accented
letter and emoji), and without the final newline. Network chunks do not equal
JSON events. Do not concatenate complete utterances into duplicated answer text.
The reader can emit an empty initial snapshot; it is not successful completion.

GIST 1 and 2 are occurrences of one claim and resolve to the same PDF reference.
The final CIT lists a text-only reference before the PDF reference. Display
numbers 7 and 9 are deliberately different from durable IDs and occurrence IDs.
The source PDF page index is 2 (display page 3); the sliced viewer page is 2.
Its expected rectangle is left 10%, top 20%, width 40%, height 20%. The
text-only reference has no PDF geometry. Fixture URLs are not usable PDF
capabilities.
