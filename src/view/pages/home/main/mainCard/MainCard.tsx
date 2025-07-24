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
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { SimpleStatement, Statement } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	simpleStatement: SimpleStatement;
}

const MainCard: FC<Props> = ({ simpleStatement }) => {
	const _subStatements: Statement[] = useAppSelector(
		subStatementsByTopParentIdMemo(simpleStatement.statementId)
	)
		.filter((s) => s.statementId !== simpleStatement.statementId)
		.sort((a, b) => a.lastUpdate - b.lastUpdate);

	const { t } = useUserConfig();
	const subStatements = getLastElements(_subStatements, 3) as Statement[];
	const statementImgUrl = simpleStatement.imageURL || undefined;
	const description = simpleStatement.description?.length > 30
		? `${simpleStatement.description.slice(0, 144)} ...`
		: simpleStatement.description;

	useEffect(() => {
		const unsubscribe = listenToAllSubStatements(simpleStatement.statementId);

		return () => {
			unsubscribe();
		};
	}, []);

	return (
		<div className={styles.mainCard}>
			<Link
				to={`/statement/${simpleStatement.statementId}/`}
				className={styles.link}
			>
				<div className={styles.content}>
					<div
						style={{
							backgroundImage: `url(${statementImgUrl ?? ImgThumb})`,
						}}
						className={styles.img}
					></div>
					<div onClick={(e) => e.stopPropagation()}>
						<StatementChatMore statement={simpleStatement} />
					</div>
				</div>

				<div className={styles.contentText}>
					<h2>{simpleStatement.statement}</h2>
					<div className={styles["contentText__description"]}>
						<Text description={description} />
					</div>
				</div>
			</Link>
			<div className={styles.updates}>
				{subStatements.length > 0 && <h3>{t('Last Updates')}</h3>}
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
