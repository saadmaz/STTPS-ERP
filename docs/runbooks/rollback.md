# Rollback

Use this when a deploy has broken production.

Rollback follows section 8 of [DEPLOYMENT.md](../DEPLOYMENT.md#8-rollback).

In short: revert the bad change on `main` (`git revert <bad-commit-sha>`), open it as a pull request and merge once CI passes. The Deploy workflow redeploys only the apps whose folders the revert touches.

Afterwards, record what happened and the fix in the pull request that resolves the root cause.
