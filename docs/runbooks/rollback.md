# Rollback

<!-- nav -->
<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

> [!WARNING]
> Use this when a deploy has broken production. Restore service first, then fix the cause.

> [!NOTE]
> Nothing deploys automatically while the ERP moves to Cloudflare (see [DEPLOYMENT.md](../DEPLOYMENT.md)).

Once the Cloudflare deploy exists: revert the bad change on `main` (`git revert <bad-commit-sha>`), open it as a pull request and merge once CI passes. Only the apps whose folders the revert touches are redeployed. For an immediate rollback, use **Deployments → Rollback** on the affected Worker in the Cloudflare dashboard.

Afterwards, record what happened and the fix in the pull request that resolves the root cause.
