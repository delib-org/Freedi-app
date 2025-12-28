import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './OptionRooms.module.scss';

interface RoomSizeSettingsProps {
	minMembers: number;
	maxMembers: number;
	onMinMembersChange: (value: number) => void;
	onMaxMembersChange: (value: number) => void;
	disabled?: boolean;
}

const RoomSizeSettings: FC<RoomSizeSettingsProps> = ({
	minMembers,
	maxMembers,
	onMinMembersChange,
	onMaxMembersChange,
	disabled = false,
}) => {
	const { t } = useTranslation();

	const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseInt(e.target.value, 10);
		if (!isNaN(value) && value >= 1 && value <= maxMembers) {
			onMinMembersChange(value);
		}
	};

	const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseInt(e.target.value, 10);
		if (!isNaN(value) && value >= minMembers && value <= 50) {
			onMaxMembersChange(value);
		}
	};

	return (
		<div className={styles.optionRooms__subsection}>
			<h3 className={styles.optionRooms__subsectionTitle}>
				{t('Room Size')}
			</h3>
			<p className={styles.optionRooms__subsectionDescription}>
				{t('When an option exceeds the maximum, it will be split into smaller rooms')}
			</p>

			<div className={styles.optionRooms__sizeInputs}>
				<div className={styles.optionRooms__sizeInput}>
					<label className={styles.optionRooms__inputLabel}>
						{t('Minimum members per room')}
					</label>
					<input
						type="number"
						min={1}
						max={maxMembers}
						value={minMembers}
						onChange={handleMinChange}
						disabled={disabled}
						className={styles.optionRooms__numberInput}
					/>
				</div>
				<div className={styles.optionRooms__sizeInput}>
					<label className={styles.optionRooms__inputLabel}>
						{t('Maximum members per room')}
					</label>
					<input
						type="number"
						min={minMembers}
						max={50}
						value={maxMembers}
						onChange={handleMaxChange}
						disabled={disabled}
						className={styles.optionRooms__numberInput}
					/>
				</div>
			</div>
		</div>
	);
};

export default RoomSizeSettings;
