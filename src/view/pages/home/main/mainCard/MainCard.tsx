import { FC, useEffect } from 'react';
import { Link } from 'react-router';
import styles from './MainCard.module.scss';
//img
import UpdateMainCard from './updateMainCard/UpdateMainCard';
import ImgThumb from '@/assets/images/ImgThumb.png';
import { listenToAllSubStatements } from '@/controllers/db/statements/listenToStatements';
import { getLastElements } from '@/controllers/general/helpers';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { subStatementsByTopParentIdMemo } from '@/redux/statements/statementsSlice';
import Text from '@/view/components/text/Text';
import StatementChatMore from '@/view/pages/statement/components/chat/components/StatementChatMore';
import { Statement } from '@/types/statement/Statement';

interface Props {
	statement: Statement;
}

const MainCard: FC<Props> = ({ statement }) => {
	const _subStatements: Statement[] = useAppSelector(
		subStatementsByTopParentIdMemo(statement.statementId)
	)
		.filter((s) => s.statementId !== statement.statementId)
		.sort((a, b) => a.lastUpdate - b.lastUpdate);

	const subStatements = getLastElements(_subStatements, 7) as Statement[];
	const statementImgUrl = statement.imagesURL?.main;
	const description =
		statement.description && statement.description.length > 30
			? `${statement.description.slice(0, 144)} ...`
			: statement.description;

	useEffect(() => {
		const unsub = listenToAllSubStatements(statement.statementId);

		return () => {
			unsub();
		};
	}, []);

	return (
		<div className={styles.mainCard}>
			<Link
				to={`/statement/${statement.statementId}/chat`}
				className={styles.link}
			>
				<div className={styles.content}>
					<div
						style={{
							backgroundImage: `url(${statementImgUrl ?? ImgThumb})`,
						}}
						className={styles.img}
					></div>
					<StatementChatMore statement={statement} />
				</div>

				<h2>{statement.statement}</h2>
				<div className={styles.contentText}>
					<Text description={description} />
				</div>
			</Link>
			<div className={styles.updates}>
				{subStatements.map((subStatement: Statement) => (
					<UpdateMainCard
						key={subStatement.statementId}
						statement={subStatement}
					/>
				))}
			</div>
		</div>
	);
};

export default MainCard;
