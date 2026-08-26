import type { CallableRequest } from 'firebase-functions/v2/https';
import type { FakeDb } from './fakeFirestore';

/** Shape of the handler that our `onCall` mock returns unchanged. */
export type Handler<TReq, TRes> = (request: CallableRequest<TReq>) => Promise<TRes>;

export function asHandler<TReq, TRes>(fn: unknown): Handler<TReq, TRes> {
	return fn as Handler<TReq, TRes>;
}

export function makeRequest<T>(
	data: T,
	auth?: { uid: string; email?: string; name?: string },
): CallableRequest<T> {
	return {
		data,
		auth: auth ? { uid: auth.uid, token: { email: auth.email, name: auth.name } } : undefined,
		rawRequest: {},
		acceptsStreaming: false,
	} as unknown as CallableRequest<T>;
}

export async function expectHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
	let caught: unknown;
	try {
		await promise;
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeDefined();
	expect((caught as { code?: string }).code).toBe(code);
}

export function fakeDbFrom(module: { db: unknown }): FakeDb {
	return module.db as FakeDb;
}
