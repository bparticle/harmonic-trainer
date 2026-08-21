import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

/* Password hashing parameters, introduced August 2026. */
const SCRYPT_VERSION = 1;
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_PREFIX = 'scrypt';

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number, length: number) {
	return new Promise<Buffer>((resolve, reject) => {
		nodeScrypt(
			password,
			salt,
			length,
			{ N: n, r, p, maxmem: SCRYPT_MAX_MEMORY },
			(error, derived) => (error ? reject(error) : resolve(derived as Buffer))
		);
	});
}

export async function hashPassword(password: string): Promise<string> {
	if (password.length < 12) throw new Error('Password must be at least 12 characters.');
	const salt = randomBytes(16);
	const derived = await scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEY_LENGTH);
	return [
		PASSWORD_PREFIX,
		SCRYPT_VERSION,
		SCRYPT_N,
		SCRYPT_R,
		SCRYPT_P,
		salt.toString('base64url'),
		derived.toString('base64url')
	].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [prefix, versionRaw, nRaw, rRaw, pRaw, saltRaw, hashRaw, extra] = stored.split('$');
	if (prefix !== PASSWORD_PREFIX || extra !== undefined) return false;

	const version = Number(versionRaw);
	const n = Number(nRaw);
	const r = Number(rRaw);
	const p = Number(pRaw);
	if (
		version !== SCRYPT_VERSION ||
		!Number.isInteger(n) ||
		!Number.isInteger(r) ||
		!Number.isInteger(p) ||
		n < 2 ||
		n > SCRYPT_N ||
		r < 1 ||
		r > SCRYPT_R ||
		p < 1 ||
		p > SCRYPT_P ||
		!saltRaw ||
		!hashRaw
	) {
		return false;
	}

	try {
		const salt = Buffer.from(saltRaw, 'base64url');
		const expected = Buffer.from(hashRaw, 'base64url');
		if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;
		const actual = await scrypt(password, salt, n, r, p, expected.length);
		if (actual.length !== expected.length) return false;
		return timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}
