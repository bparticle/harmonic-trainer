import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authenticate, createResetToken, resetPassword, resetTokenIsValid } from './accounts';
import { passwordResetTokens } from './schema';
import { createTestUser, db, deleteTestUser, type TestUser } from './test-helpers';

/**
 * The token lifecycle only — never `requestPasswordReset`/`sendMail`, so
 * this suite never touches Maileroo or the network. `createResetToken` was
 * split out from the mail-sending step for exactly this reason.
 */
describe('password reset tokens', () => {
	let user: TestUser;

	beforeAll(async () => {
		user = await createTestUser('reset');
	});

	afterAll(async () => {
		await deleteTestUser(user.id);
	});

	it('is valid until spent, then rejects a replay', async () => {
		const token = await createResetToken(user.id);
		expect(await resetTokenIsValid(token)).toBe(true);

		const outcome = await resetPassword(token, 'a-brand-new-password-1');
		expect(outcome).toBe('ok');
		expect(await resetTokenIsValid(token)).toBe(false);
		expect(await resetPassword(token, 'another-password-2')).toBe('invalid');
	});

	it('actually changes the password and revokes existing sessions', async () => {
		const before = await authenticate(user.email, 'a-brand-new-password-1');
		expect(before?.id).toBe(user.id);
		const epochBefore = before?.sessionEpoch ?? 0;

		const token = await createResetToken(user.id);
		await resetPassword(token, 'yet-another-password-3');

		expect(await authenticate(user.email, 'a-brand-new-password-1')).toBeNull();
		const after = await authenticate(user.email, 'yet-another-password-3');
		expect(after?.id).toBe(user.id);
		expect(after?.sessionEpoch).toBeGreaterThan(epochBefore);
	});

	it('burns every other outstanding token when one is spent', async () => {
		const first = await createResetToken(user.id);
		const second = await createResetToken(user.id);

		await resetPassword(second, 'password-number-four');

		expect(await resetTokenIsValid(first)).toBe(false);
	});

	it('rejects an expired token without touching the password', async () => {
		// A real token, hashed the same way accounts.ts hashes one internally,
		// so this row is indistinguishable from one `createResetToken` would
		// have written — except for the expiry this test is checking.
		const rawToken = 'expired-test-token-not-a-real-secret';
		const tokenHash = createHash('sha256').update(rawToken).digest('base64url');
		await db.insert(passwordResetTokens).values({
			userId: user.id,
			tokenHash,
			expiresAt: new Date(Date.now() - 60_000)
		});

		expect(await resetTokenIsValid(rawToken)).toBe(false);
		expect(await resetPassword(rawToken, 'irrelevant-password-6')).toBe('invalid');
	});

	it('rejects a token that was never issued', async () => {
		expect(await resetTokenIsValid('not-a-real-token')).toBe(false);
		expect(await resetPassword('not-a-real-token', 'irrelevant-password-7')).toBe('invalid');
	});
});
