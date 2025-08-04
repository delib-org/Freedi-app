import { FC } from 'react';
import styles from './SubGroupCard.module.scss';
import { Link, NavLink } from 'react-router';
import useSubGroupCard from './SubGroupCardVM';
import { EvaluationUI, QuestionType, Statement, StatementType } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';

interface Props {
	statement: Statement;
}

const SubGroupCard: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig();
	const { Icon, backgroundColor, text } = useSubGroupCard(statement);

	try {
		const { results, topVotedOption, evaluationSettings, hide } = statement;
		const evaluationUI = evaluationSettings?.evaluationUI;
		const isDecidedByVoting = evaluationUI === EvaluationUI.voting;
		const shouldSeeVoting = isDecidedByVoting && topVotedOption;
		const questionType = statement.questionSettings?.questionType;
		const answerLabel =
			results && (results.length > 1 || !isDecidedByVoting) ? t('Answers') : t('Answer');
		
		const isQuestionnaire = questionType === QuestionType.questionnaire;
		const pageBaseUrl = isQuestionnaire ? "questionnaire" : "statement";

		return (
			<div
				className={styles.subGroupCard}
				style={{
					border: `1px solid ${backgroundColor}`,
					borderLeft: `5px solid ${backgroundColor}`,
					opacity: hide ? 0.5 : 1
				}}
			>
				<Link
					to={`/${pageBaseUrl}/${statement.statementId}`}
					className={styles.type}
				>
					<div className={styles.text}>{text}</div>					<div
						className={styles.iconWrapper}
						style={{ color: backgroundColor }}
					>
						{Icon}
						<div onClick={(e) => e.stopPropagation()}>
							<StatementChatMore statement={statement} onlyCircle={true} />
						</div>
					</div>
				</Link>
				{isQuestionnaire && (
					<div className={styles.questionnaireSettings}>
						<NavLink
							to={`/questionnaire-settings/${statement.statementId}`}
							className={styles.settingsLink}
						>
							{t('Settings')}
						</NavLink>
					</div>
				)}
				{shouldSeeVoting ? (
					<NavLink
						to={`/statement/${topVotedOption.statementId}/main`}
					>
						{topVotedOption.statement}
					</NavLink>
				) : (statement.statementType === StatementType.question && (
					<div className={styles.results}>
						{results.length !== 0 && (
							<NavLink
								to={`/statement/${results[0].parentId}/main`}
							>
								<p>{answerLabel}:</p>
							</NavLink>
						)}
						<ul>
							{results.map((result) => (
								<li key={result.statementId}>
									<NavLink
										to={`/statement/${result.statementId}/main`}
									>
										{result.statement}
									</NavLink>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
		);
	} catch (err) {
		console.error(err);
	}
};

export default SubGroupCard;
