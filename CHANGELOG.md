# Changelog

## 1.2.1

- Fix `pdfLocation()`: read PDF highlight coordinates with a bottom-left origin. Before, `PdfEvidence` and `CitedAnswer` marked a box mirrored top to bottom, on other lines than the cited passage.
- Change the synthetic Ask fixture to the bottom-left coordinates of the box drawn in its PDF.
- Document the coordinate origin in `INTEGRATING.md` and the public API contract.
- Document that `agent.uthereal.ai` is an alias of the canonical `cortex.uthereal.ai` API base.

## 1.2.0

- Accept only the `api-server-proxy` base path. The hosted staging proxy (`api-server-proxy-staging`) is retired.
- Rename the synthetic evidence replay fixture from `examples/staging` to `examples/evidence`.
- Type the `rejection_code` answer field that Cortex sets when it rejects a message (`input_blocked.<check>`), and document the checks.
- Raise the Ask message limit to 10,000 Unicode code points and the default `reasoning_effort` to `standard`, matching the service.

## 1.1.0

- Publish the validated `@uthereal-sdk/cortex` ESM package with GitHub provenance.
- Keep source-copy integrations and the existing Cortex protocol compatible.
- Ensure standalone `PdfEvidence` imports retain their scoped stylesheet.


## 1.1.0-rc.0

- Add the public ESM package `@uthereal-sdk/cortex` with typed core, server, browser, React and optional Supabase entry points.
- Include scoped styles and a matching local PDF worker; retain source-copy compatibility.
- Add isolated packed-package checks and a GitHub OIDC release workflow.
- Preserve existing public interfaces and the Cortex wire contract.

## 1.0.1

- Rename the authoritative repository to Uthereal-Labs/Uthereal-Cortex-SDK.
- Align documentation, release links and integration prompts with Uthereal branding.
- Preserve all SDK interfaces and wire contracts; existing v1.0.0 pins remain valid.

## 1.0.0

- Public source distribution of the Cortex integration SDK.
- Typed public API, streaming answer reduction, citations and authenticated PDF renewal.
- Portable auth/store interfaces, browser client, React evidence components and optional Supabase adapters.
- Synthetic replay fixtures, runnable example and independent contract/type checks.
