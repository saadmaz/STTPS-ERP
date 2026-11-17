# Rollback

<!-- nav -->
<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

> [!WARNING]
> Use this when a deploy has broken production. Restore service first, then fix the cause.

Rollback follows section 8 of [DEPLOYMENT.md](../DEPLOYMENT.md#8-rollback).

In short: revert the bad change on `main` (`git revert <bad-commit-sha>`), open it as a pull request and merge once CI passes. The Deploy workflow redeploys only the apps whose folders the revert touches.

Afterwards, record what happened and the fix in the pull request that resolves the root cause.
