# Releasing to npm

The package is `@uthereal-sdk/cortex`; the repository remains
`Uthereal-Labs/Uthereal-Cortex-SDK`. Use pnpm 10.33.0. Published releases are ESM;
the pinned GitHub source-copy path remains supported.

## Prepare a release

1. Use a release PR to update package.json, sdk/version.ts, CHANGELOG.md and the
   pinned installation/agent documentation. Use SemVer: patch for compatible
   fixes, minor for compatible additions, major for breaking public interfaces.
2. Run `pnpm install --frozen-lockfile`, `pnpm verify`,
   `pnpm exec playwright install chromium`, and `pnpm test:package`. The latter
   packs the package and installs that archive into isolated Node/Deno and React
   consumers. Require an independent public-content review and passing CI.
3. Merge the reviewed PR. Create an immutable `vX.Y.Z` or `vX.Y.Z-rc.N` tag at the
   reviewed tip of main. Do not move an existing tag.
4. Dispatch **Publish npm package** from **main**, supplying that tag before main advances. The workflow
   verifies ancestry/version agreement and refuses an existing registry version.
   It publishes the same archive it tested, with provenance, then attaches the
   archive and checksum to a GitHub release. Stable releases use `latest`;
   prereleases use `next`. No publication occurs on ordinary pushes or PRs.
5. Install the released version into a clean application and check the npm
   version, dist-tag, integrity, provenance and GitHub release. Record live
   credentialed checks separately from fixture checks.

## First-publication bootstrap

npm requires the package to exist before trusted publishing can be configured.
Validate the complete `1.1.0-rc.0` package and merge/tag it first. Then use
`pnpm login --registry=https://registry.npmjs.org` and complete browser login/2FA.
Verify membership and publishing access to `uthereal-sdk`; never copy credentials
into chat, tracked files or release evidence.

Publish the already-tested archive with interactive authentication:

```sh
RELEASE_TAG=v1.1.0-rc.0 pnpm verify:release
pnpm publish .cache/package/uthereal-sdk-cortex-1.1.0-rc.0.tgz --access public --tag next --ignore-scripts --publish-branch main
```

This local bootstrap has no GitHub provenance and must not become `latest`.
Configure the package's trusted publisher on npm with:

- GitHub organization: `Uthereal-Labs`
- Repository: `Uthereal-Cortex-SDK`
- Workflow filename: `publish.yml`
- Environment: `npm`
- Allowed actions: enable direct publishing

Create the matching GitHub `npm` environment and restrict it to main workflow
dispatches. Keep npm 2FA enabled and disallow publishing through bypass-2FA
tokens. No repository npm token is required. If your npm role cannot change
these settings, an organization owner must configure them.

The release workflow pins Node 24.20.0 with a compatible bundled npm CLI;
pnpm 10 delegates publication to that CLI. OIDC requires npm 11.5.1 or later.
Publish stable 1.1.0 through this workflow after the release candidate passes.

## Failed releases

Before publication, fix the PR and validate again. After publication, do not
overwrite versions, move tags or unpublish as a routine rollback. Publish a new
patch, and deprecate the affected version with a clear explanation if needed.
If publication succeeded but release attachment failed, verify the existing
registry integrity/provenance and finish the GitHub release; do not republish.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[npm trust requirements](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
