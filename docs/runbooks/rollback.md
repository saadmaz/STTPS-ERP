# Rollback

Use this when a deploy has broken production.

Rollback follows section 8 of [DEPLOYMENT.md](../DEPLOYMENT.md#8-rollback).

In short: revert the bad change on `main` (`git revert <bad-commit-sha>`), open it as a pull request and merge once CI passes. Only the app whose folder changed is redeployed by its own workflow (`deploy-web`, `deploy-admin` or `deploy-api`).

Afterwards, record what happened and the fix in the pull request that resolves the root cause.
