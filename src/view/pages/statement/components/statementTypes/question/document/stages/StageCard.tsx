import { FC, MouseEvent } from 'react';
import styles from './StageCard.module.scss';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { NavLink, useNavigate } from 'react-router';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { Statement } from '@/types/statement/StatementTypes';
import { SimpleStatement, statementToSimpleStatement } from '@/types/statement/SimpleStatement';
import { maxKeyInObject } from '@/types/TypeUtils';
import { StageSelectionType } from '@/types/stage/stageTypes';
import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';

interface Props {
	statement: Statement;
	isDescription?: boolean;
	isSuggestions?: boolean;
}

const StageCard: FC<Props> = ({ statement, isDescription, isSuggestions }) => {
	const { t } = useLanguage();
	const navigate = useNavigate();
	const stageUrl = isSuggestions ? `/stage/${statement.statementId}` : `/statement/${statement.statementId}`;

	const topVotedId = statement.stageSelectionType === StageSelectionType.voting
		&& statement.selections
		? maxKeyInObject(statement.selections)
		: '';

	const topVoted = useSelector(statementSelectorById(topVotedId));
	const simpleTopVoted = topVoted ? statementToSimpleStatement(topVoted) : undefined;

	const votingResults = simpleTopVoted ? [simpleTopVoted] : [];
	const chosen: SimpleStatement[] = statement.stageSelectionType === StageSelectionType.voting
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

	return (
		<div className={styles.card}>
			<h3>
				{t(title)}
			</h3>

			{chosen.length === 0 ? (
				<p>{t('No suggestion so far')}</p>
			) : (
				<>
					<h4>{t('Selected Options')}</h4>
					<ul>
						{chosen.map((opt: SimpleStatement) => (
							<NavLink
								key={opt.statementId}
								to={`/statement/${opt.statementId}`}
							>
								<li>
									{opt.statement}
									{opt.description ? ':' : ''}{' '}
									{opt.description}
								</li>
							</NavLink>
						))}
					</ul>
				</>
			)}
			<NavLink to={stageUrl}>
				<p className={styles.seeMore}>See more...</p>
			</NavLink>
			<div className='btns'>
				<Button
					text='Add Suggestion'
					buttonType={ButtonType.SECONDARY}
					onClick={suggestNewSuggestion}
				/>
			</div>
		</div>
	);
};

export default StageCard;
