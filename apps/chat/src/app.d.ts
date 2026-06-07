// See https://svelte.dev/docs/kit/types#app
declare global {
	namespace App {
		interface Locals {
			/** Verified session user (from the session cookie), or null if anonymous. */
			user: SessionUser | null;
		}
		interface PageData {}
		interface Error {}
		interface Platform {}
	}

	/** Minimal authenticated user resolved by hooks.server.ts from the session cookie. */
	interface SessionUser {
		uid: string;
		displayName: string | null;
		email: string | null;
		photoURL: string | null;
	}
}

export {};
