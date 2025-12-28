import { FC, useState, useMemo } from 'react';
import { shallowEqual } from 'react-redux';
import {
	Statement,
	User,
	RoomSettings,
	UserDemographicQuestionType,
} from '@freedi/shared-types';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { selectUserDemographicQuestionsByStatementId } from '@/redux/userDemographic/userDemographicSlice';
import { createRoomAssignments, notifyRoomParticipants } from '@/controllers/db/roomAssignment';
import QuestionSelector from './QuestionSelector';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import styles from '../RoomAssignment.module.scss';

interface RoomAssignmentConfigProps {
	statement: Statement;
	user: User;
	existingSettings?: RoomSettings;
	onCreateSuccess: () => void;
}

const RoomAssignmentConfig: FC<RoomAssignmentConfigProps> = ({
	statement,
	user,
	existingSettings,
	onCreateSuccess,
}) => {
	const { t } = useTranslation();
	const dispatch = useAppDispatch();

	// State
	const [roomSize, setRoomSize] = useState(existingSettings?.roomSize || 6);
	const [selectedQuestions, setSelectedQuestions] = useState<string[]>(
		existingSettings?.scrambleByQuestions || []
	);
	const [isCreating, setIsCreating] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);

	// Get demographic questions for this statement
	const topParentId = statement.topParentId || statement.statementId;

	// Get demographic questions from Redux with proper memoization
	const questionsByStatement = useAppSelector(
		selectUserDemographicQuestionsByStatementId(statement.statementId),
		shallowEqual
	);
	const questionsByTopParent = useAppSelector(
		selectUserDemographicQuestionsByStatementId(statement.topParentId || ''),
		shallowEqual
	);

	// Combine and deduplicate by userQuestionId, memoized
	const demographicQuestions = useMemo(() => {
		const combined = [...questionsByStatement, ...questionsByTopParent];
		const uniqueMap = new Map(combined.map(q => [q.userQuestionId, q]));

		return Array.from(uniqueMap.values());
	}, [questionsByStatement, questionsByTopParent]);

	// Filter to only radio and checkbox questions (selectable for scrambling)
	const selectableQuestions = useMemo(() => {
		return demographicQuestions.filter(
			(q) =>
				q.type === UserDemographicQuestionType.radio ||
				q.type === UserDemographicQuestionType.checkbox
		);
	}, [demographicQuestions]);

	// Get member count (estimated from subscriptions)
	// For now, we'll show a placeholder - this should be connected to actual subscription data
	const estimatedParticipants = 0; // This would come from subscription count

	const estimatedRooms = Math.ceil(estimatedParticipants / roomSize) || 0;

	const handleRoomSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseInt(e.target.value, 10);
		if (value >= 2 && value <= 50) {
			setRoomSize(value);
		}
	};

	const handleQuestionToggle = (questionId: string) => {
		setSelectedQuestions((prev) => {
			if (prev.includes(questionId)) {
				return prev.filter((id) => id !== questionId);
			}

			return [...prev, questionId];
		});
	};

	const handleCreateClick = () => {
		if (existingSettings) {
			setShowConfirm(true);
		} else {
			handleCreate();
		}
	};

	const handleCreate = async () => {
		setShowConfirm(false);
		setIsCreating(true);

		try {
			const result = await createRoomAssignments(
				statement.statementId,
				topParentId,
				roomSize,
				selectedQuestions,
				user,
				dispatch
			);

			if (result?.success && result.settingsId) {
				// Send notifications to all participants
				await notifyRoomParticipants(result.settingsId, dispatch);
				onCreateSuccess();
			}
		} catch (error) {
			console.error('Failed to create room assignments:', error);
		} finally {
			setIsCreating(false);
		}
	};

	const canCreate = roomSize >= 2;

	return (
		<div className={styles.configForm}>
			{/* Room Size */}
			<div className={styles.configForm__field}>
				<label className={styles.configForm__label}>
					{t('Room Size')}
				</label>
				<p className={styles.configForm__description}>
					{t('Number of participants per room (2-50)')}
				</p>
				<input
					type="number"
					min={2}
					max={50}
					value={roomSize}
					onChange={handleRoomSizeChange}
					className={styles.configForm__input}
				/>
			</div>

			{/* Question Selector */}
			<div className={styles.configForm__field}>
				<label className={styles.configForm__label}>
					{t('Scramble by Demographics')} ({t('Optional')})
				</label>
				<p className={styles.configForm__description}>
					{t('Select demographic questions to ensure diverse room composition, or leave empty for random assignment')}
				</p>
				<QuestionSelector
					questions={selectableQuestions}
					selectedQuestionIds={selectedQuestions}
					onToggle={handleQuestionToggle}
				/>
			</div>

			{/* Preview */}
			{estimatedParticipants > 0 && (
				<div className={styles.configForm__preview}>
					<div className={styles.configForm__previewTitle}>
						{t('Preview')}
					</div>
					<div className={styles.configForm__previewStats}>
						<span className={styles.configForm__previewStat}>
							{t('Participants')}: <strong>{estimatedParticipants}</strong>
						</span>
						<span className={styles.configForm__previewStat}>
							{t('Estimated Rooms')}: <strong>{estimatedRooms}</strong>
						</span>
					</div>
				</div>
			)}

			{/* Actions */}
			<div className={styles.configForm__actions}>
				<Button
					text={isCreating ? t('Creating...') : existingSettings ? t('Reassign Rooms') : t('Create Breakout Rooms')}
					buttonType={ButtonType.PRIMARY}
					onClick={handleCreateClick}
					disabled={!canCreate || isCreating}
				/>
			</div>

			{/* Confirm Modal for Reassignment */}
			{showConfirm && (
				<div className={styles.confirmModal}>
					<div className={styles.confirmModal__content}>
						<h3 className={styles.confirmModal__title}>
							{t('Replace Existing Assignments?')}
						</h3>
						<p className={styles.confirmModal__message}>
							{t('This will delete the current room assignments and create new ones.')}
						</p>
						<div className={styles.confirmModal__actions}>
							<Button
								text={t('Cancel')}
								buttonType={ButtonType.SECONDARY}
								onClick={() => setShowConfirm(false)}
							/>
							<Button
								text={t('Replace')}
								buttonType={ButtonType.PRIMARY}
								onClick={handleCreate}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default RoomAssignmentConfig;
