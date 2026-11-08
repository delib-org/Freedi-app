import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import type { Unsubscribe } from '@/lib/firebase';
import { setEvaluation } from '@/lib/userEvaluations';
import { t } from '@/lib/i18n';
import { listenClassOptions, listenMates, listenMyRatings, matesOf } from '@/lib/classroom/c3Data';
import type { Mate } from '@/lib/classroom/c3Logic';

/**
 * The live data one table screen reads, behind one object: the class's
 * options (answers + proposals), my tablemates, and my ratings. `sync` is
 * called on every view and only re-subscribes when its inputs changed, so a
 * redraw never churns a listener.
 */
export class FlowFeed {
	options: Statement[] = [];
	mates: Mate[] = [];
	ratings = new Map<string, number>();
	/** Taps in flight: shown at once, dropped when the server agrees (or the write fails). */
	pending = new Map<string, number>();
	optionsLoaded = false;
	ratingsLoaded = false;

	private optionsStop: Unsubscribe | null = null;
	private matesStop: Unsubscribe | null = null;
	private ratingsStop: Unsubscribe | null = null;
	private lessonId: string | null = null;
	private tableId: string | null = null;
	private ratingKey = '';

	private onError = (error: Error): void => {
		console.error('[C3] feed listener error:', error);
	};

	sync(
		main: Statement,
		mainId: string,
		tableId: string | null,
		ratingParents: readonly string[],
		withMates = true,
	): void {
		if (mainId !== this.lessonId) {
			this.optionsStop?.();
			this.lessonId = mainId;
			this.optionsLoaded = false;
			this.optionsStop = listenClassOptions(
				mainId,
				(options) => {
					this.options = options;
					this.optionsLoaded = true;
					m.redraw();
				},
				this.onError,
			);
		}
		if (withMates && tableId !== this.tableId) {
			this.matesStop?.();
			this.matesStop = null;
			this.tableId = tableId;
			this.mates = [];
			if (tableId) {
				this.matesStop = listenMates(
					mainId,
					tableId,
					(subs) => {
						this.mates = matesOf(subs, t('turn.someone'));
						m.redraw();
					},
					this.onError,
				);
			}
		}
		const key = [...ratingParents].sort().join('|');
		if (key !== this.ratingKey) {
			this.ratingsStop?.();
			this.ratingKey = key;
			this.ratingsLoaded = false;
			this.ratingsStop = listenMyRatings(
				ratingParents,
				(ratings) => {
					this.ratings = ratings;
					this.ratingsLoaded = true;
					for (const [id, score] of this.pending) {
						if (ratings.get(id) === score) this.pending.delete(id);
					}
					m.redraw();
				},
				this.onError,
			);
		}
	}

	ratingOf(statementId: string): number | undefined {
		return this.pending.get(statementId) ?? this.ratings.get(statementId);
	}

	/** Save a rating (Join's pipeline: the same evaluation doc the cloud function reads). */
	async rate(option: Statement, score: number): Promise<void> {
		this.pending.set(option.statementId, score);
		m.redraw();
		try {
			await setEvaluation(option, score);
		} catch (error) {
			this.pending.delete(option.statementId);
			m.redraw();
			throw error;
		}
	}

	stop(): void {
		this.optionsStop?.();
		this.matesStop?.();
		this.ratingsStop?.();
		this.optionsStop = null;
		this.matesStop = null;
		this.ratingsStop = null;
		this.lessonId = null;
		this.tableId = null;
		this.ratingKey = '';
	}
}
