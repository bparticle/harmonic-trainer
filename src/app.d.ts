// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** Set by hooks.server.ts from the signed session cookie. */
			authed: boolean;
			/**
			 * Who that cookie names, or null for one minted before payloads named
			 * anybody. Resolve it with `currentUserId` rather than reading it raw.
			 */
			userId: string | null;
		}
	}
}

export {};
