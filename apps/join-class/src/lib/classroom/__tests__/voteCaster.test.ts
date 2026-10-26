import { describe, expect, it, vi } from 'vitest';
import { VoteCaster } from '../voteCaster';

interface Deferred {
	id: string;
	resolve: () => void;
	reject: (error: Error) => void;
}

function setup(): { caster: VoteCaster; calls: Deferred[]; sent: string[]; errors: unknown[] } {
	const calls: Deferred[] = [];
	const sent: string[] = [];
	const errors: unknown[] = [];
	const caster = new VoteCaster({
		write: (id) =>
			new Promise<void>((resolve, reject) => {
				sent.push(id);
				calls.push({ id, resolve, reject });
			}),
		onChange: vi.fn(),
		canCast: () => true,
		onError: (error) => errors.push(error),
	});

	return { caster, calls, sent, errors };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('VoteCaster', () => {
	it('casts at once on a pick, with no submit step', async () => {
		const { caster, calls, sent } = setup();
		caster.pick('a');
		await flush();
		expect(sent).toEqual(['a']);
		expect(caster.pending).toBe(true);
		calls[0].resolve();
		await flush();
		expect(caster.written).toBe('a');
		expect(caster.pending).toBe(false);
		expect(caster.busy).toBe(false);
	});

	it('moves the vote when another card is tapped', async () => {
		const { caster, calls, sent } = setup();
		caster.pick('a');
		await flush();
		calls[0].resolve();
		await flush();
		caster.pick('b');
		await flush();
		calls[1].resolve();
		await flush();
		expect(sent).toEqual(['a', 'b']);
		expect(caster.written).toBe('b');
	});

	it('latest pick wins, writes never overlap, skipped picks are not sent', async () => {
		const { caster, calls, sent } = setup();
		caster.pick('a');
		caster.pick('b');
		caster.pick('c');
		await flush();
		expect(sent).toEqual(['a']);
		calls[0].resolve();
		await flush();
		expect(sent).toEqual(['a', 'c']);
		calls[1].resolve();
		await flush();
		expect(caster.written).toBe('c');
		expect(caster.wanted).toBe('c');
	});

	it('does not write again for the card that is already the vote', async () => {
		const { caster, sent } = setup();
		caster.sync('a');
		caster.pick('a');
		await flush();
		expect(sent).toEqual([]);
	});

	it('stops on a failure and retries the latest pick', async () => {
		const { caster, calls, sent, errors } = setup();
		caster.pick('a');
		await flush();
		calls[0].reject(new Error('offline'));
		await flush();
		expect(caster.failed).toBe(true);
		expect(errors).toHaveLength(1);
		expect(caster.pending).toBe(true);
		caster.retry();
		await flush();
		expect(sent).toEqual(['a', 'a']);
		calls[1].resolve();
		await flush();
		expect(caster.failed).toBe(false);
		expect(caster.written).toBe('a');
	});

	it('ignores the server echo while a write is in flight', async () => {
		const { caster, calls } = setup();
		caster.pick('b');
		await flush();
		caster.sync('a');
		expect(caster.wanted).toBe('b');
		calls[0].resolve();
		await flush();
		expect(caster.written).toBe('b');
	});

	it('re-sends the newer pick when a stale echo of an older vote arrives after the last write', async () => {
		const { caster, calls, sent } = setup();
		caster.sync('a');
		caster.pick('b');
		await flush();
		calls[0].resolve();
		await flush();
		expect(caster.written).toBe('b');
		caster.sync('a');
		await flush();
		expect(sent).toEqual(['b', 'b']);
		calls[1].resolve();
		await flush();
		expect(caster.written).toBe('b');
		expect(caster.pending).toBe(false);
	});
});
