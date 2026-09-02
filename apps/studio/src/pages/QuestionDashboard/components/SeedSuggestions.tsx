import { useEffect, useId, useMemo, useState, type FC } from 'react';
import { STUDIO_SEED_OPTIONS_COUNT, StatementType } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { studioSeedOptions, type StudioSeedOptionsResult } from '@/db/orgFunctions';
import { useChildren } from '@/db/orgStatements';
import { getErrorCode } from '@/pages/_shared/callableErrors';
import { logError } from '@/utils/logError';

/**
 * SeedSuggestions — the "Starting suggestions" section of a crowd survey's
 * drawer: how many suggestions the question has now, how many it should
 * have, an optional intent, and a button that has the AI write the rest so
 * the first participants are not rating an empty survey.
 * Styles: styles/organisms/_drawer.scss (.drawer__seed*, .drawer__draft-*)
 */
export interface SeedSuggestionsProps {
	survey: DerivedActivity;
	onSeeded?: (result: StudioSeedOptionsResult) => void;
}

/** Target totals the admin can pick; the default is the plan's own seed count. */
export const SEED_COUNT_CHOICES: readonly number[] = [3, 6, 9];

type SeedPhase = 'idle' | 'writing' | 'done' | 'error';

const SeedSuggestions: FC<SeedSuggestionsProps> = ({ survey, onSeeded }) => {
	const { t, tWithParams, currentLanguage } = useTranslation();
	const baseId = useId();
	const statementId = survey.statementId;
	const { data: children } = useChildren(statementId);
	const optionCount = useMemo(
		() =>
			children.filter((child) => child.statementType === StatementType.option && !child.hide)
				.length,
		[children],
	);

	const [count, setCount] = useState<number>(STUDIO_SEED_OPTIONS_COUNT);
	const [intent, setIntent] = useState('');
	const [phase, setPhase] = useState<SeedPhase>('idle');
	const [result, setResult] = useState<StudioSeedOptionsResult | null>(null);
	const [error, setError] = useState('');

	// A different survey → fresh form.
	useEffect(() => {
		setCount(STUDIO_SEED_OPTIONS_COUNT);
		setIntent('');
		setPhase('idle');
		setResult(null);
		setError('');
	}, [statementId]);

	const hasEnough = optionCount >= count;
	const canSeed = phase !== 'writing' && !hasEnough;

	const seed = async () => {
		if (!canSeed) return;
		setPhase('writing');
		setError('');
		try {
			const next = await studioSeedOptions({
				statementId,
				count,
				intent: intent.trim() || undefined,
				language: currentLanguage,
			});
			setResult(next);
			setPhase('done');
			onSeeded?.(next);
		} catch (err) {
			logError(err, {
				operation: 'SeedSuggestions.seed',
				statementId,
				metadata: { count, hasIntent: intent.trim().length > 0 },
			});
			const code = getErrorCode(err) ?? '';
			setError(
				code.endsWith('failed-precondition')
					? t('Only crowd surveys can be seeded')
					: t('The suggestions could not be written. Please try again.'),
			);
			setPhase('error');
		}
	};

	return (
		<div className="drawer__seed">
			<p className="drawer__seed-count" role="status">
				{tWithParams('Suggestions now: {{count}}', { count: optionCount })}
			</p>

			<label className="drawer__seed-how-many" htmlFor={`${baseId}-count`}>
				<span>{t('How many')}</span>
				<select
					id={`${baseId}-count`}
					className="drawer__seed-select"
					value={count}
					disabled={phase === 'writing'}
					onChange={(event) => setCount(Number(event.target.value))}
				>
					{SEED_COUNT_CHOICES.map((choice) => (
						<option key={choice} value={choice}>
							{choice}
						</option>
					))}
				</select>
			</label>

			<div className="input input--full-width">
				<label htmlFor={`${baseId}-intent`} className="input__label">
					{t('What kind of suggestions? (optional)')}
				</label>
				<div className="input__container">
					<input
						id={`${baseId}-intent`}
						type="text"
						className="input__field"
						dir="auto"
						disabled={phase === 'writing'}
						placeholder={t('e.g. Concrete ideas a city council could act on this year.')}
						value={intent}
						onChange={(event) => setIntent(event.target.value)}
					/>
				</div>
			</div>

			<div className="drawer__draft-actions">
				<Button
					text={tWithParams('Seed {{count}} suggestions', { count })}
					variant="primary"
					fullWidth
					disabled={!canSeed}
					loading={phase === 'writing'}
					onClick={() => void seed()}
				/>
				{hasEnough && phase !== 'writing' && (
					<p className="drawer__seed-enough">
						{tWithParams(
							'The survey already has {{count}} suggestions — pick a higher number to add more.',
							{ count: optionCount },
						)}
					</p>
				)}
				{phase === 'writing' && (
					<p className="drawer__draft-progress" role="status" aria-live="polite">
						{t('Writing suggestions…')}
					</p>
				)}
				{phase === 'done' && result && (
					<p className="drawer__draft-done" role="status" aria-live="polite">
						{tWithParams('{{created}} suggestions added ({{total}} in total)', {
							created: result.created,
							total: result.total,
						})}
					</p>
				)}
				{phase === 'error' && error && (
					<p className="drawer__draft-error" role="alert">
						{error}
					</p>
				)}
			</div>
		</div>
	);
};

export default SeedSuggestions;
