/**
 * Tails the per-worker NDJSON files written by trace-shim.cjs, so the run can
 * wait for the functions emulator to go quiet and later aggregate per phase.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { MAX_FUNCTIONS_RSS_MB, SETTLE_QUIET_MS, SETTLE_TIMEOUT_MS } from './config';
import type { TraceRecord } from './metrics';

const POLL_MS = 200;
const RSS_CHECK_EVERY_MS = 5000;
const KB_PER_MB = 1024;

export class TraceTail {
	readonly records: TraceRecord[] = [];
	private readonly offsets = new Map<string, number>();
	private readonly partial = new Map<string, string>();
	private started = 0;
	private ended = 0;
	private lastActivityAt = Date.now();
	private lastRssCheckAt = 0;
	peakRssMb = 0;
	peakWorkers = 0;

	constructor(private readonly dir: string) {}

	poll(): void {
		for (const name of readdirSync(this.dir)) {
			if (name.endsWith('.ndjson')) this.readNew(path.join(this.dir, name));
		}
	}

	private readNew(file: string): void {
		const size = statSync(file).size;
		const offset = this.offsets.get(file) ?? 0;
		if (size <= offset) return;

		const fd = openSync(file, 'r');
		const buffer = Buffer.alloc(size - offset);
		readSync(fd, buffer, 0, buffer.length, offset);
		closeSync(fd);
		this.offsets.set(file, size);

		const text = (this.partial.get(file) ?? '') + buffer.toString('utf8');
		const lines = text.split('\n');
		this.partial.set(file, lines.pop() ?? '');
		for (const line of lines) {
			if (!line) continue;
			const record = JSON.parse(line) as TraceRecord;
			this.records.push(record);
			if (record.k === 'start') this.started += 1;
			if (record.k === 'end') this.ended += 1;
			this.lastActivityAt = Date.now();
		}
	}

	get inFlight(): number {
		return this.started - this.ended;
	}

	get invocations(): number {
		return this.started;
	}

	/** Resolves when the trace shows at least one finished invocation of every named function. */
	async waitForFunctions(names: string[], timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			this.poll();
			const finished = new Set(
				this.records.filter((record) => record.k === 'end').map((record) => record.fn),
			);
			if (names.every((name) => finished.has(name))) return;
			if (Date.now() > deadline) {
				throw new Error(
					`Triggers never ran: ${names.filter((name) => !finished.has(name)).join(', ')}`,
				);
			}
			await sleep(POLL_MS);
		}
	}

	/**
	 * Resolves once no invocation is running and the trace has been quiet for a
	 * while. The quiet period counts from now, so a batch just written has time
	 * to reach a worker before silence is taken to mean "done".
	 */
	async waitSettled(quietMs = SETTLE_QUIET_MS, timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		this.lastActivityAt = Date.now();
		for (;;) {
			this.poll();
			this.checkRss();
			const quietFor = Date.now() - this.lastActivityAt;
			if (this.inFlight === 0 && quietFor >= quietMs) return;
			if (Date.now() > deadline) {
				throw new Error(
					`Emulator did not settle within ${timeoutMs}ms (in flight: ${this.inFlight}).`,
				);
			}
			await sleep(POLL_MS);
		}
	}

	private checkRss(): void {
		const now = Date.now();
		if (now - this.lastRssCheckAt < RSS_CHECK_EVERY_MS) return;
		this.lastRssCheckAt = now;
		const output = execFileSync('ps', ['-Ao', 'rss=,command='], { encoding: 'utf8' });
		let rssKb = 0;
		let workers = 0;
		for (const line of output.split('\n')) {
			if (!line.includes('functionsEmulatorRuntime')) continue;
			workers += 1;
			rssKb += Number(line.trim().split(/\s+/)[0]) || 0;
		}
		const rssMb = Math.round(rssKb / KB_PER_MB);
		this.peakRssMb = Math.max(this.peakRssMb, rssMb);
		this.peakWorkers = Math.max(this.peakWorkers, workers);
		if (rssMb > MAX_FUNCTIONS_RSS_MB) {
			throw new Error(
				`Functions workers use ${rssMb} MB, over the ${MAX_FUNCTIONS_RSS_MB} MB cap.`,
			);
		}
	}
}
