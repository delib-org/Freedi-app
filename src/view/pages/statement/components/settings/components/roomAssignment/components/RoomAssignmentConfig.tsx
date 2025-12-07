import { FC, useState, useMemo, useEffect } from 'react';
import { shallowEqual } from 'react-redux';
import {
	Statement,
	User,
	RoomSettings,
	UserDemographicQuestionType,
	Collections,
} from 'delib-npm';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { selectUserDemographicQuestionsByStatementId } from '@/redux/userDemographic/userDemographicSlice';
import { createRoomAssignments, createILPRoomAssignments, notifyRoomParticipants } from '@/controllers/db/roomAssignment';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import QuestionSelector from './QuestionSelector';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import styles from '../RoomAssignment.module.scss';

interface RoomAssignmentConfigProps {
	statement: Statement;
	user: User;
	existingSettings?: RoomSettings;
	onCreateSuccess: () => void;
}

interface AssignmentResult {
	heterogeneityScore: number;
	satisfactionScore: number;
	totalRooms: number;
	totalParticipants: number;
	avgRoomSize: number;
	solverStatus: string;
}

const RoomAssignmentConfig: FC<RoomAssignmentConfigProps> = ({
	statement,
	user,
	existingSettings,
	onCreateSuccess,
}) => {
	const { t } = useTranslation();
	const dispatch = useAppDispatch();

	// State - Legacy mode
	const [roomSize, setRoomSize] = useState(existingSettings?.roomSize || 6);
	const [selectedQuestions, setSelectedQuestions] = useState<string[]>(
		existingSettings?.scrambleByQuestions || []
	);

	// State - ILP mode
	const [useILP, setUseILP] = useState(true);
	const [minRoomSize, setMinRoomSize] = useState(5);
	const [maxRoomSize, setMaxRoomSize] = useState(7);
	const [joinedParticipantsCount, setJoinedParticipantsCount] = useState(0);
	const [lastResult, setLastResult] = useState<AssignmentResult | null>(null);

	// Common state
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

	// Fetch joined participants count for ILP mode
	useEffect(() => {
		const fetchJoinedCount = async () => {
			try {
				const joinedRef = collection(FireStore, 'joinedParticipants');
				const q = query(
					joinedRef,
					where('parentId', '==', statement.statementId)
				);
				const snapshot = await getDocs(q);
				setJoinedParticipantsCount(snapshot.size);
			} catch (error) {
				console.error('Failed to fetch joined participants count:', error);
			}
		};

		if (useILP) {
			fetchJoinedCount();
		}
	}, [statement.statementId, useILP]);

	// Calculate estimated rooms for ILP mode
	const estimatedRoomsILP = useMemo(() => {
		if (joinedParticipantsCount === 0) return 0;
		const avgSize = (minRoomSize + maxRoomSize) / 2;

		return Math.ceil(joinedParticipantsCount / avgSize);
	}, [joinedParticipantsCount, minRoomSize, maxRoomSize]);

	// Get member count for legacy mode
	const estimatedParticipants = 0; // This would come from subscription count
	const estimatedRooms = Math.ceil(estimatedParticipants / roomSize) || 0;

	const handleRoomSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseInt(e.target.value, 10);
		if (value >= 2 && value <= 50) {
			setRoomSize(value);
		}
	};

	const handleMinRoomSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseInt(e.target.value, 10);
		if (value >= 2 && value <= maxRoomSize) {
			setMinRoomSize(value);
		}
	};

	const handleMaxRoomSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseInt(e.target.value, 10);
		if (value >= minRoomSize && value <= 50) {
			setMaxRoomSize(value);
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
		setLastResult(null);

		try {
			if (useILP) {
				// Use ILP-based assignment
				const result = await createILPRoomAssignments(
					statement.statementId,
					minRoomSize,
					maxRoomSize,
					true,
					user,
					dispatch
				);

				if (result?.success && result.settingsId) {
					setLastResult({
						heterogeneityScore: result.heterogeneityScore,
						satisfactionScore: result.satisfactionScore,
						totalRooms: result.totalRooms,
						totalParticipants: result.totalParticipants,
						avgRoomSize: result.avgRoomSize,
						solverStatus: result.solverStatus,
					});
					await notifyRoomParticipants(result.settingsId, dispatch);
					onCreateSuccess();
				}
			} else {
				// Use legacy scrambling
				const result = await createRoomAssignments(
					statement.statementId,
					topParentId,
					roomSize,
					selectedQuestions,
					user,
					dispatch
				);

				if (result?.success && result.settingsId) {
					await notifyRoomParticipants(result.settingsId, dispatch);
					onCreateSuccess();
				}
			}
		} catch (error) {
			console.error('Failed to create room assignments:', error);
		} finally {
			setIsCreating(false);
		}
	};

	const canCreate = useILP
		? minRoomSize >= 2 && maxRoomSize >= minRoomSize && joinedParticipantsCount > 0
		: roomSize >= 2;

	return (
		<div className={styles.configForm}>
			{/* Assignment Mode Toggle */}
			<div className={styles.configForm__field}>
				<label className={styles.configForm__label}>
					{t('Assignment Mode')}
				</label>
				<div className={styles.configForm__toggle}>
					<button
						type="button"
						className={`${styles.configForm__toggleBtn} ${useILP ? styles['configForm__toggleBtn--active'] : ''}`}
						onClick={() => setUseILP(true)}
					>
						{t('Optimal (ILP)')}
					</button>
					<button
						type="button"
						className={`${styles.configForm__toggleBtn} ${!useILP ? styles['configForm__toggleBtn--active'] : ''}`}
						onClick={() => setUseILP(false)}
					>
						{t('Simple Scrambling')}
					</button>
				</div>
				<p className={styles.configForm__description}>
					{useILP
						? t('Uses optimization to maximize demographic diversity in each room')
						: t('Randomly assigns participants to rooms based on demographic questions')
					}
				</p>
			</div>

			{/* ILP Mode Settings */}
			{useILP ? (
				<>
					{/* Room Size Range */}
					<div className={styles.configForm__field}>
						<label className={styles.configForm__label}>
							{t('Room Size Range')}
						</label>
						<p className={styles.configForm__description}>
							{t('Minimum and maximum participants per room')}
						</p>
						<div className={styles.configForm__rangeInputs}>
							<div className={styles.configForm__rangeInput}>
								<span>{t('Min')}</span>
								<input
									type="number"
									min={2}
									max={maxRoomSize}
									value={minRoomSize}
									onChange={handleMinRoomSizeChange}
									className={styles.configForm__input}
								/>
							</div>
							<span className={styles.configForm__rangeSeparator}>-</span>
							<div className={styles.configForm__rangeInput}>
								<span>{t('Max')}</span>
								<input
									type="number"
									min={minRoomSize}
									max={50}
									value={maxRoomSize}
									onChange={handleMaxRoomSizeChange}
									className={styles.configForm__input}
								/>
							</div>
						</div>
					</div>

					{/* ILP Preview */}
					<div className={styles.configForm__preview}>
						<div className={styles.configForm__previewTitle}>
							{t('Preview')}
						</div>
						<div className={styles.configForm__previewStats}>
							<span className={styles.configForm__previewStat}>
								{t('Joined Participants')}: <strong>{joinedParticipantsCount}</strong>
							</span>
							<span className={styles.configForm__previewStat}>
								{t('Estimated Rooms')}: <strong>{estimatedRoomsILP}</strong>
							</span>
						</div>
						{joinedParticipantsCount === 0 && (
							<p className={styles.configForm__warning}>
								{t('No participants have joined yet. Users need to join options with spectrum data first.')}
							</p>
						)}
					</div>

					{/* Last Result Stats */}
					{lastResult && (
						<div className={styles.configForm__result}>
							<div className={styles.configForm__resultTitle}>
								{t('Assignment Results')}
							</div>
							<div className={styles.configForm__resultStats}>
								<span className={styles.configForm__resultStat}>
									{t('Heterogeneity Score')}: <strong>{(lastResult.heterogeneityScore * 100).toFixed(0)}%</strong>
								</span>
								<span className={styles.configForm__resultStat}>
									{t('Satisfaction Score')}: <strong>{(lastResult.satisfactionScore * 100).toFixed(0)}%</strong>
								</span>
								<span className={styles.configForm__resultStat}>
									{t('Total Rooms')}: <strong>{lastResult.totalRooms}</strong>
								</span>
								<span className={styles.configForm__resultStat}>
									{t('Avg Room Size')}: <strong>{lastResult.avgRoomSize.toFixed(1)}</strong>
								</span>
							</div>
						</div>
					)}
				</>
			) : (
				<>
					{/* Legacy Room Size */}
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

					{/* Legacy Preview */}
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
				</>
			)}

			{/* Actions */}
			<div className={styles.configForm__actions}>
				<Button
					text={isCreating ? t('Creating...') : existingSettings ? t('Reassign Rooms') : t('Create Assignments')}
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
