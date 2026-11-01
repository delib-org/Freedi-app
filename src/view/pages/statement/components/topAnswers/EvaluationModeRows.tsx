import { FC } from 'react';
import clsx from 'clsx';
import { EvaluationUI, Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setParticipationMode } from '@/controllers/db/evaluation/setEvaluation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';

type VotingOptionsSource = 'all' | 'positivelyEvaluated';

interface ModeOption {
	value: EvaluationUI;
	label: string;
	hint: string;
}

interface SourceOption {
	value: VotingOptionsSource;
	label: string;
	hint: string;
}

const MODE_OPTIONS: ReadonlyArray<ModeOption> = [
	{
		value: EvaluationUI.suggestions,
		label: 'Card stacks',
		hint: 'Everyone scores each suggestion, one card at a time',
	},
	{
		value: EvaluationUI.voting,
		label: 'Voting',
		hint: 'Each person picks a single option',
	},
];

const SOURCE_OPTIONS: ReadonlyArray<SourceOption> = [
	{ value: 'all', label: 'Show all options', hint: 'Show all options' },
	{
		value: 'positivelyEvaluated',
		label: 'Only options selected in the card-stack evaluation',
		hint: 'Options the group rated positively in the card-stack evaluation',
	},
];

interface EvaluationModeRowsProps {
	statement: Statement;
}

/**
 * Top-of-panel rows of the Top Answers drawer: how the question is evaluated
 * (card stacks or voting) and, when voting, which options the ballot lists.
 * Writes the same fields as the advanced-settings EvaluationModeControls.
 */
const EvaluationModeRows: FC<EvaluationModeRowsProps> = ({ statement }) => {
	const { t } = useTranslation();

	if (statement.statementType !== StatementType.question) return null;

	const mode = statement.evaluationSettings?.evaluationUI ?? EvaluationUI.suggestions;
	const isVoting = mode === EvaluationUI.voting;
	const source: VotingOptionsSource = statement.statementSettings?.votingOptionsSource ?? 'all';

	function handleSourceChange(value: VotingOptionsSource): void {
		setStatementSettingToDB({
			statement,
			property: 'votingOptionsSource',
			newValue: value,
			settingsSection: 'statementSettings',
		});
	}

	return (
		<>
			<section className="admin-drawer__section">
				<span className="admin-drawer__section-title">{t('Evaluation method')}</span>
				<div className="admin-drawer__row">
					<div
						className="admin-drawer__segmented"
						role="radiogroup"
						aria-label={t('Evaluation method')}
					>
						{MODE_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								role="radio"
								aria-checked={mode === option.value}
								title={t(option.hint)}
								className={clsx(
									'admin-drawer__segment',
									mode === option.value && 'admin-drawer__segment--active',
								)}
								onClick={() => setParticipationMode(statement, option.value)}
							>
								{t(option.label)}
							</button>
						))}
					</div>
				</div>
			</section>

			{isVoting && (
				<section className="admin-drawer__section">
					<span className="admin-drawer__section-title">{t('Options shown in voting')}</span>
					<div className="admin-drawer__row">
						<div
							className="admin-drawer__segmented"
							role="radiogroup"
							aria-label={t('Options shown in voting')}
						>
							{SOURCE_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									role="radio"
									aria-checked={source === option.value}
									title={t(option.hint)}
									className={clsx(
										'admin-drawer__segment',
										source === option.value && 'admin-drawer__segment--active',
									)}
									onClick={() => handleSourceChange(option.value)}
								>
									{t(option.label)}
								</button>
							))}
						</div>
					</div>
				</section>
			)}
		</>
	);
};

export default EvaluationModeRows;
