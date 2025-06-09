import React, { FC, useState } from 'react';
import styles from './SubGroupCard.module.scss';
import { Link, NavLink } from 'react-router';
import useSubGroupCard from './SubGroupCardVM';
import { EvaluationUI, Statement, StatementType } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import ProfanityControlledTextarea from '@/view/components/ProfanityControl/ProfanityControlledTextarea';

interface Props {
	statement: Statement;
}

const SubGroupCard: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig();
	const { Icon, backgroundColor, text } = useSubGroupCard(statement);

	// Local state for comment text
	const [comment, setComment] = useState('');

	// Handle textarea change
	const onCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setComment(e.target.value);
	};

	// Handle submitting comment (replace with your real submit logic)
	const submitComment = () => {
		if (comment.trim().length > 0) {
			console.info('Submitting comment:', comment.trim());
			// TODO: Add your submission logic here (e.g., call API, update DB)
			setComment('');
		}
	};

	try {
		const { results, topVotedOption, evaluationSettings } = statement;
		const evaluationUI = evaluationSettings?.evaluationUI;
		const isDecidedByVoting = evaluationUI === EvaluationUI.voting;
		const shouldSeeVoting = isDecidedByVoting && topVotedOption;
		const answerLabel =
			results && (results.length > 1 || !isDecidedByVoting) ? t('Answers') : t('Answer');

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
					<div className={styles.text}>{text}</div>
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

				{/* === COMMENT INPUT BOX with profanity filter === */}
				<div style={{ marginTop: 20 }}>

					<ProfanityControlledTextarea
						value={comment}
						onChange={onCommentChange}
						placeholder={t('Write your comment here...')}
						rows={3}
					/>
					<button
						onClick={submitComment}
						disabled={comment.trim().length === 0}
						style={{ marginTop: 8, padding: '6px 12px', cursor: 'pointer' }}
					>
						{t('Submit')}
					</button>
				</div>
			</div>
		);
	} catch (err) {
		console.error(err);

		return null;
	}
};

export default SubGroupCard;
