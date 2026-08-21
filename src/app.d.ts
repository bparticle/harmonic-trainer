// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** Set only after the signed claim is resolved against the database. */
			authed: boolean;
			userId: string | null;
			user: {
				id: string;
				name: string;
				email: string;
				sessionEpoch: number;
			} | null;
		}
	}
}

export {};
