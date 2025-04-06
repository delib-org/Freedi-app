import { FC, useEffect } from 'react';
import { Link } from 'react-router';
import styles from './MainQuestionCard.module.scss';
//img

import ImgThumb from '@/assets/images/ImgThumb.png';
import { listenToStatement } from '@/controllers/db/statements/listenToStatements';
import { statementSelector } from '@/redux/statements/statementsSlice';
import Text from '@/view/components/text/Text';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { SimpleStatement, Statement } from 'delib-npm';
import { useSelector } from 'react-redux';

interface Props {
	simpleStatement: SimpleStatement;
}

const MainQuestionCard: FC<Props> = ({ simpleStatement }) => {

	const statement: Statement | undefined = useSelector(statementSelector(simpleStatement.statementId))
	const statementImgUrl = simpleStatement.imageURL || undefined;
	const lastMessage = statement.lastMessage;
	const description = simpleStatement.description?.length > 30
		? `${simpleStatement.description.slice(0, 144)} ...`
		: simpleStatement.description;

	useEffect(() => {
		const unsubscribe = listenToStatement(simpleStatement.statementId)

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
					<StatementChatMore statement={simpleStatement} />
				</div>

				<h2>{simpleStatement.statement}</h2>
				<div className={styles.contentText}>
					<Text description={description} />
				</div>
			</Link>
			<div className={styles.updates}>
				{lastMessage}
			</div>
		</div>
	);
};

export default MainQuestionCard;
