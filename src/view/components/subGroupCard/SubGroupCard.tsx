import React, { FC, useEffect, useState } from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { EvaluationUI, Statement, StatementType } from 'delib-npm';
import { Link, NavLink } from 'react-router';
import styles from './SubGroupCard.module.scss';
import useSubGroupCard from './SubGroupCardVM';
import { maskProfanityAI } from '@/services/maskProfanityAI';

interface Props {
	statement: Statement;
}

const SubGroupCard: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig();
	const { Icon, backgroundColor } = useSubGroupCard(statement);

	// ✅ States to store masked text
	const [cleanMainText, setCleanMainText] = useState('');
	const [cleanTopVoted, setCleanTopVoted] = useState('');
	const [cleanResults, setCleanResults] = useState<string[]>([]);

	useEffect(() => {
		maskProfanityAI(statement.statement).then(setCleanMainText);

		if (statement.topVotedOption?.statement) {
			maskProfanityAI(statement.topVotedOption.statement).then(setCleanTopVoted);
		}

		Promise.all(
			(statement.results || []).map((r) => maskProfanityAI(r.statement))
		).then(setCleanResults);
	}, [statement]);

	try {
		const { results = [], topVotedOption, evaluationSettings } = statement;
		const evaluationUI = evaluationSettings?.evaluationUI;
		const isDecidedByVoting = evaluationUI === EvaluationUI.voting;
		const shouldSeeVoting = isDecidedByVoting && topVotedOption;
		const answerLabel =
			results.length > 1 || !isDecidedByVoting ? t('Answers') : t('Answer');

		return (
			<div
				className={styles.subGroupCard}
				style={{
					border: `1px solid ${backgroundColor}`,
					borderLeft: `5px solid ${backgroundColor}`,
				}}
			>
				<Link
					to={`/statement/${statement.statementId}`}
					className={styles.type}
				>
					<div className={styles.text}>{cleanMainText}</div>
					<div
						className={styles.iconWrapper}
						style={{ color: backgroundColor }}
					>
						{Icon}
						<div onClick={(e) => e.stopPropagation()}>
							<StatementChatMore statement={statement} onlyCircle={true} />
						</div>
					</div>
				</Link>

				{shouldSeeVoting ? (
					<NavLink to={`/statement/${topVotedOption.statementId}/main`}>
						{cleanTopVoted}
					</NavLink>
				) : statement.statementType === StatementType.question && (
					<div className={styles.results}>
						{results.length !== 0 && (
							<NavLink to={`/statement/${results[0].parentId}/main`}>
								<p>{answerLabel}:</p>
							</NavLink>
						)}
						<ul>
							{results.map((result, index) => (
								<li key={result.statementId}>
									<NavLink to={`/statement/${result.statementId}/main`}>
										{cleanResults[index]}
									</NavLink>
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
		);
	} catch (err) {
		console.error(err);

		return null;
	}
};

export default SubGroupCard;
