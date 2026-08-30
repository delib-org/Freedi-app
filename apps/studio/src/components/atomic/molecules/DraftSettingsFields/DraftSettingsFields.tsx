import { useId, type FC } from 'react';
import clsx from 'clsx';
import type { StudioDraftCutoff } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Checkbox } from '@/components/atomic/atoms/Checkbox';
import { StatusPill, getActivityPresentation } from '@/components/atomic/atoms/Tag';
import { isDraftSource, type DraftSettings } from '@/utils/draftSettings';

/**
 * DraftSettingsFields molecule — the three choices behind a Draft step:
 * which activities to write from, which of their suggestions count (the
 * cutoff), and what the text should be (intent). Used by the document
 * drawer's "Draft from results" section and by the scheduled-action editor.
 * Styles: styles/molecules/_draft-fields.scss (.draft-fields)
 */
export interface DraftSettingsFieldsProps {
	/** The question's activities; only crowd surveys / live sessions are offered. */
	activities: DerivedActivity[];
	/** The document itself — never a source of its own draft. */
	excludeId?: string;
	value: DraftSettings;
	onChange: (next: DraftSettings) => void;
	disabled?: boolean;
	className?: string;
}

type CutoffMode = StudioDraftCutoff['mode'];

const MODES: readonly { value: CutoffMode; label: string }[] = [
	{ value: 'topN', label: 'The best suggestions by consensus' },
	{ value: 'chosen', label: 'The top answers only' },
	{ value: 'threshold', label: 'Everything above a consensus level' },
];

function toNumber(raw: string): number | undefined {
	if (raw.trim() === '') return undefined;
	const n = Number(raw);

	return Number.isFinite(n) ? n : undefined;
}

const DraftSettingsFields: FC<DraftSettingsFieldsProps> = ({
	activities,
	excludeId,
	value,
	onChange,
	disabled = false,
	className,
}) => {
	const { t } = useTranslation();
	const baseId = useId();
	const sources = activities.filter((a) => isDraftSource(a) && a.statementId !== excludeId);
	const { cutoff } = value;

	const setCutoff = (patch: Partial<StudioDraftCutoff>) =>
		onChange({ ...value, cutoff: { ...cutoff, ...patch } });

	const toggleSource = (statementId: string, checked: boolean) => {
		const next = checked
			? [...value.sourceStatementIds, statementId]
			: value.sourceStatementIds.filter((id) => id !== statementId);
		onChange({ ...value, sourceStatementIds: next });
	};

	return (
		<div className={clsx('draft-fields', disabled && 'draft-fields--disabled', className)}>
			<fieldset className="draft-fields__group" disabled={disabled}>
				<legend className="draft-fields__legend">{t('Write from')}</legend>
				{sources.length === 0 ? (
					<p className="draft-fields__empty">
						{t(
							'Add a crowd survey or a live session first — the draft is written from their results.',
						)}
					</p>
				) : (
					<ul className="draft-fields__sources">
						{sources.map((source) => (
							<li key={source.statementId} className="draft-fields__source">
								<Checkbox
									label={source.title || t('Untitled')}
									hint={t(getActivityPresentation(source.type).label)}
									checked={value.sourceStatementIds.includes(source.statementId)}
									disabled={disabled}
									name={`draft-source-${source.statementId}`}
									id={`${baseId}-src-${source.statementId}`}
									onChange={(checked) => toggleSource(source.statementId, checked)}
								/>
								<StatusPill status={source.runState} size="small" />
							</li>
						))}
					</ul>
				)}
			</fieldset>

			<fieldset className="draft-fields__group" disabled={disabled}>
				<legend className="draft-fields__legend">{t('Which suggestions')}</legend>
				<div className="draft-fields__modes" role="radiogroup" aria-label={t('Which suggestions')}>
					{MODES.map((mode) => (
						<label key={mode.value} className="draft-fields__mode">
							<input
								type="radio"
								className="draft-fields__radio"
								name={`${baseId}-mode`}
								value={mode.value}
								checked={cutoff.mode === mode.value}
								onChange={() => setCutoff({ mode: mode.value })}
							/>
							<span>{t(mode.label)}</span>
						</label>
					))}
				</div>
				<div className="draft-fields__numbers">
					{cutoff.mode === 'topN' && (
						<label className="draft-fields__number">
							<span>{t('How many')}</span>
							<input
								type="number"
								className="input__field"
								min={1}
								max={200}
								step={1}
								value={cutoff.n ?? ''}
								onChange={(event) => setCutoff({ n: toNumber(event.target.value) })}
							/>
						</label>
					)}
					{cutoff.mode === 'threshold' && (
						<label className="draft-fields__number">
							<span>{t('Minimum consensus (0–1)')}</span>
							<input
								type="number"
								className="input__field"
								min={0}
								max={1}
								step={0.05}
								value={cutoff.minConsensus ?? ''}
								onChange={(event) => setCutoff({ minConsensus: toNumber(event.target.value) })}
							/>
						</label>
					)}
					<label className="draft-fields__number">
						<span>{t('Minimum raters per suggestion')}</span>
						<input
							type="number"
							className="input__field"
							min={0}
							max={1000}
							step={1}
							value={cutoff.minEvaluators ?? ''}
							onChange={(event) => setCutoff({ minEvaluators: toNumber(event.target.value) })}
						/>
					</label>
				</div>
			</fieldset>

			<div className="input input--full-width">
				<label htmlFor={`${baseId}-intent`} className="input__label">
					{t('What should the text be? (optional)')}
				</label>
				<div className="input__container">
					<textarea
						id={`${baseId}-intent`}
						className="input__field"
						rows={3}
						dir="auto"
						disabled={disabled}
						placeholder={t('e.g. A one-page policy proposal for the council, in plain language.')}
						value={value.intent}
						onChange={(event) => onChange({ ...value, intent: event.target.value })}
					/>
				</div>
			</div>
		</div>
	);
};

export default DraftSettingsFields;
