import React, { FC, useEffect, useRef, useState } from 'react';

// Third Party

// Redux Store
import StatementChatMore from '../../../../chat/components/statementChatMore/StatementChatMore';
import CreateStatementModal from '../../../../createStatementModal/CreateStatementModal';
import Evaluation from '../../evaluation/Evaluation';
import SolutionMenu from '../../solutionMenu/SolutionMenu';
import AddQuestionIcon from '@/assets/icons/addQuestion.svg?react';
import { updateStatementText, updateStatementMainImage } from '@/controllers/db/statements/setStatements';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import useStatementColor, {
	StyleProps,
} from '@/controllers/hooks/useStatementColor';
import { setStatementElementHight } from '@/redux/statements/statementsSlice';
import EditableStatement from '@/view/components/edit/EditableStatement';
import IconButton from '@/view/components/iconButton/IconButton';
import styles from './SuggestionCard.module.scss';
import { StatementType, Statement } from 'delib-npm';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { toggleJoining, toggleJoiningWithSpectrum, getUserSpectrumForParent } from '@/controllers/db/joining/setJoining';
import Joined from '@/view/components/joined/Joined';
import ImprovementModal from '@/view/components/improvementModal/ImprovementModal';
import { improveSuggestionWithTimeout } from '@/services/suggestionImprovement';
import Loader from '@/view/components/loaders/Loader';
import CommunityBadge from '@/view/components/badges/CommunityBadge';
import AnchoredBadge from '@/view/components/badges/AnchoredBadge';
import UploadImage from '@/view/components/uploadImage/UploadImage';
import StatementImage from './StatementImage';
import SpectrumModal from '@/view/components/spectrumModal/SpectrumModal';
import RoomBadge from '@/view/components/badges/RoomBadge';
import RoomTabs from '@/view/components/roomTabs/RoomTabs';
import { getSpectrumSettings } from '@/controllers/db/spectrumSettings';
import { SpectrumSettings } from '@/types/spectrumSettings';
import {
	selectRoomsByStatementId,
	selectMyRoomForStatement,
	selectParticipantsByStatementId,
} from '@/redux/roomAssignment/roomAssignmentSlice';

interface Props {
	statement: Statement | undefined;
	parentStatement?: Statement | undefined;
	positionAbsolute?: boolean;
}

const SuggestionCard: FC<Props> = ({
	parentStatement,
	statement,
	positionAbsolute = true,
}) => {
	// Hooks
	if (!parentStatement) console.error('parentStatement is not defined');

	const { t, dir } = useTranslation();
	// Use parent's authorization instead of individual card authorization
	const { isAuthorized, isAdmin, creator } = useAuthorization(parentStatement?.statementId);
	const showEvaluation = parentStatement?.statementSettings?.showEvaluation;
	const enableAIImprovement = parentStatement?.statementSettings?.enableAIImprovement;
	const showBadges = parentStatement?.evaluationSettings?.anchored?.differentiateBetweenAnchoredAndNot;
	const isAnchored = statement?.anchored === true;
	const anchorIcon = parentStatement?.evaluationSettings?.anchored?.anchorIcon;
	const anchorDescription = parentStatement?.evaluationSettings?.anchored?.anchorDescription;
	const anchorLabel = parentStatement?.evaluationSettings?.anchored?.anchorLabel;

	// Redux Store
	const dispatch = useAppDispatch();

	// Room assignment selectors - only select if statement exists
	const roomsForThisOption = useAppSelector(
		statement ? selectRoomsByStatementId(statement.statementId) : () => []
	);
	const myRoomAssignment = useAppSelector(
		statement && creator ? selectMyRoomForStatement(statement.statementId, creator.uid) : () => undefined
	);
	const roomParticipants = useAppSelector(
		statement ? selectParticipantsByStatementId(statement.statementId) : () => []
	);

	// Find my room from the rooms list
	const myRoom = myRoomAssignment
		? roomsForThisOption.find(r => r.roomId === myRoomAssignment.roomId)
		: undefined;

	// Use Refs
	const elementRef = useRef<HTMLDivElement>(null);
	const textContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Early return if statement is not defined
	if (!statement) return null;

	const hasJoinedServer = statement?.joined?.find(
		(c) => c?.uid === creator?.uid
	) ? true : false;

	// Optimistic state for instant UI updates
	const [hasJoinedOptimistic, setHasJoinedOptimistic] = useState(hasJoinedServer);
	const [isJoinLoading, setIsJoinLoading] = useState(false);

	// Update optimistic state when server state changes
	useEffect(() => {
		setHasJoinedOptimistic(hasJoinedServer);
	}, [hasJoinedServer]);

	// Fetch spectrum settings from parent question to check if joining is enabled
	useEffect(() => {
		const fetchSpectrumSettings = async () => {
			if (parentStatement?.statementId) {
				const settings = await getSpectrumSettings(parentStatement.statementId);
				setSpectrumSettings(settings);
			}
		};
		fetchSpectrumSettings();
	}, [parentStatement?.statementId]);

	// Use States
	const [isEdit, setIsEdit] = useState(false);
	const [shouldShowAddSubQuestionModal, setShouldShowAddSubQuestionModal] =
		useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);

	// Spectrum modal state for joining with demographic data
	const [showSpectrumModal, setShowSpectrumModal] = useState(false);
	const [spectrumSettings, setSpectrumSettings] = useState<SpectrumSettings | null>(null);

	// Improvement feature states
	const [showImprovementModal, setShowImprovementModal] = useState(false);
	const [isImproving, setIsImproving] = useState(false);
	const [originalTitle, setOriginalTitle] = useState<string | null>(null);
	const [originalDescription, setOriginalDescription] = useState<string | null>(null);
	const [hasBeenImproved, setHasBeenImproved] = useState(false);

	// Image states
	const imageUrl = statement?.imagesURL?.main ?? "";
	const [image, setImage] = useState<string>(imageUrl);
	const [showImageUpload, setShowImageUpload] = useState(false);

	// Real-time listener for image changes
	useEffect(() => {
		if (statement?.imagesURL?.main !== undefined) {
			setImage(statement.imagesURL.main);
		}
	}, [statement?.imagesURL?.main]);

	// Removed sortSubStatements call - sorting is handled at parent level in SuggestionCards

	const statementColor: StyleProps = useStatementColor({
		statement,
	});

	useEffect(() => {
		const element = elementRef.current;
		if (element) {
			const updateHeight = () => {
				const height = element.clientHeight;
				dispatch(
					setStatementElementHight({
						statementId: statement.statementId,
						height,
					})
				);
			};

			// Update height initially
			setTimeout(updateHeight, 0);

			// Optionally use ResizeObserver for dynamic height changes
			const resizeObserver = new ResizeObserver(() => {
				updateHeight();
			});
			resizeObserver.observe(element);

			return () => {
				resizeObserver.disconnect();
			};
		}
	}, [statement.statementId, dispatch]);

	// Check if text is clamped and add overflow class
	useEffect(() => {
		const checkOverflow = () => {
			const textContainer = textContainerRef.current;
			if (textContainer) {
				const textElement = textContainer.parentElement;

				if (textElement) {
					// Always show button when expanded (to allow collapsing)
					if (isExpanded) {
						textElement.classList.add(styles.hasOverflow);
					} else {
						// Only show when actually overflowing
						const isOverflowing = textContainer.scrollHeight > textContainer.clientHeight;
						if (isOverflowing) {
							textElement.classList.add(styles.hasOverflow);
						} else {
							textElement.classList.remove(styles.hasOverflow);
						}
					}
				}
			}
		};

		// Add a small delay to ensure rendering is complete
		setTimeout(checkOverflow, 50);
	}, [statement?.statement, isExpanded]);

	async function handleSetOption() {
		try {
			if (statement?.statementType === StatementType.option) {
				const cancelOption = window.confirm(
					'Are you sure you want to cancel this option?'
				);
				if (!cancelOption) return;
			}

			const newType = statement?.statementType === StatementType.option
				? StatementType.statement
				: StatementType.option;

			const result = await changeStatementType(statement, newType, isAuthorized);
			if (!result.success && result.error) {
				alert(result.error);
			}
		} catch (error) {
			console.error(error);
		}
	}

	async function handleJoinClick() {
		if (hasJoinedOptimistic) {
			// If already joined, directly leave (no spectrum modal needed)
			handleLeave();
		} else {
			// Check if spectrum survey is enabled
			const spectrumEnabled = spectrumSettings?.enabled === true;
			if (spectrumEnabled && parentStatement?.statementId) {
				// Check if user already has a spectrum value for this parent question
				const existingSpectrum = await getUserSpectrumForParent(parentStatement.statementId);
				if (existingSpectrum !== null) {
					// User already rated themselves - use existing spectrum and join directly
					handleSpectrumSubmit(existingSpectrum);
				} else {
					// First time rating - show spectrum modal
					setShowSpectrumModal(true);
				}
			} else {
				// Spectrum disabled by admin - join directly without survey
				handleDirectJoin();
			}
		}
	}

	async function handleDirectJoin() {
		// Join directly without spectrum (when admin disabled spectrum survey)
		setHasJoinedOptimistic(true);
		setIsJoinLoading(true);

		try {
			await toggleJoining(statement.statementId);
		} catch (error) {
			console.error('Failed to join:', error);
			setHasJoinedOptimistic(false);
		} finally {
			setIsJoinLoading(false);
		}
	}

	async function handleLeave() {
		// Optimistically update the UI immediately
		setHasJoinedOptimistic(false);
		setIsJoinLoading(true);

		try {
			// Call the API function in the background
			await toggleJoining(statement.statementId);
		} catch (error) {
			// If the API call fails, revert the optimistic update
			console.error('Failed to leave:', error);
			setHasJoinedOptimistic(true); // revert to joined state
		} finally {
			setIsJoinLoading(false);
		}
	}

	async function handleSpectrumSubmit(spectrum: number) {
		// Optimistically update the UI immediately
		setHasJoinedOptimistic(true);
		setShowSpectrumModal(false);
		setIsJoinLoading(true);

		try {
			// Call the API function with spectrum data
			await toggleJoiningWithSpectrum(statement.statementId, spectrum);
		} catch (error) {
			// If the API call fails, revert the optimistic update
			console.error('Failed to join with spectrum:', error);
			setHasJoinedOptimistic(false); // revert to not joined state
		} finally {
			setIsJoinLoading(false);
		}
	}

	async function handleImprove(instructions: string) {
		try {
			setIsImproving(true);
			setShowImprovementModal(false);

			// Store original title and description before improvement
			if (!originalTitle) {
				setOriginalTitle(statement.statement);
				setOriginalDescription(statement.description || null);
			}

			// Call the improvement service with both title and description, including parent context
			// Increased timeout to 45 seconds to handle longer AI processing times
			const { improvedTitle, improvedDescription } = await improveSuggestionWithTimeout(
				statement.statement,
				statement.description,
				instructions,
				parentStatement?.statement,  // Parent question/title for context
				parentStatement?.description, // Parent description for additional context
				45000 // 45 seconds timeout
			);

			// Update both title and description in the database
			await updateStatementText(statement, improvedTitle, improvedDescription);

			// Mark as improved and enable edit mode
			setHasBeenImproved(true);
			setIsEdit(true);
		} catch (error) {
			console.error('Failed to improve suggestion:', error);
			// Show more specific error message based on the error type
			let errorMessage = t('Failed to improve suggestion. Please try again.');
			if (error instanceof Error) {
				if (error.message.includes('timed out')) {
					errorMessage = t('The improvement request took too long. Please try again with simpler instructions.');
				} else if (error.message.includes('network')) {
					errorMessage = t('Network error. Please check your connection and try again.');
				}
			}
			alert(errorMessage);
		} finally {
			setIsImproving(false);
		}
	}

	function handleUndo() {
		if (originalTitle) {
			// Restore original title and description
			updateStatementText(statement, originalTitle, originalDescription || undefined);
			setHasBeenImproved(false);
			setOriginalTitle(null);
			setOriginalDescription(null);
			setIsEdit(false);
		}
	}

	const statementAge = new Date().getTime() - statement.createdAt;
	const hasChildren = parentStatement?.statementSettings?.hasChildren;

	function handleRightClick(e: React.MouseEvent) {
		e.preventDefault();
		setIsCardMenuOpen(!isCardMenuOpen);
	}

	const selectedOptionIndicator = `8px solid ${statement.isChosen ? 'var(--approve)' : statementColor.backgroundColor || 'white'}`;

	return (
		<div
			onContextMenu={(e) => handleRightClick(e)}
			className={`
				${styles['statement-evaluation-card']}
				${statementAge < 10000 ? styles['statement-evaluation-card--new'] : ''}
				${showBadges && !isAnchored ? styles['statement-evaluation-card--community'] : ''}
			`.trim()}
			style={{
				top: `${positionAbsolute ? statement.top || 0 : 0}px`,
				borderLeft: showEvaluation ? selectedOptionIndicator : '12px solid transparent',
				color: statementColor.color,
				flexDirection: dir === 'ltr' ? 'row' : 'row-reverse',
				opacity: statement.hide ? 0.5 : 1,
				pointerEvents: (statement.hide && !isAuthorized ? 'none' : 'auto'),
				position: positionAbsolute ? 'absolute' : 'relative',
			}}
			ref={elementRef}
			id={statement.statementId}
		>
			{/* Loader overlay when improving */}
			{isImproving && (
				<div className={styles.loaderOverlay}>
					<Loader />
					<p>{t('Improving suggestion...')}</p>
				</div>
			)}
			{showEvaluation && <div
				className={styles['selected-option']}
				style={{
					backgroundColor:
						statement.isVoted === true ? 'var(--approve)' : '',
				}}
			>
				<div
					style={{
						color: statementColor.color,
						display: statement.isVoted ? 'block' : 'none',
					}}
				>
					{t('Selected')}
				</div>
			</div>
			}
			{/* Image - Display image at the top of card */}
			{image && (
				<StatementImage
					statement={statement}
					image={image}
					setImage={setImage}
					displayMode="above"
					onRemove={async () => {
						setImage('');
						await updateStatementMainImage(statement, '');
					}}
					isAdmin={isAdmin}
					fileInputRef={fileInputRef}
				/>
			)}
			<div className={styles.main}>
				<div className={styles.info}>
					<div className={styles.text}>
						<div
							className={`${styles.textContent} ${isExpanded ? styles.textContentExpanded : ''}`}
							ref={textContainerRef}
						>
							<EditableStatement
								statement={statement}
								multiline={true}
								forceEditing={isEdit}
								onSaveSuccess={() => {
									setIsEdit(false);
									// Reset improvement state when user saves
									if (hasBeenImproved) {
										setHasBeenImproved(false);
										setOriginalTitle(null);
										setOriginalDescription(null);
									}
								}}
								onEditEnd={() => setIsEdit(false)}
								className={styles.editableCard}
								inputClassName={styles.editInput}
								saveButtonClassName={styles.editButtons}
							/>
						</div>

						<button
							type="button"
							onClick={() => setIsExpanded(!isExpanded)}
							className={styles.showMore}
						>
							{isExpanded ? t('Show less') : t('Show more')}
						</button>
						<div className={styles.buttonContainer}>
							{/* Show Add Image button if no image and user is admin of parent statement */}
							{!image && isAdmin && (
								<button
									onClick={() => setShowImageUpload(true)}
									className="btn btn--small btn--secondary"
								>
									{t('Add Image')}
								</button>
							)}
							{/* Show Improve button only if AI improvement is enabled */}
							{enableAIImprovement && !hasBeenImproved && (
								<button
									onClick={() => setShowImprovementModal(true)}
									disabled={isImproving}
									className={`btn btn--small btn--secondary ${isImproving ? 'btn--disabled' : ''}`}
								>
									{isImproving ? t('Improving...') : t('Improve')}
								</button>
							)}
							{/* Show Undo button when suggestion has been improved and AI improvement is enabled */}
							{enableAIImprovement && hasBeenImproved && (
								<button
									onClick={handleUndo}
									className="btn btn--small btn--cancel"
								>
									{t('Undo')}
								</button>
							)}
							{spectrumSettings?.enabled && (
								<>
									<Joined statement={statement} />
									<button
										onClick={handleJoinClick}
										disabled={isJoinLoading}
										className="btn btn--small"
										style={{
											backgroundColor: hasJoinedOptimistic ? 'var(--approve)' : 'inherit',
											color: hasJoinedOptimistic ? 'white' : 'inherit',
											borderColor: hasJoinedOptimistic ? 'var(--approve)' : 'inherit',
											opacity: isJoinLoading ? 0.7 : 1,
											cursor: isJoinLoading ? 'not-allowed' : 'pointer'
										}}
									>
										{hasJoinedOptimistic ? t('Leave') : t('Join')}
									</button>
								</>
							)}
							{/* Room assignment display */}
							{roomsForThisOption.length > 0 && (
								<div className={styles.roomDisplay}>
									{roomsForThisOption.length === 1 ? (
										<RoomBadge
											room={roomsForThisOption[0]}
											isCurrentUser={myRoom?.roomId === roomsForThisOption[0].roomId}
										/>
									) : (
										<RoomTabs
											rooms={roomsForThisOption}
											currentUserRoomId={myRoom?.roomId}
											participants={roomParticipants}
											currentUserId={creator?.uid}
										/>
									)}
								</div>
							)}
						</div>
					</div>
					<div className={styles.more}>
						<SolutionMenu
							statement={statement}
							isAuthorized={isAuthorized}
							isAdmin={isAdmin}
							isCardMenuOpen={isCardMenuOpen}
							setIsCardMenuOpen={setIsCardMenuOpen}
							isEdit={isEdit}
							setIsEdit={setIsEdit}
							handleSetOption={handleSetOption}
						/>
					</div>
				</div>

				<div className={styles.actions}>
					{hasChildren && (
						<div className={`${styles.chat} ${styles['chat-more-element']}`}>
							<StatementChatMore statement={statement} />
						</div>
					)}
					<div className={styles['evolution-element']}>
						<Evaluation statement={statement} />
					</div>
					{/* Badge for anchored/community statements */}
					{showBadges && (
						<div className={styles['badge-element']}>
							{isAnchored ? (
								<AnchoredBadge
									customIcon={anchorIcon}
									customDescription={anchorDescription}
									customLabel={anchorLabel}
								/>
							) : (
								<CommunityBadge />
							)}
						</div>
					)}
					{hasChildren && (
						<IconButton
							className={`${styles['add-sub-question-button']} ${styles['more-question']}`}
							style={{ display: 'none', cursor: 'default' }} // changed to display none for it to not take dom space
							onClick={
								() => { } //delete the brackets and uncomment the line below for functionality
								//	setShouldShowAddSubQuestionModal(true)
							}
						>
							<AddQuestionIcon />
						</IconButton>
					)}
				</div>
				{shouldShowAddSubQuestionModal && (
					<CreateStatementModal
						allowedTypes={[StatementType.question]}
						parentStatement={statement}
						isOption={false}
						setShowModal={setShouldShowAddSubQuestionModal}
					/>
				)}
			</div>
			{/* Improvement Modal */}
			<ImprovementModal
				isOpen={showImprovementModal}
				onClose={() => setShowImprovementModal(false)}
				onImprove={handleImprove}
				isLoading={isImproving}
				suggestionTitle={statement.statement}
			/>
			{/* Spectrum Modal for joining with demographic data */}
			{showSpectrumModal && (
				<SpectrumModal
					spectrumSettings={spectrumSettings}
					onSubmit={handleSpectrumSubmit}
					onClose={() => setShowSpectrumModal(false)}
					isLoading={isJoinLoading}
				/>
			)}
			{/* Upload area for initial image upload */}
			{!image && showImageUpload && (
				<div className={styles.uploadArea}>
					<UploadImage
						statement={statement}
						fileInputRef={fileInputRef}
						image={image}
						setImage={(newImage) => {
							setImage(newImage);
							setShowImageUpload(false);
						}}
						isAdmin={isAdmin}
					/>
					<button
						onClick={() => setShowImageUpload(false)}
						className={styles.closeUploadBtn}
					>
						✕
					</button>
				</div>
			)}
		</div>
	);
};

export default SuggestionCard;
