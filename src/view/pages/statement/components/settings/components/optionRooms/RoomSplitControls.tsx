import { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { OptionWithMembers } from '@/controllers/db/joining/splitJoinedOption';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import { selectAllRoomSettings } from '@/redux/roomAssignment/roomAssignmentSlice';
import { JOINING } from '@/constants/common';
import Button from '@/view/components/atomic/atoms/Button';
import InlineNote from '@/view/components/atomic/atoms/InlineNote';
import Modal from '@/view/components/atomic/molecules/Modal';
import OptionsStatusList from './OptionsStatusList';
import { countActiveRooms } from './roomsLogic';
import { useRoomSplit } from './useRoomSplit';
import styles from './OptionRooms.module.scss';

interface RoomSplitControlsProps {
	questionId: string;
	options: OptionWithMembers[];
	roomSize: number;
	scrambleByQuestions: string[];
	/** Refreshes the answers' joined counts after a split. */
	onSplit: () => Promise<void>;
}

/**
 * "Split into rooms" (UX 4.7): disabled until at least two people joined an
 * answer; "Splitting…" while it runs; an inline error if it fails (existing
 * rooms stay listed); re-splitting asks before replacing the rooms.
 */
const RoomSplitControls: FC<RoomSplitControlsProps> = ({
	questionId,
	options,
	roomSize,
	scrambleByQuestions,
	onSplit,
}) => {
	const { t } = useTranslation();
	const existingRooms = countActiveRooms(useAppSelector(selectAllRoomSettings), questionId);
	const split = useRoomSplit({ questionId, options, roomSize, scrambleByQuestions, onSplit });
	const [isConfirming, setIsConfirming] = useState(false);
	const canSplit = options.some((option) => option.joinedCount >= JOINING.MIN_ROOM_SIZE);

	function handleSplit(): void {
		if (existingRooms > 0) setIsConfirming(true);
		else void split.run();
	}

	function handleConfirm(): void {
		setIsConfirming(false);
		void split.run();
	}

	return (
		<div className={styles.optionRooms__group}>
			<OptionsStatusList options={options} />
			<div className={styles.optionRooms__splitActions}>
				<Button
					text={split.isSplitting ? t('people.rooms.splitting') : t('people.rooms.split')}
					variant="primary"
					size="small"
					className="button--touch"
					loading={split.isSplitting}
					disabled={!canSplit}
					onClick={handleSplit}
				/>
				{!canSplit && <InlineNote variant="info">{t('people.rooms.needTwo')}</InlineNote>}
				{split.hasFailed && (
					<InlineNote variant="error">{t('people.rooms.splitFailed')}</InlineNote>
				)}
				{split.result && (
					<InlineNote variant="success">
						{t('Successfully assigned')} {split.result.participants} {t('participants')} {t('into')}{' '}
						{split.result.rooms} {t('rooms')}.
					</InlineNote>
				)}
			</div>

			<Modal
				isOpen={isConfirming}
				onClose={() => setIsConfirming(false)}
				size="small"
				variant="warning"
				title={fillPlaceholders(t('people.rooms.replace.title'), { count: existingRooms })}
				showCloseButton={false}
				footer={
					<>
						<Button
							text={t('Cancel')}
							variant="secondary"
							onClick={() => setIsConfirming(false)}
							isInitialFocus
						/>
						<Button text={t('Replace')} variant="reject" onClick={handleConfirm} />
					</>
				}
			>
				<p>{t('people.rooms.replace.body')}</p>
			</Modal>
		</div>
	);
};

export default RoomSplitControls;
