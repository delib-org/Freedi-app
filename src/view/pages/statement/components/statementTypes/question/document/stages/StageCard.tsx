import { FC, MouseEvent } from 'react';
import styles from './StageCard.module.scss';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { NavLink, useNavigate } from 'react-router';
import {
	Statement,
	SimpleStatement,
	statementToSimpleStatement,
	maxKeyInObject,
	EvaluationUI,
} from 'delib-npm';
import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	statement: Statement;
	isDescription?: boolean;
	isSuggestions?: boolean;
}

const StageCard: FC<Props> = ({ statement, isDescription, isSuggestions }) => {
	const { dir, t } = useUserConfig();

	const navigate = useNavigate();
	const stageUrl = `/stage/${statement.statementId}`;
	const isVoting =
		statement.evaluationSettings?.evaluationUI === EvaluationUI.voting;
	const topVotedId =
		isVoting && statement.selections
			? maxKeyInObject(statement.selections)
			: '';

	const topVoted = useSelector(statementSelectorById(topVotedId));

	const simpleTopVoted = topVoted
		? statementToSimpleStatement(topVoted)
		: undefined;

	const votingResults = simpleTopVoted ? [simpleTopVoted] : [];
	const chosen: SimpleStatement[] = isVoting
		? votingResults
		: statement.results;

	function suggestNewSuggestion(ev: MouseEvent<HTMLButtonElement>) {
		ev.stopPropagation();
		navigate(stageUrl);
	}

	const getTitle = () => {
		if (isDescription) return 'Description';
		if (isSuggestions) return 'Suggestions';

		return statement.statement;
	};

	const title = getTitle();

	const direction = dir === 'rtl' ? 'card--rtl' : 'card--ltr';
	let suggestionsClass = '';
	if (isSuggestions) {
		suggestionsClass =
			dir === 'ltr' ? 'card--suggestions' : 'card--suggestions-rtl';
	}

	return (
		<div
			className={`${styles.card} ${styles[direction]} ${styles[suggestionsClass]}`}
		>
			<h3>{t(title)}</h3>
			{chosen.length === 0 ? (
				<p>{t('No suggestion so far')}</p>
			) : (
				<>
					<ul>
						{chosen.map((opt: SimpleStatement) => (
							<NavLink
								key={opt.statementId}
								to={`/statement/${opt.statementId}`}
							>
								<ol className={styles.suggestions}>
									<li>
										<div>{opt.statement}</div>
										{opt.description && (
											<div
												className={
													styles.statement__description
												}
											>
												{opt.description}
											</div>
										)}
									</li>
								</ol>
							</NavLink>
						))}
					</ul>
					{!isSuggestions && (
						<NavLink to={`/statement/${statement.statementId}`}>
							<p
								className={`${styles.seeMore} ${dir === 'ltr' ? styles.rtl : styles.ltr}`}
							>
								{t('Read more...')}
							</p>{' '}
						</NavLink>
					)}
				</>
			)}

			<div className={`btns ${styles.btn}`}>
				<Button
					text={t('Add Suggestion')}
					buttonType={ButtonType.SECONDARY}
					onClick={suggestNewSuggestion}
				/>
			</div>
		</div>
	);
};

export default StageCard;
