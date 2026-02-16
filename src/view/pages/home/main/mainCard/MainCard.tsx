import { FC } from 'react';
import { Link } from 'react-router';
import styles from './MainCard.module.scss';
//img
import UpdateMainCard from './updateMainCard/UpdateMainCard';
import ImgThumb from '@/assets/images/ImgThumb.png';
import Text from '@/view/components/text/Text';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { SimpleStatement, StatementSubscription } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface Props {
	subscription: StatementSubscription;
}

const MainCard: FC<Props> = ({ subscription }) => {
	const { statement: simpleStatement } = subscription;
	const { t } = useTranslation();

	// Use lastSubStatements from subscription if available, otherwise fall back to old method
	const subStatements = subscription.lastSubStatements || [];

	const statementImgUrl = simpleStatement.imageURL || undefined;
	const description =
		simpleStatement.description?.length > 30
			? `${simpleStatement.description.slice(0, 144)} ...`
			: simpleStatement.description;

	// No longer need to listen to sub-statements as they come from subscription.lastSubStatements

	return (
		<div className={styles.mainCard}>
			<Link
				to={`/statement/${simpleStatement.statementId}/`}
				className={styles.link}
				state={{ from: window.location.pathname }}
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
					<div className={styles['contentText__description']}>
						<Text description={description} />
					</div>
				</div>
			</Link>
			<div className={styles.updates}>
				{subStatements.length > 0 && <h3>{t('Last Updates')}</h3>}
				{subStatements.map((subStatement: SimpleStatement) => (
					<UpdateMainCard key={subStatement.statementId} statement={subStatement} />
				))}
			</div>
		</div>
	);
};

export default MainCard;
