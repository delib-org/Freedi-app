import { FC, MouseEvent } from 'react';
import styles from './StageCard.module.scss';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { NavLink, useNavigate } from 'react-router';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { Statement } from '@/types/statement/StatementTypes';
import { SimpleStatement } from '@/types/statement/SimpleStatement';

interface Props {
	statement: Statement;
	isDescription?: boolean;
	isSuggestions?: boolean;
}

const StageCard: FC<Props> = ({ statement, isDescription, isSuggestions }) => {

	const { t } = useLanguage();
	const navigate = useNavigate();

	const chosen = statement.results || [];
	console.log(chosen);

	function suggestNewSuggestion(ev: MouseEvent<HTMLButtonElement>) {
		ev.stopPropagation();
		navigate(`/stage/${statement.statementId}`);
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
			<NavLink to={`/statement/${statement.statementId}/stage/${statement.statementId}`}>
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
