/**
 * Pure arithmetic over trace records and sampled counts. No I/O, so it is
 * unit-tested and a later rerun cannot disagree with the baseline about maths.
 */

export interface TraceRecord {
	t: number;
	fn: string;
	pid: number;
	k: 'start' | 'end' | 'r' | 'w' | 'wf';
	inv?: string;
	ended?: boolean;
	via?: 'query' | 'aggregate' | 'doc';
	coll?: string;
	n?: number;
	byCol?: Record<string, number>;
	/** Field names of each write to the question document in this commit. */
	qf?: string[][];
	docs?: string[];
}

export interface PhaseWindow {
	name: string;
	from: number;
	to: number;
	units: number;
}

export interface FunctionCost {
	invocations: number;
	meanMs: number;
	p95Ms: number;
	docsRead: number;
	docsWritten: number;
}

export interface PhaseCost {
	name: string;
	units: number;
	invocationsTotal: number;
	byFunction: Record<string, FunctionCost>;
	readsByCollection: Record<string, number>;
	writesByCollection: Record<string, number>;
	totalReads: number;
	totalWrites: number;
	questionDocWrites: number;
	/** `function: field, field` to count: who writes the question document, and what. */
	questionWriters: Record<string, number>;
	writesAfterReturn: Record<string, number>;
	failedCommits: number;
}

export function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.ceil((p / 100) * sorted.length) - 1;

	return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

export function mean(values: number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function add(map: Record<string, number>, key: string, by: number): void {
	map[key] = (map[key] ?? 0) + by;
}

/** Costs of every invocation that STARTED inside the window. */
export function aggregatePhase(
	records: TraceRecord[],
	phase: PhaseWindow,
	questionDocPath: string,
): PhaseCost {
	const invocations = new Map<string, { fn: string; start: number; end?: number }>();
	for (const record of records) {
		if (record.k === 'start' && record.inv && record.t >= phase.from && record.t <= phase.to) {
			invocations.set(record.inv, { fn: record.fn, start: record.t });
		}
	}

	const cost: PhaseCost = {
		name: phase.name,
		units: phase.units,
		invocationsTotal: invocations.size,
		byFunction: {},
		readsByCollection: {},
		writesByCollection: {},
		totalReads: 0,
		totalWrites: 0,
		questionDocWrites: 0,
		questionWriters: {},
		writesAfterReturn: {},
		failedCommits: 0,
	};
	const durations = new Map<string, number[]>();
	const reads = new Map<string, number>();
	const writes = new Map<string, number>();

	for (const record of records) {
		if (!record.inv) continue;
		const invocation = invocations.get(record.inv);
		if (!invocation) continue;
		if (record.k === 'end') {
			invocation.end = record.t;
		} else if (record.k === 'r') {
			const count = record.n ?? 0;
			cost.totalReads += count;
			reads.set(invocation.fn, (reads.get(invocation.fn) ?? 0) + count);
			if (record.via === 'doc' && record.byCol) {
				for (const [collection, n] of Object.entries(record.byCol)) {
					add(cost.readsByCollection, collection, n);
				}
			} else {
				add(cost.readsByCollection, record.coll ?? 'unknown', count);
			}
		} else if (record.k === 'w') {
			const count = record.n ?? 0;
			cost.totalWrites += count;
			writes.set(invocation.fn, (writes.get(invocation.fn) ?? 0) + count);
			for (const [collection, n] of Object.entries(record.byCol ?? {})) {
				add(cost.writesByCollection, collection, n);
				if (record.ended) add(cost.writesAfterReturn, collection, n);
			}
			cost.questionDocWrites += (record.docs ?? []).filter((doc) => doc === questionDocPath).length;
			for (const fields of record.qf ?? []) {
				add(cost.questionWriters, `${invocation.fn}: ${[...fields].sort().join(', ')}`, 1);
			}
		} else if (record.k === 'wf') {
			cost.failedCommits += 1;
		}
	}

	for (const invocation of invocations.values()) {
		if (invocation.end === undefined) continue;
		const list = durations.get(invocation.fn) ?? [];
		list.push(invocation.end - invocation.start);
		durations.set(invocation.fn, list);
	}
	const invocationList = [...invocations.values()];
	for (const fn of new Set(invocationList.map((invocation) => invocation.fn))) {
		const list = durations.get(fn) ?? [];
		cost.byFunction[fn] = {
			invocations: invocationList.filter((invocation) => invocation.fn === fn).length,
			meanMs: Math.round(mean(list)),
			p95Ms: percentile(list, 95),
			docsRead: reads.get(fn) ?? 0,
			docsWritten: writes.get(fn) ?? 0,
		};
	}

	return cost;
}

export function perUnit(total: number, units: number): number {
	return units === 0 ? 0 : total / units;
}

/** A sampled per-participant count scaled to the whole population. */
export function scaleToPopulation(perParticipant: number, population: number): number {
	return perParticipant * population;
}

/** Writes delivered to every listener: the fan-out read count. */
export function fanOutReads(writes: number, listeners: number): number {
	return writes * listeners;
}

export interface ExposureStats {
	totalAnswers: number;
	ratedAnswers: number;
	totalRatings: number;
	unratedAnswers: number;
	/** Mean ratings per answer for each age quarter, oldest quarter first. */
	meanByAgeQuarter: number[];
	maxRatings: number;
	/** Share of all ratings received by the most-rated tenth of answers. */
	topTenthShare: number;
}

/** @param ratings ratings per answer, in creation order (oldest first). */
export function exposureStats(ratings: number[]): ExposureStats {
	const total = ratings.reduce((sum, v) => sum + v, 0);
	const quarters: number[][] = [[], [], [], []];
	ratings.forEach((value, index) => {
		const quarter = Math.min(Math.floor((index * 4) / ratings.length), 3);
		quarters[quarter].push(value);
	});
	const sorted = [...ratings].sort((a, b) => b - a);
	const topCount = Math.max(1, Math.ceil(ratings.length / 10));
	const topSum = sorted.slice(0, topCount).reduce((sum, v) => sum + v, 0);

	return {
		totalAnswers: ratings.length,
		ratedAnswers: ratings.filter((v) => v > 0).length,
		totalRatings: total,
		unratedAnswers: ratings.filter((v) => v === 0).length,
		meanByAgeQuarter: quarters.map((quarter) => Number(mean(quarter).toFixed(1))),
		maxRatings: sorted[0] ?? 0,
		topTenthShare: total === 0 ? 0 : Number((topSum / total).toFixed(3)),
	};
}

/** Ratio spread of two runs of the same size: |a-b| / max(a,b), 0 when both are 0. */
export function relativeDifference(a: number, b: number): number {
	const larger = Math.max(Math.abs(a), Math.abs(b));

	return larger === 0 ? 0 : Math.abs(a - b) / larger;
}
