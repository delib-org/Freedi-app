import m from 'mithril';
import type {
	AccessStatusRow,
	RequestAccessRequest,
	RequestAccessResponse,
} from '@freedi/shared-types';
import { functions, httpsCallable } from './firebase';
import { accessStateOf, isNotApprovedError, type AccessState } from './accessLogic';

/**
 * Where the signed-in teacher stands on access: one cached answer from
 * `agoraRequestAccess {status}`, keyed by uid so a different account never
 * reads the last one's. The server is the gate; this only decides which
 * screen to show.
 */
export interface AccessStore {
	/** The account the answer belongs to */
	uid: string | null;
	loaded: boolean;
	failed: boolean;
	approved: boolean;
	isAdmin: boolean;
	requests: AccessStatusRow[];
}

const store: AccessStore = {
	uid: null,
	loaded: false,
	failed: false,
	approved: false,
	isAdmin: false,
	requests: [],
};

let inFlight: { uid: string; promise: Promise<void> } | null = null;

/** The sentence waiting on the request screen after a gated action was refused */
let flashKey: string | null = null;

export function getAccessStore(): Readonly<AccessStore> {
	return store;
}

export function accessState(): AccessState {
	return accessStateOf(store.approved, store.isAdmin, store.requests);
}

async function callAccess(request: RequestAccessRequest): Promise<RequestAccessResponse> {
	const call = httpsCallable<RequestAccessRequest, RequestAccessResponse>(
		functions,
		'agoraRequestAccess',
	);
	const result = await call(request);

	return result.data;
}

function forget(uid: string | null): void {
	store.uid = uid;
	store.loaded = false;
	store.failed = false;
	store.approved = false;
	store.isAdmin = false;
	store.requests = [];
}

/**
 * Read the status for `uid` once; callers for the same account share the read.
 * `force` re-asks (after a submit or a withdraw).
 */
export function loadAccess(uid: string, force = false): Promise<void> {
	if (store.uid !== uid) forget(uid);
	if (inFlight?.uid === uid) return inFlight.promise;
	// A failed read counts as an answer: the screen offers a retry (force), and
	// redraws must not turn one failure into a loop of calls
	if (store.loaded && !force) return Promise.resolve();

	const promise = (async () => {
		try {
			const response = await callAccess({ action: 'status' });
			if (store.uid !== uid || response.action !== 'status') return;
			store.approved = response.approved;
			store.isAdmin = response.isAdmin;
			store.requests = response.requests;
			store.failed = false;
		} catch (error) {
			console.error('[Access] Reading the access status failed:', error);
			if (store.uid === uid) store.failed = true;
		}
		if (store.uid === uid) store.loaded = true;
		m.redraw();
	})().finally(() => {
		if (inFlight?.promise === promise) inFlight = null;
	});
	inFlight = { uid, promise };

	return promise;
}

/** Ask for access. Resolves with the new request's id; a refusal throws for the caller to map. */
export async function submitAccessRequest(
	request: Extract<RequestAccessRequest, { action: 'submit' }>,
): Promise<string> {
	const response = await callAccess(request);
	if (response.action !== 'submit') throw new Error('Unexpected access response');

	return response.requestId;
}

export async function withdrawAccessRequest(requestId: string): Promise<void> {
	await callAccess({ action: 'withdraw', requestId });
}

/** Leave a message for the request screen to show once */
export function setAccessFlash(key: string | null): void {
	flashKey = key;
}

export function takeAccessFlash(): string | null {
	const key = flashKey;
	flashKey = null;

	return key;
}

/**
 * A gated callable said "not approved": send the teacher to the request
 * screen with a clear sentence. Returns whether this was that refusal, so a
 * caller's own error handling can stand down.
 */
export function routeIfNotApproved(error: unknown): boolean {
	if (!isNotApprovedError(error)) return false;
	// The cache may have said "approved" a moment ago; it is stale now
	store.approved = false;
	store.loaded = false;
	flashKey = 'access.gate_message';
	m.route.set('/teach/request', undefined, { replace: true });

	return true;
}

/**
 * Run one of the gated callables. A "not approved" refusal reroutes to the
 * request screen and is still thrown, so the caller's own `catch` (which only
 * ever shows its own translated sentence) cannot mistake it for success.
 */
export async function withApprovalGate<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		routeIfNotApproved(error);
		throw error;
	}
}
