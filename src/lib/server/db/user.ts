/**
 * Who a request is for.
 *
 * This is the whole of the multi-user seam, and it is one function on purpose.
 * The tempting version of "prepare for accounts" is a `user_id` column on all
 * twelve tables, backfilled with the one value there is — twelve columns that
 * are provably constant, each encoding a guess about a question nobody has
 * asked. The seam is a table with one row and an accessor every query touching
 * owned data goes through from the first day. If that discipline holds, a
 * second player is a change in this file plus a login form.
 *
 * The claim is not a security statement. `AUTH_SECRET` gates minting a token at
 * all and there is one shared password behind it, so naming a user in the
 * payload buys nothing today. Multi-user cannot ship on a shared password —
 * `SECURITY.md` says so and M12 is where that changes.
 */

/**
 * The local player, at a fixed id.
 *
 * A constant rather than a random uuid handed out by the migration, for the
 * same reason `settings` is pinned to `id = 1`: there is exactly one of these,
 * and a well-known value means a ninety-day cookie still names a real row after
 * the database has been rebuilt from scratch. It is recognisable on sight in
 * every foreign key, which the alternative is not.
 */
export const LOCAL_PLAYER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Resolve the session's claim to a user.
 *
 * **There is exactly one player, and this function is where that is true.**
 * A claim naming anybody else resolves to the local player rather than being
 * honoured, because there is nobody else to be: no route creates a user, the
 * migration seeds one row, and accounts are M12. Reading a stranger's id out of
 * a cookie and using it would mean the number of users this app supports was
 * decided by whatever happened to be in a browser.
 *
 * That makes the single-player guarantee something the code enforces rather
 * than something that merely happens to hold — which matters now that the
 * instance is public, and matters more on the day this file changes. When
 * accounts land this stops collapsing every claim and starts looking users up;
 * it is the one function that has to change, which was the entire point of
 * routing every owned query through it from the first day.
 */
export function currentUserId(claim: string | null = null): string {
	return claim === LOCAL_PLAYER_ID ? claim : LOCAL_PLAYER_ID;
}
