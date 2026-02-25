import { FC } from 'react';
// icons
import AddIcon from '@/assets/icons/plusIcon.svg?react';
import GroupIcon from '@/assets/icons/group.svg?react';
// import GravelIcon from "@/assets/icons/gravel.svg?react";
import TargetIcon from '@/assets/icons/target.svg?react';
import styles from './Footer.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { NotificationType, StatementType } from '@freedi/shared-types';
import { useDispatch, useSelector } from 'react-redux';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { useNavigate } from 'react-router';
import {
	setNewStatementType,
	setParentStatement,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';

interface Props {
	subPage: 'decisions' | 'groups';
	setSubPage: (page: 'decisions' | 'groups') => void;
	hasGroups: boolean;
}

const Footer: FC<Props> = ({ setSubPage, subPage, hasGroups }) => {
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const { t } = useTranslation();
	const creator = useSelector(creatorSelector);
	const inAppNotificationsList: NotificationType[] = useSelector(inAppNotificationsSelector).filter(
		(n) => n.creatorId !== creator?.uid,
	);
	const user = useSelector(creatorSelector);
	const isAdvanceUser = user?.advanceUser || false;

	function addStatement() {
		if (isAdvanceUser) {
			navigate('/home/addStatement', {
				state: { from: window.location.pathname },
			});
		} else {
			// open new statement for question
			dispatch(setShowNewStatementModal(true));
			dispatch(setNewStatementType(StatementType.question));
			dispatch(setParentStatement('top'));
		}
	}

	if (!hasGroups) {
		return (
			<button onClick={addStatement} className={styles.fab} data-cy="add-statement">
				<AddIcon />
			</button>
		);
	}

	return (
		<div className={styles.footer} data-cy="add-statement">
			<button onClick={addStatement} className={styles.addStatementButton}>
				<AddIcon />
			</button>
			<button
				onClick={() => setSubPage('decisions')}
				className={`${styles.button} ${subPage === 'decisions' ? styles.buttonActive : ''}`}
			>
				<div
					className={`${styles.buttonImage} ${subPage === 'decisions' ? styles.buttonImageActive : ''}`}
				>
					{inAppNotificationsList.length > 0 && (
						<div className={styles.redCircle}>
							{inAppNotificationsList.length < 10 ? inAppNotificationsList.length : `9+`}
						</div>
					)}
					<div className={styles.buttonIcon}>
						<TargetIcon />
					</div>
				</div>
				<span className={`${subPage === 'decisions' ? styles.activeText : ''}`}>
					{t('Discussions')}
				</span>
			</button>
			<button
				onClick={() => setSubPage('groups')}
				className={`${styles.button} ${subPage === 'groups' ? styles.buttonActive : ''}`}
			>
				<div className={styles.buttonIcon}>
					<GroupIcon />
				</div>
				<span className={`${subPage === 'groups' ? styles.activeText : ''}`}>{t('Groups')}</span>
			</button>
		</div>
	);
};

export default Footer;
