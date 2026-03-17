import { FC } from 'react';
import { Link } from 'react-router';
import styles from './MainCard.module.scss';
import ImgThumb from '@/assets/images/ImgThumb.png';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { SimpleStatement, StatementSubscription } from '@freedi/shared-types';
import { getTime } from '@/controllers/general/helpers';
import { getTitle } from './updateMainCard/UpdateMainCard';
import BranchBell from '@/view/components/atomic/atoms/BranchBell/BranchBell';
import { useBranchBell } from '@/controllers/hooks/useBranchBell';

interface Props {
	subscription: StatementSubscription;
}

const MainCard: FC<Props> = ({ subscription }) => {
	const { statement: simpleStatement } = subscription;
	const subStatements = subscription.lastSubStatements || [];
	const statementImgUrl = simpleStatement.imageURL || undefined;
	const { state: bellState, onFrequencyChange } = useBranchBell(simpleStatement.statementId);

	const latestUpdate: SimpleStatement | undefined = subStatements[0];

	return (
		<Link
			className={styles.chatItem}
			to={`/statement/${simpleStatement.statementId}/`}
			state={{ from: window.location.pathname }}
		>
			<div
				className={styles.avatar}
				style={{
					backgroundImage: `url(${statementImgUrl ?? ImgThumb})`,
				}}
			/>
			<div className={styles.body}>
				<div className={styles.topRow}>
					<div className={styles.title}>{simpleStatement.statement}</div>
					<div className={styles.actions}>
						{latestUpdate?.lastUpdate && (
							<span className={styles.time}>{getTime(latestUpdate.lastUpdate)}</span>
						)}
						<div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
							<BranchBell
								state={bellState}
								size="small"
								onFrequencyChange={onFrequencyChange}
							/>
						</div>
						<div onClick={(e) => e.stopPropagation()}>
							<StatementChatMore statement={simpleStatement} />
						</div>
					</div>
				</div>
				{latestUpdate && (
					<div className={styles.lastMessage}>
						<span className={styles.parentName}>{getTitle(latestUpdate.statement)}</span>
					</div>
				)}
			</div>
		</Link>
	);
};

export default MainCard;
