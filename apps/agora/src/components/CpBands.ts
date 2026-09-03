import m from 'mithril';
import { t } from '../lib/i18n';
import {
	agoraCpBand,
	cpOf,
	groupByCpBand,
	rankByCp,
	type AgoraCarriedAnswer,
	type AgoraCpBand,
	type AgoraCpBandSummary,
} from '@freedi/shared-types';

export interface CpBandsAttrs {
	/** The answers that travelled forward — the ones above the admin's cutoff */
	answers: readonly AgoraCarriedAnswer[];
	/** The AI's line per band, written when the stage closed. Absent while the stage is live */
	bands?: readonly AgoraCpBandSummary[];
	/** Print each answer under its band. Off for the folded carried-context card */
	showAnswers?: boolean;
}

const BAND_LABEL: Record<AgoraCpBand, string> = {
	strong: 'cp.band_strong',
	emerging: 'cp.band_emerging',
	contested: 'cp.band_contested',
	unrated: 'cp.band_unrated',
};

/** The static line a band carries before the AI has written its own */
const BAND_HINT: Record<AgoraCpBand, string> = {
	strong: 'cp.hint_strong',
	emerging: 'cp.hint_emerging',
	contested: 'cp.hint_contested',
	unrated: 'cp.hint_unrated',
};

/** C_p as the panels print it: a signed two-decimal figure */
export function formatCp(value: number): string {
	const rounded = Math.round(value * 100) / 100;

	return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

/** The band an answer sits in, for a chip on the answer's own card */
export function bandLabelOf(row: AgoraCarriedAnswer): string {
	return t(BAND_LABEL[agoraCpBand(row)]);
}

export function bandClassOf(row: AgoraCarriedAnswer): string {
	return `cp-chip cp-chip--${agoraCpBand(row)}`;
}

/**
 * What the room is behind, read band by band.
 *
 * The same renderer serves the teacher's live preview and the closed record
 * the students read: it does the banding itself off the answers, and shows
 * the AI's prose for a band only where that prose exists. So the panel a
 * teacher watches while the question is open is the panel the class gets
 * when it closes — plus the writing.
 */
export function CpBands(): m.Component<CpBandsAttrs> {
	return {
		view(vnode) {
			const { answers, bands, showAnswers = true } = vnode.attrs;
			if (answers.length === 0) return null;
			const prose = new Map((bands ?? []).map((band) => [band.band, band.text]));
			const groups = groupByCpBand(rankByCp([...answers]));

			return m('.cp-bands', [
				groups.map((group) =>
					m('.cp-band', { key: group.band, class: `cp-band--${group.band}` }, [
						m('.cp-band__head', [
							m('span.cp-band__label', t(BAND_LABEL[group.band])),
							group.band === 'unrated'
								? null
								: m(
										'span.cp-band__score',
										t('cp.value', {
											value: formatCp(
												group.rows.reduce((sum, row) => sum + cpOf(row), 0) / group.rows.length,
											),
										}),
									),
							m('span.cp-band__count', t('cp.count', { n: group.rows.length })),
						]),
						m('p.cp-band__text', prose.get(group.band) ?? t(BAND_HINT[group.band])),
						showAnswers
							? m(
									'ul.cp-band__answers',
									group.rows.map((row) =>
										m('li.cp-band__answer', { key: row.statementId }, [
											row.anonName ? m('span.cp-band__who', row.anonName) : null,
											m('span.cp-band__answer-text', row.statement),
											row.raters > 0
												? m(
														'span.cp-band__meta',
														t('cp.answer_meta', {
															value: formatCp(cpOf(row)),
															n: row.raters,
														}),
													)
												: null,
										]),
									),
								)
							: null,
					]),
				),
				m('p.cp-bands__explain', t('cp.explain')),
			]);
		},
	};
}
