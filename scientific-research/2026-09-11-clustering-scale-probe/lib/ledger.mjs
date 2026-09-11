// Append-only budget ledger. Every request reserves its worst-case charge
// BEFORE dispatch; the reservation is settled at actual cost when usage comes
// back, or retained at full value when billing is uncertain (timeout, network
// error, missing usage). Reservation is synchronous (no await between the
// check and the append), so concurrent async workers in this process cannot
// overspend; a lock file keeps a second process out.
import { existsSync, openSync, closeSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { appendJsonl, readJsonl } from './util.mjs';

export class BudgetExceeded extends Error {
	constructor(detail) {
		super(`budget: ${JSON.stringify(detail)}`);
		this.detail = detail;
	}
}

const EPS = 1e-12;

export class Ledger {
	constructor(path, { capUsd, stageCaps = {} }) {
		this.path = path;
		this.capUsd = capUsd;
		this.stageCaps = stageCaps;
		this.open = new Map(); // resId → reserve event
		this.charged = new Map(); // resId → {usd, stage, kind}
		this.attempts = new Map(); // callId → attempts reserved
		this.orphans = [];
		this.seq = 0;
		for (const e of readJsonl(path)) this.#apply(e);
		this.orphans = [...this.open.values()];
	}

	#apply(e) {
		this.seq = Math.max(this.seq, e.seq ?? 0);
		if (e.type === 'reserve') {
			this.open.set(e.resId, e);
			this.attempts.set(e.callId, (this.attempts.get(e.callId) ?? 0) + 1);
		} else if (e.type === 'settle' || e.type === 'retain') {
			const r = this.open.get(e.resId);
			if (!r) throw new Error(`ledger: ${e.type} for unknown reservation ${e.resId}`);
			this.open.delete(e.resId);
			this.charged.set(e.resId, {
				usd: e.type === 'settle' ? e.actualUsd : r.amountUsd,
				stage: r.stage,
				kind: e.type,
			});
		}
	}

	#append(e) {
		const event = { seq: ++this.seq, at: new Date().toISOString(), ...e };
		appendJsonl(this.path, event);
		this.#apply(event);

		return event;
	}

	spent(stage) {
		let s = 0;
		for (const c of this.charged.values()) if (!stage || c.stage === stage) s += c.usd;

		return s;
	}

	reserved(stage) {
		let s = 0;
		for (const r of this.open.values()) if (!stage || r.stage === stage) s += r.amountUsd;

		return s;
	}

	committed(stage) {
		return this.spent(stage) + this.reserved(stage);
	}

	attemptsFor(callId) {
		return this.attempts.get(callId) ?? 0;
	}

	/** Synchronous check-and-append. Throws BudgetExceeded without writing. */
	reserve({ callId, attempt, stage, amountUsd, detail }) {
		if (!(amountUsd >= 0)) throw new Error(`ledger: bad reservation amount ${amountUsd}`);
		const total = this.committed() + amountUsd;
		if (total > this.capUsd + EPS) throw new BudgetExceeded({ scope: 'total', cap: this.capUsd, wouldBe: total });
		const stageCap = this.stageCaps[stage];
		if (stageCap != null) {
			const st = this.committed(stage) + amountUsd;
			if (st > stageCap + EPS) throw new BudgetExceeded({ scope: stage, cap: stageCap, wouldBe: st });
		}
		const resId = `r${String(this.seq + 1).padStart(6, '0')}`;
		this.#append({ type: 'reserve', resId, callId, attempt, stage, amountUsd, detail });

		return resId;
	}

	settle(resId, cost) {
		this.#append({
			type: 'settle',
			resId,
			actualUsd: cost.billedUsd,
			undiscountedUsd: cost.undiscountedUsd,
			tokens: cost.tokens,
		});
	}

	retain(resId, reason) {
		this.#append({ type: 'retain', resId, reason });
	}

	/**
	 * Reservations left open by a crash. resolver(resEvent) returns a cost
	 * (reconciled from a persisted attempt record) or null → retained in full.
	 */
	resolveOrphans(resolver) {
		const out = [];
		for (const r of this.orphans) {
			if (!this.open.has(r.resId)) continue;
			const cost = resolver(r);
			if (cost) this.settle(r.resId, cost);
			else this.retain(r.resId, 'orphan-on-resume: billing uncertain');
			out.push({ resId: r.resId, reconciled: Boolean(cost) });
		}
		this.orphans = [];

		return out;
	}

	summary() {
		const stages = {};
		for (const c of this.charged.values()) {
			stages[c.stage] ??= { settledUsd: 0, retainedUsd: 0 };
			stages[c.stage][c.kind === 'settle' ? 'settledUsd' : 'retainedUsd'] += c.usd;
		}

		return { capUsd: this.capUsd, spentUsd: this.spent(), openReservedUsd: this.reserved(), stages };
	}
}

/** Single-process guard: O_EXCL lock file holding our pid; stale locks reclaimed. */
export function acquireLock(path) {
	if (existsSync(path)) {
		const pid = Number(readFileSync(path, 'utf8').trim());
		let alive = false;
		try {
			process.kill(pid, 0);
			alive = true;
		} catch {
			alive = false;
		}
		if (alive && pid !== process.pid) throw new Error(`another probe process (pid ${pid}) holds ${path}`);
		unlinkSync(path);
	}
	const fd = openSync(path, 'wx');
	writeSync(fd, String(process.pid));
	closeSync(fd);

	return () => {
		try {
			unlinkSync(path);
		} catch {
			/* already gone */
		}
	};
}
