import { FC } from 'react';
import styles from './SubGroupCard.module.scss';
import { Link, NavLink } from 'react-router';
import useSubGroupCard from './SubGroupCardVM';
import { Statement, StatementType } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';

interface Props {
	statement: Statement;
}

const SubGroupCard: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig();
	const { Icon, backgroundColor, text } = useSubGroupCard(statement);

	try {
		const { results } = statement;
		const answerLabel =
			results && results.length > 1 ? t('Answers') : t('Answer');

		return (
			<div
				className={styles.card}
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
						<div><StatementChatMore statement={statement} onlyCircle={true} /></div>
					</div>
				</Link>

				{results &&
					statement.statementType === StatementType.question && (
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
					)}
			</div>
		);
	} catch (err) {
		console.error(err);
	}
};

export default SubGroupCard;
