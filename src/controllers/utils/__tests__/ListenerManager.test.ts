import { ListenerManager } from '../ListenerManager';

/**
 * These tests focus on the ref-count lifecycle, especially the race where a
 * listener is torn down while its async setup is still in flight. Before the
 * fix, that left an orphaned listener (refCount 1, owned by no one) which made
 * every later registerListenerIntent() return false and silently drop the new
 * subscriber's onNext — the root cause of the home screen showing only a few
 * subscriptions on a cold load.
 *
 * ListenerManager is a singleton, so each test uses a unique key to stay
 * isolated from the others.
 */
describe('ListenerManager ref-count lifecycle', () => {
	const mgr = ListenerManager.getInstance();

	it('sets up on first intent and tears down when the last subscriber leaves', async () => {
		const key = 'test-basic-lifecycle';
		const unsubscribe = jest.fn();

		expect(mgr.registerListenerIntent(key)).toBe(true);
		await mgr.addListener(key, () => unsubscribe);

		expect(mgr.hasListener(key)).toBe(true);

		// Removing the only subscriber tears the listener down.
		mgr.removeListener(key);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(mgr.hasListener(key)).toBe(false);
	});

	it('does NOT orphan a listener torn down while setup is still pending', async () => {
		const key = 'test-pending-cancel';
		const unsubscribe = jest.fn();

		// Controllable async setup to simulate the in-flight window.
		let resolveSetup: (() => void) | undefined;
		const setupFn = () =>
			new Promise<() => void>((resolve) => {
				resolveSetup = () => resolve(unsubscribe);
			});

		expect(mgr.registerListenerIntent(key)).toBe(true);
		const addPromise = mgr.addListener(key, setupFn);

		// Subscriber unmounts before setup completes.
		mgr.removeListener(key);

		// Setup now finishes — it should tear itself down, not store an orphan.
		resolveSetup?.();
		await addPromise;

		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(mgr.hasListener(key)).toBe(false);

		// The next subscriber must get a fresh setup (true), not a dropped onNext.
		expect(mgr.registerListenerIntent(key)).toBe(true);
		mgr.removeListener(key); // clean up the pending intent we just created
	});

	it('accumulates ref count for subscribers that join during pending setup', async () => {
		const key = 'test-pending-join';
		const unsubscribe = jest.fn();

		let resolveSetup: (() => void) | undefined;
		const setupFn = () =>
			new Promise<() => void>((resolve) => {
				resolveSetup = () => resolve(unsubscribe);
			});

		// Two subscribers register while setup is in flight.
		expect(mgr.registerListenerIntent(key)).toBe(true);
		const addPromise = mgr.addListener(key, setupFn);
		expect(mgr.registerListenerIntent(key)).toBe(false); // joins the pending one

		resolveSetup?.();
		await addPromise;

		// First removal only decrements (refCount 2 -> 1), second tears down.
		mgr.removeListener(key);
		expect(unsubscribe).not.toHaveBeenCalled();
		mgr.removeListener(key);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(mgr.hasListener(key)).toBe(false);
	});

	it('shares one listener across concurrent subscribers and tears down once', async () => {
		const key = 'test-shared';
		const unsubscribe = jest.fn();

		expect(mgr.registerListenerIntent(key)).toBe(true);
		await mgr.addListener(key, () => unsubscribe);

		// Second subscriber joins the already-active listener.
		expect(mgr.registerListenerIntent(key)).toBe(false);

		mgr.removeListener(key);
		expect(unsubscribe).not.toHaveBeenCalled();
		mgr.removeListener(key);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(mgr.hasListener(key)).toBe(false);
	});
});
