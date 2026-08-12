/**
 * Types for the contrast auditor, which is plain .mjs.
 *
 * It exists so a TypeScript caller (scripts/board-shots.ts) can measure a live
 * screen without the import landing as an implicit `any` — the one type the
 * project forbids outright. Keep this in step with contrast-audit.mjs; the
 * shapes below are exactly what `failures.push({...})` writes and what
 * `triage()` returns.
 */
import type { Page } from '@playwright/test';

/** One text run that measured below its floor */
export interface ContrastRun {
	/** CSS-ish description of the element, e.g. `span.board__bridge-label` */
	selector: string;
	/** The first 48 characters of its own text */
	text: string;
	ratio: number;
	/** The floor it had to clear — 4.5 normal, 3 large */
	needs: number;
	/** Its computed colour */
	color: string;
	/** The worst background it was measured against */
	on: string;
}

export interface ContrastResult {
	label: string;
	failures: ContrastRun[];
}

/** Split measured failures into the ones on the accepted ledger and the ones that gate */
export function triage(result: ContrastResult): ContrastResult & { known: ContrastRun[] };

/** Measure every visible text run on `page` as it actually rendered */
export function auditPage(
	page: Page,
	options?: { label?: string; min?: number },
): Promise<ContrastResult>;

/** Print a report; returns true if nothing NEW is unreadable */
export function report(result: ContrastResult): boolean;
