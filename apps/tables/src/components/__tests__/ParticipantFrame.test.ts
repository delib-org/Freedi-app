// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

const calls = vi.hoisted(() => ({
	order: [] as string[],
	resolveUser: null as null | ((user: { uid: string }) => void),
}));

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/auth', () => ({
	ensureParticipantUser: () =>
		new Promise<{ uid: string }>((resolve) => {
			calls.order.push('signIn');
			calls.resolveUser = resolve;
		}),
}));
vi.mock('@/lib/tableAssignment/data', () => {
	const listener = (name: string) => () => (): (() => void) => {
		calls.order.push(name);

		return () => calls.order.push(`${name}:stop`);
	};

	return {
		subscribeSession: listener('session'),
		subscribeTopics: listener('topics'),
		subscribeSeats: listener('seats'),
		subscribeCounter: listener('counter'),
		subscribeMyParticipant: listener('me'),
	};
});

import { ParticipantFrame } from '../ParticipantFrame';

let root: HTMLElement;

function mount(): void {
	m.render(
		root,
		m(ParticipantFrame, { sessionId: 's1', counter: true, occupancy: true, render: () => null }),
	);
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe('ParticipantFrame listeners', () => {
	beforeEach(() => {
		calls.order.length = 0;
		calls.resolveUser = null;
		root = document.createElement('div');
	});

	it('starts no listener before the identity exists', () => {
		mount();

		expect(calls.order).toEqual(['signIn']);
	});

	it('starts the session, seats, counter and own record once the sign-in resolves', async () => {
		mount();
		calls.resolveUser?.({ uid: 'u1' });
		await flush();

		expect(calls.order).toEqual(['signIn', 'session', 'seats', 'counter', 'me']);
	});

	it('starts nothing when the sign-in finishes after the frame was removed', async () => {
		mount();
		m.render(root, null);
		calls.resolveUser?.({ uid: 'u1' });
		await flush();

		expect(calls.order).not.toContain('session');
		expect(calls.order).not.toContain('me');
	});
});
