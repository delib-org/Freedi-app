import {
	isFirestoreInternalCrash,
	isBlockedServiceWorkerCrash,
	isTransientAuthNetworkError,
	type SentryLikeEvent,
	type SentryLikeException,
} from '../sentryFilters';

const MAIN_APP = { firebaseChunkNames: ['vendor-firebase'] };
const JOIN_APP = { firebaseChunkNames: ['firebase-'] };

function frames(...filenames: string[]) {
	return { frames: filenames.map((filename) => ({ filename })) };
}

function event(...values: SentryLikeException[]): SentryLikeEvent {
	return { exception: { values } };
}

describe('isFirestoreInternalCrash', () => {
	it('drops the b815 assertion on its message alone', () => {
		const e = event({
			type: 'FirebaseError',
			value: 'FIRESTORE (11.10.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)',
		});

		expect(isFirestoreInternalCrash(e, undefined, MAIN_APP)).toBe(true);
	});

	it('drops a chained assertion whose OUTER value carries app frames', () => {
		// The shape that actually arrives: an outer FirebaseError raised from app
		// code wrapping the inner SDK TypeError. Judging the flattened union of
		// both values' frames — as the first implementation did — sees app frames
		// and lets the event through, which is why 52 of these were reported
		// despite a filter being in place.
		const e = event(
			{
				type: 'FirebaseError',
				value: 'FIRESTORE (11.10.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)',
				stacktrace: frames('/assets/index-abc.js', '/assets/vendor-firebase-def.js'),
			},
			{
				type: 'TypeError',
				value: "Cannot read properties of null (reading 'target')",
				stacktrace: frames('/assets/vendor-firebase-def.js'),
			},
		);

		expect(isFirestoreInternalCrash(e, undefined, MAIN_APP)).toBe(true);
	});

	it('drops the inner null-target TypeError when its own frames are all vendor', () => {
		const e = event(
			{
				type: 'Error',
				value: 'Listener failed',
				stacktrace: frames('/assets/index-abc.js'),
			},
			{
				type: 'TypeError',
				value: "Cannot read properties of null (reading 'target')",
				stacktrace: frames('/assets/vendor-firebase-def.js', '/assets/vendor-firebase-def.js'),
			},
		);

		expect(isFirestoreInternalCrash(e, undefined, MAIN_APP)).toBe(true);
	});

	it("keeps an app-code null-'target' dereference with the same message", () => {
		const e = event({
			type: 'TypeError',
			value: "Cannot read properties of null (reading 'target')",
			stacktrace: frames('/assets/index-abc.js', '/assets/MyComponent-xyz.js'),
		});

		expect(isFirestoreInternalCrash(e, undefined, MAIN_APP)).toBe(false);
	});

	it("matches join's differently-named firebase chunk", () => {
		const e = event({
			type: 'TypeError',
			value: "Cannot read properties of null (reading 'withSequenceNumber')",
			stacktrace: frames('/assets/firebase-9f2c.js'),
		});

		expect(isFirestoreInternalCrash(e, undefined, JOIN_APP)).toBe(true);
		// The main app's chunk name must not match join's bundle.
		expect(isFirestoreInternalCrash(e, undefined, MAIN_APP)).toBe(false);
	});

	it('still drops the assertion with no chunk names configured (Next.js)', () => {
		const e = event({
			type: 'FirebaseError',
			value: 'FIRESTORE (11.10.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)',
			stacktrace: frames('/_next/static/chunks/4f21-a.js'),
		});

		expect(isFirestoreInternalCrash(e, undefined)).toBe(true);
	});

	it('keeps a null-deref with no chunk names configured, since nothing corroborates it', () => {
		const e = event({
			type: 'TypeError',
			value: "Cannot read properties of null (reading 'target')",
			stacktrace: frames('/_next/static/chunks/4f21-a.js'),
		});

		expect(isFirestoreInternalCrash(e, undefined)).toBe(false);
	});

	it('falls back to the thrown error when the event carries no exception values', () => {
		const error = new Error(
			'FIRESTORE (11.10.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)',
		);

		expect(isFirestoreInternalCrash({}, error, MAIN_APP)).toBe(true);
	});

	it('keeps ordinary errors', () => {
		const e = event({
			type: 'TypeError',
			value: 'x.map is not a function',
			stacktrace: frames('/assets/vendor-firebase-def.js'),
		});

		expect(isFirestoreInternalCrash(e, undefined, MAIN_APP)).toBe(false);
		expect(isFirestoreInternalCrash({}, new Error('boom'), MAIN_APP)).toBe(false);
	});
});

describe('isBlockedServiceWorkerCrash', () => {
	it('drops a workbox-rooted registration dereference', () => {
		const e = event({
			type: 'TypeError',
			value: "Cannot read properties of undefined (reading 'waiting')",
			stacktrace: frames('/assets/workbox-window.prod.es5-1a.js'),
		});

		expect(isBlockedServiceWorkerCrash(e, undefined)).toBe(true);
	});

	it('keeps the same message when it comes from app code', () => {
		const e = event({
			type: 'TypeError',
			value: "Cannot read properties of undefined (reading 'waiting')",
			stacktrace: frames('/assets/index-abc.js'),
		});

		expect(isBlockedServiceWorkerCrash(e, undefined)).toBe(false);
	});

	it('keeps an unrelated dereference inside workbox', () => {
		const e = event({
			type: 'TypeError',
			value: "Cannot read properties of undefined (reading 'somethingElse')",
			stacktrace: frames('/assets/workbox-window.prod.es5-1a.js'),
		});

		expect(isBlockedServiceWorkerCrash(e, undefined)).toBe(false);
	});
});

describe('isTransientAuthNetworkError', () => {
	it('matches the Firebase error code on the thrown value', () => {
		expect(
			isTransientAuthNetworkError({}, { code: 'auth/network-request-failed' }),
		).toBe(true);
	});

	it('matches the code in an exception value when the thrown value is gone', () => {
		const e = event({
			type: 'FirebaseError',
			value: 'Firebase: Error (auth/network-request-failed).',
		});

		expect(isTransientAuthNetworkError(e, undefined)).toBe(true);
	});

	it('does not match a real auth failure', () => {
		const e = event({
			type: 'FirebaseError',
			value: 'Firebase: Error (auth/wrong-password).',
		});

		expect(isTransientAuthNetworkError(e, { code: 'auth/wrong-password' })).toBe(false);
	});
});
