/**
 * Who a request is for.
 *
 * This began as the whole multi-user seam: one seeded row and one accessor used
 * by every owned query. Accounts proved the seam useful. The hook now resolves
 * a signed claim against a real user and this accessor keeps all call sites
 * explicit about the account they are acting for.
 */

/**
 * The local player, at a fixed id.
 *
 * A constant rather than a random uuid handed out by the migration, so the
 * first player's history and cookies survive the move from one account to many.
 */
export const LOCAL_PLAYER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * The account id resolved by `hooks.server.ts`.
 *
 * A cookie claim is never passed here directly. The hook has already checked
 * that the user exists and that its revocation epoch still matches; this small
 * assertion keeps all owned query call sites explicit and non-null.
 */
export function currentUserId(resolved: string | null): string {
	if (!resolved) throw new Error('No signed-in user');
	return resolved;
}
