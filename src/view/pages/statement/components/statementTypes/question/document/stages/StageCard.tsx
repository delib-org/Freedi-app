import { FC, MouseEvent } from 'react';
import styles from './StageCard.module.scss';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { NavLink, useNavigate } from 'react-router';
import {
	Statement,
	SimpleStatement,
	EvaluationUI,
} from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import StatementChatMore from '../../../../chat/components/statementChatMore/StatementChatMore';

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

	const votingResults: SimpleStatement | undefined = statement.topVotedOption;
	const chosen: SimpleStatement[] = isVoting && votingResults
		? [votingResults]
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
			<div className={`${styles.title}`}>
				<div className={`${styles.notification}`}>
					<StatementChatMore statement={statement} onlyCircle={true} />
				</div>
				<h3>{t(title)} {isSuggestions && `: ${statement.statement}`}</h3>
			</div>

			{
				chosen.length === 0 ? (
					<p>{t('No suggestion so far')}</p>
				) : (
					<>
						<ul>
							{chosen.map((opt: SimpleStatement) => (
								<li className={styles.suggestions} key={opt.statementId}>
									<NavLink

										to={`/statement/${opt.statementId}`}
									>
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
									</NavLink>
								</li>

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
				)
			}

			<div className={`btns ${styles.btn}`}>
				<Button
					text={t('Add Suggestion')}
					buttonType={ButtonType.SECONDARY}
					onClick={suggestNewSuggestion}
				/>
			</div>
		</div >
	);
};

export default StageCard;
