import { describe, it, expect, vi } from 'vitest';
import { createBallotSender, REPEAT_TAP_MS, type BallotChoice } from '../ballotTap';

/** A send whose writes the test settles by hand, in order. */
function manualSend() {
	const calls: { choice: BallotChoice; resolve: () => void; reject: (e: unknown) => void }[] = [];
	const send = vi.fn(
		(choice: BallotChoice) =>
			new Promise<void>((resolve, reject) => {
				calls.push({ choice, resolve, reject });
			}),
	);

	return { send, calls };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
	let clock = 1000;
	const { send, calls } = manualSend();
	const onChange = vi.fn();
	const onError = vi.fn();
	const sender = createBallotSender({ send, onChange, onError, now: () => clock });
	const advance = (ms: number): void => {
		clock += ms;
	};

	return { sender, send, calls, onChange, onError, advance };
}

describe('createBallotSender', () => {
	it('shows the tapped option at once, before the server answers', () => {
		const { sender, send } = setup();
		sender.tap('a', null);

		expect(sender.displayed(null)).toBe('a');
		expect(sender.isSaving()).toBe(true);
		expect(send).toHaveBeenCalledWith('a');
	});

	it('hands back to the confirmed vote once the write lands', async () => {
		const { sender, calls } = setup();
		sender.tap('a', null);
		calls[0].resolve();
		await flush();

		expect(sender.isSaving()).toBe(false);
		expect(sender.displayed('a')).toBe('a');
	});

	it('never has two writes in the air; the last tap wins', async () => {
		const { sender, send, calls, advance } = setup();
		sender.tap('a', null);
		advance(REPEAT_TAP_MS + 1);
		sender.tap('b', null);
		advance(REPEAT_TAP_MS + 1);
		sender.tap('c', null);

		expect(send).toHaveBeenCalledTimes(1);
		expect(sender.displayed(null)).toBe('c');

		calls[0].resolve();
		await flush();
		expect(send).toHaveBeenCalledTimes(2);
		expect(calls[1].choice).toBe('c');

		calls[1].resolve();
		await flush();
		expect(sender.isSaving()).toBe(false);
	});

	it('treats an impatient double tap as one vote, not a withdrawal', () => {
		const { sender, send, advance } = setup();
		sender.tap('a', null);
		advance(150);
		sender.tap('a', null);

		expect(sender.displayed(null)).toBe('a');
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('withdraws on a deliberate second tap of my own vote', () => {
		const { sender, send } = setup();
		sender.tap('a', 'a');

		expect(sender.displayed('a')).toBeNull();
		expect(send).toHaveBeenCalledWith(null);
	});

	it('toggles against the optimistic choice, not the stale server one', async () => {
		const { sender, calls, advance } = setup();
		sender.tap('a', null);
		advance(REPEAT_TAP_MS + 1);
		// Server still says nothing; the student taps their (shown) vote again
		sender.tap('a', null);

		expect(sender.displayed(null)).toBeNull();
		calls[0].resolve();
		await flush();
		expect(calls[1].choice).toBeNull();
	});

	it('falls back to the confirmed vote on failure and retries in one tap', async () => {
		const { sender, send, calls, onError } = setup();
		sender.tap('a', 'b');
		const failure = new Error('offline');
		calls[0].reject(failure);
		await flush();

		expect(onError).toHaveBeenCalledWith(failure, 'a');
		expect(sender.hasFailed()).toBe(true);
		expect(sender.isSaving()).toBe(false);
		expect(sender.displayed('b')).toBe('b');

		sender.retry();
		expect(send).toHaveBeenCalledTimes(2);
		expect(calls[1].choice).toBe('a');
		expect(sender.hasFailed()).toBe(false);
		expect(sender.displayed('b')).toBe('a');
	});

	it('a failure superseded by a newer tap is not shown as failed', async () => {
		const { sender, calls, advance } = setup();
		sender.tap('a', null);
		advance(REPEAT_TAP_MS + 1);
		sender.tap('b', null);
		calls[0].reject(new Error('x'));
		await flush();

		expect(sender.hasFailed()).toBe(false);
		expect(calls[1].choice).toBe('b');
	});

	it('retry without a failure does nothing', () => {
		const { sender, send } = setup();
		sender.retry();

		expect(send).not.toHaveBeenCalled();
	});

	it('redraws on every change', async () => {
		const { sender, calls, onChange } = setup();
		sender.tap('a', null);
		expect(onChange).toHaveBeenCalledTimes(1);
		calls[0].resolve();
		await flush();
		expect(onChange).toHaveBeenCalledTimes(2);
	});
});
