import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { AlertTriangle, Check, Users, CheckCircle } from 'lucide-react';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { OptionWithMembers } from '@/controllers/db/joining/splitJoinedOption';
import styles from './OptionRooms.module.scss';

interface OptionsStatusListProps {
	options: OptionWithMembers[];
	onAssignAllRooms: () => void;
	isAssigning?: boolean;
}

const OptionsStatusList: FC<OptionsStatusListProps> = ({
	options,
	onAssignAllRooms,
	isAssigning = false,
}) => {
	const { t } = useTranslation();

	if (options.length === 0) {
		return (
			<div className={styles.optionRooms__emptyStatus}>
				<Users size={24} />
				<p>{t('No options with participants yet')}</p>
			</div>
		);
	}

	const getStatusType = (option: OptionWithMembers): 'assigned' | 'ok' | 'warning' | 'exceeds' => {
		if (option.hasActiveRooms) return 'assigned';
		if (option.joinedCount > option.maxMembers) return 'exceeds';
		if (option.joinedCount < option.minMembers) return 'warning';

		return 'ok';
	};

	const getStatusIcon = (status: 'assigned' | 'ok' | 'warning' | 'exceeds') => {
		switch (status) {
			case 'assigned':
				return <CheckCircle size={16} className={styles['optionRooms__statusIcon--assigned']} />;
			case 'ok':
				return <Check size={16} className={styles['optionRooms__statusIcon--ok']} />;
			case 'warning':
				return <AlertTriangle size={16} className={styles['optionRooms__statusIcon--warning']} />;
			case 'exceeds':
				return <AlertTriangle size={16} className={styles['optionRooms__statusIcon--exceeds']} />;
		}
	};

	const getStatusText = (option: OptionWithMembers, status: 'assigned' | 'ok' | 'warning' | 'exceeds') => {
		switch (status) {
			case 'assigned':
				return t('Rooms assigned');
			case 'ok':
				return t('Ready to assign');
			case 'warning':
				return t('Below minimum') + ` (${option.minMembers})`;
			case 'exceeds':
				return t('Exceeds maximum') + ` (${option.maxMembers})`;
		}
	};

	// Check if any rooms are already assigned
	const hasExistingRooms = options.some(opt => opt.hasActiveRooms);
	const totalParticipants = options.reduce((sum, opt) => sum + opt.joinedCount, 0);

	return (
		<div className={styles.optionRooms__subsection}>
			<h3 className={styles.optionRooms__subsectionTitle}>
				{t('Options with Participants')}
			</h3>
			<p className={styles.optionRooms__subsectionDescription}>
				{options.length} {t('options')} {t('with')} {totalParticipants} {t('participants')}
			</p>

			<div className={styles.optionRooms__statusList}>
				{options.map((option) => {
					const status = getStatusType(option);

					return (
						<div
							key={option.statementId}
							className={`${styles.optionRooms__statusItem} ${styles[`optionRooms__statusItem--${status}`]}`}
						>
							<div className={styles.optionRooms__statusInfo}>
								<div className={styles.optionRooms__statusHeader}>
									{getStatusIcon(status)}
									<span className={styles.optionRooms__optionTitle}>
										{option.statement}
									</span>
								</div>
								<div className={styles.optionRooms__statusDetails}>
									<span className={styles.optionRooms__memberCount}>
										{option.joinedCount} {t('members')}
									</span>
									<span className={styles.optionRooms__statusBadge}>
										{getStatusText(option, status)}
									</span>
								</div>
							</div>
						</div>
					);
				})}
			</div>

			<div className={styles.optionRooms__assignAllButton}>
				<Button
					text={isAssigning ? t('Assigning...') : (hasExistingRooms ? t('Reassign all rooms') : t('Assign all rooms'))}
					buttonType={ButtonType.PRIMARY}
					onClick={onAssignAllRooms}
					disabled={isAssigning}
				/>
			</div>
		</div>
	);
};

export default OptionsStatusList;
