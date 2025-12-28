import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { AlertTriangle, Check, Users } from 'lucide-react';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import styles from './OptionRooms.module.scss';

export interface OptionStatus {
	statementId: string;
	statement: string;
	joinedCount: number;
	minMembers: number;
	maxMembers: number;
}

interface OptionsStatusListProps {
	options: OptionStatus[];
	onSplitOption: (statementId: string) => void;
	isSplitting?: boolean;
	splittingOptionId?: string;
}

const OptionsStatusList: FC<OptionsStatusListProps> = ({
	options,
	onSplitOption,
	isSplitting = false,
	splittingOptionId,
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

	const getStatusType = (option: OptionStatus): 'ok' | 'warning' | 'exceeds' => {
		if (option.joinedCount > option.maxMembers) return 'exceeds';
		if (option.joinedCount < option.minMembers) return 'warning';

		return 'ok';
	};

	const getStatusIcon = (status: 'ok' | 'warning' | 'exceeds') => {
		switch (status) {
			case 'ok':
				return <Check size={16} className={styles['optionRooms__statusIcon--ok']} />;
			case 'warning':
				return <AlertTriangle size={16} className={styles['optionRooms__statusIcon--warning']} />;
			case 'exceeds':
				return <AlertTriangle size={16} className={styles['optionRooms__statusIcon--exceeds']} />;
		}
	};

	const getStatusText = (option: OptionStatus, status: 'ok' | 'warning' | 'exceeds') => {
		switch (status) {
			case 'ok':
				return t('OK');
			case 'warning':
				return t('Below minimum') + ` (${option.minMembers})`;
			case 'exceeds':
				return t('Exceeds maximum') + ` (${option.maxMembers})`;
		}
	};

	return (
		<div className={styles.optionRooms__subsection}>
			<h3 className={styles.optionRooms__subsectionTitle}>
				{t('Options Needing Rooms')}
			</h3>
			<p className={styles.optionRooms__subsectionDescription}>
				{t('Options that exceed the maximum will need to be split into rooms')}
			</p>

			<div className={styles.optionRooms__statusList}>
				{options.map((option) => {
					const status = getStatusType(option);
					const needsSplit = status === 'exceeds';
					const roomsNeeded = Math.ceil(option.joinedCount / option.maxMembers);

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
							{needsSplit && (
								<div className={styles.optionRooms__statusActions}>
									<Button
										text={
											isSplitting && splittingOptionId === option.statementId
												? t('Splitting...')
												: t('Split into') + ` ${roomsNeeded} ` + t('rooms')
										}
										buttonType={ButtonType.PRIMARY}
										onClick={() => onSplitOption(option.statementId)}
										disabled={isSplitting}
									/>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default OptionsStatusList;
