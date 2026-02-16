import React, { FC, useEffect, useRef, useState } from 'react';

// Third Party

// Redux Store
import StatementChatMore from '../../../../chat/components/statementChatMore/StatementChatMore';
import CreateStatementModal from '../../../../createStatementModal/CreateStatementModal';
import Evaluation from '../../evaluation/Evaluation';
import SolutionMenu from '../../solutionMenu/SolutionMenu';
import AddQuestionIcon from '@/assets/icons/addQuestion.svg?react';
import EyeIcon from '@/assets/icons/eye.svg?react';
import EyeCrossIcon from '@/assets/icons/eyeCross.svg?react';
import CheckIcon from '@/assets/icons/checkIcon.svg?react';
import {
	updateStatementText,
	updateStatementMainImage,
	toggleStatementHide,
} from '@/controllers/db/statements/setStatements';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import useStatementColor, { StyleProps } from '@/controllers/hooks/useStatementColor';
import EditableStatement from '@/view/components/edit/EditableStatement';
import IconButton from '@/view/components/iconButton/IconButton';
import styles from './SuggestionCard.module.scss';
import { StatementType, Statement } from '@freedi/shared-types';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { toggleJoining, ToggleJoiningResult } from '@/controllers/db/joining/setJoining';
import Joined from '@/view/components/joined/Joined';
import ImprovementModal from '@/view/components/improvementModal/ImprovementModal';
import { improveSuggestionWithTimeout } from '@/services/suggestionImprovement';
import Loader from '@/view/components/loaders/Loader';
import CommunityBadge from '@/view/components/badges/CommunityBadge';
import AnchoredBadge from '@/view/components/badges/AnchoredBadge';
import UploadImage from '@/view/components/uploadImage/UploadImage';
import StatementImage from './StatementImage';
import IntegrateSuggestionsModal from '@/view/components/integrateSuggestions/IntegrateSuggestionsModal';
import RoomBadge from '@/view/components/roomBadge/RoomBadge';

interface Props {
	statement: Statement | undefined;
	parentStatement?: Statement | undefined;
}

const SuggestionCard: FC<Props> = ({ parentStatement, statement }) => {
	// Hooks
	if (!parentStatement) console.error('parentStatement is not defined');

	const { t, dir } = useTranslation();
	// Use parent's authorization instead of individual card authorization
	const { isAuthorized, isAdmin, creator } = useAuthorization(parentStatement?.statementId);
	const enableJoining = parentStatement?.statementSettings?.joiningEnabled;
	const singleJoinOnly = parentStatement?.statementSettings?.singleJoinOnly;
	const minJoinMembers = parentStatement?.statementSettings?.minJoinMembers;
	const maxJoinMembers = parentStatement?.statementSettings?.maxJoinMembers;
	const showEvaluation = parentStatement?.statementSettings?.showEvaluation;
	const enableAIImprovement = parentStatement?.statementSettings?.enableAIImprovement;
	const showBadges =
		parentStatement?.evaluationSettings?.anchored?.differentiateBetweenAnchoredAndNot;
	const isAnchored = statement?.anchored === true;
	const anchorIcon = parentStatement?.evaluationSettings?.anchored?.anchorIcon;
	const anchorDescription = parentStatement?.evaluationSettings?.anchored?.anchorDescription;
	const anchorLabel = parentStatement?.evaluationSettings?.anchored?.anchorLabel;

	// Use Refs
	const elementRef = useRef<HTMLDivElement>(null);
	const textContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Early return if statement is not defined
	if (!statement) return null;

	const hasJoinedServer = statement?.joined?.find((c) => c?.uid === creator?.uid) ? true : false;

	// Join count and status for visual indicators
	const joinedCount = statement?.joined?.length ?? 0;
	const isBelowMinimum =
		enableJoining && minJoinMembers !== undefined && joinedCount < minJoinMembers;
	const isAboveMinimum =
		enableJoining && minJoinMembers !== undefined && joinedCount >= minJoinMembers;
	// Note: exceeding max is handled by admin splitting into rooms, not by blocking joining
	const exceedsMaximum =
		enableJoining && maxJoinMembers !== undefined && joinedCount > maxJoinMembers;

	// Optimistic state for instant UI updates
	const [hasJoinedOptimistic, setHasJoinedOptimistic] = useState(hasJoinedServer);
	const [isJoinLoading, setIsJoinLoading] = useState(false);

	// Update optimistic state when server state changes
	useEffect(() => {
		setHasJoinedOptimistic(hasJoinedServer);
	}, [hasJoinedServer]);

	// Use States
	const [isEdit, setIsEdit] = useState(false);
	const [shouldShowAddSubQuestionModal, setShouldShowAddSubQuestionModal] = useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);

	// Improvement feature states
	const [showImprovementModal, setShowImprovementModal] = useState(false);
	const [isImproving, setIsImproving] = useState(false);
	const [originalTitle, setOriginalTitle] = useState<string | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [originalDescription, setOriginalDescription] = useState<string | null>(null);
	const [hasBeenImproved, setHasBeenImproved] = useState(false);

	// Image states
	const imageUrl = statement?.imagesURL?.main ?? '';
	const [image, setImage] = useState<string>(imageUrl);
	const [showImageUpload, setShowImageUpload] = useState(false);

	// Integration modal state
	const [showIntegrationModal, setShowIntegrationModal] = useState(false);

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
				const cancelOption = window.confirm('Are you sure you want to cancel this option?');
				if (!cancelOption) return;
			}

			const newType =
				statement?.statementType === StatementType.option
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

	async function handleJoin() {
		// Optimistically update the UI immediately
		setHasJoinedOptimistic(!hasJoinedOptimistic);
		setIsJoinLoading(true);

		try {
			// Call the API function with parentStatementId for single-join logic
			const result: ToggleJoiningResult = await toggleJoining({
				statementId: statement.statementId,
				parentStatementId: parentStatement?.statementId,
			});

			if (!result.success) {
				// If the API call fails, revert the optimistic update
				setHasJoinedOptimistic(hasJoinedOptimistic);
				console.error(result.error ?? t('Failed to toggle joining'));
			} else if (result.leftStatementTitle && singleJoinOnly) {
				// Show notification that user left another option
				console.info(t('You left') + ` "${result.leftStatementTitle}" ` + t('to join this option'));
			}
		} catch (error) {
			// If the API call fails, revert the optimistic update
			console.error('Failed to toggle joining:', error);
			setHasJoinedOptimistic(hasJoinedOptimistic);
		} finally {
			setIsJoinLoading(false);
		}
	}

	async function handleImprove(instructions: string) {
		try {
			setIsImproving(true);
			setShowImprovementModal(false);

			// Store original title and summary before improvement
			if (!originalTitle) {
				setOriginalTitle(statement.statement);
				setOriginalDescription(statement.summary || null);
			}

			// Call the improvement service with title and summary, including parent context
			// Increased timeout to 45 seconds to handle longer AI processing times
			const { improvedTitle } = await improveSuggestionWithTimeout(
				statement.statement,
				statement.summary,
				instructions,
				parentStatement?.statement, // Parent question/title for context
				parentStatement?.summary, // Parent summary for additional context
				45000, // 45 seconds timeout
			);

			// Update title in the database (paragraphs not modified by AI improvement)
			await updateStatementText(statement, improvedTitle);

			// Mark as improved and enable edit mode
			setHasBeenImproved(true);
			setIsEdit(true);
		} catch (error) {
			console.error('Failed to improve suggestion:', error);
			// Show more specific error message based on the error type
			let errorMessage = t('Failed to improve suggestion. Please try again.');
			if (error instanceof Error) {
				if (error.message.includes('timed out')) {
					errorMessage = t(
						'The improvement request took too long. Please try again with simpler instructions.',
					);
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
			// Restore original title
			updateStatementText(statement, originalTitle);
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

	// Check if statement is in parent's results array (evaluation/consensus winner)
	const isInResults =
		parentStatement?.results?.some((result) => result.statementId === statement.statementId) ??
		false;

	// Check if statement is the voting winner (from voting screen)
	const isVotingWinner = parentStatement?.topVotedOption?.statementId === statement.statementId;

	// Border: Green if in results (evaluation winner), otherwise use statement type color (yellow for options)
	const selectedOptionIndicator = `8px solid ${isInResults ? 'var(--approve)' : statementColor.backgroundColor || 'white'}`;

	function handleToggleHide(e: React.MouseEvent) {
		e.stopPropagation();
		toggleStatementHide(statement.statementId);
	}

	return (
		<div
			onContextMenu={(e) => handleRightClick(e)}
			className={`
				${styles['statement-evaluation-card']}
				${statementAge < 10000 ? styles['statement-evaluation-card--new'] : ''}
				${showBadges && !isAnchored ? styles['statement-evaluation-card--community'] : ''}
				${statement.hide ? styles['statement-evaluation-card--hidden'] : ''}
				${showEvaluation && isVotingWinner ? styles['statement-evaluation-card--hasVotingBadge'] : ''}
				${isBelowMinimum ? styles['statement-evaluation-card--below-minimum'] : ''}
				${isAboveMinimum ? styles['statement-evaluation-card--above-minimum'] : ''}
				${exceedsMaximum ? styles['statement-evaluation-card--exceeds-maximum'] : ''}
			`.trim()}
			style={{
				borderLeft: showEvaluation ? selectedOptionIndicator : '12px solid transparent',
				color: statementColor.color,
				flexDirection: dir === 'ltr' ? 'row' : 'row-reverse',
				pointerEvents: statement.hide && !isAuthorized ? 'none' : 'auto',
			}}
			ref={elementRef}
			id={statement.statementId}
		>
			{/* Hidden badge - visible when card is hidden, clickable for admins */}
			{statement.hide && (
				<button
					type="button"
					className={`${styles.hiddenBadge} ${isAuthorized ? styles['hiddenBadge--clickable'] : ''}`}
					onClick={isAuthorized ? handleToggleHide : undefined}
					title={isAuthorized ? t('Click to unhide') : t('Hidden from participants')}
					aria-label={isAuthorized ? t('Unhide this card') : t('This card is hidden')}
				>
					<EyeCrossIcon />
					<span>{t('Hidden')}</span>
				</button>
			)}

			{/* Quick unhide button - appears on hover for admins on hidden cards */}
			{statement.hide && isAuthorized && (
				<button
					type="button"
					className={styles.quickUnhideBtn}
					onClick={handleToggleHide}
					title={t('Unhide')}
					aria-label={t('Unhide this card')}
				>
					<EyeIcon />
				</button>
			)}

			{/* Loader overlay when improving */}
			{isImproving && (
				<div className={styles.loaderOverlay}>
					<Loader />
					<p>{t('Improving suggestion...')}</p>
				</div>
			)}
			{/* Voting winner badge - compact pill with checkmark */}
			{showEvaluation && isVotingWinner && (
				<div
					className={styles.votingWinnerBadge}
					title={t('Selected as the winning option')}
					aria-label={t('Selected as the winning option')}
				>
					<CheckIcon />
					<span>{t('Selected')}</span>
				</div>
			)}
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
								<button onClick={handleUndo} className="btn btn--small btn--cancel">
									{t('Undo')}
								</button>
							)}
							{enableJoining && (
								<>
									<Joined statement={statement} />
									{/* Room Badge - shows user's assigned room for this option */}
									<RoomBadge statementId={statement.statementId} />
									{/* Join count indicator */}
									{(minJoinMembers !== undefined || maxJoinMembers !== undefined) && (
										<span
											className={`
												${styles.joinIndicator}
												${isBelowMinimum ? styles['joinIndicator--warning'] : ''}
												${isAboveMinimum ? styles['joinIndicator--success'] : ''}
												${exceedsMaximum ? styles['joinIndicator--exceeds'] : ''}
											`.trim()}
										>
											{joinedCount}
											{maxJoinMembers !== undefined && `/${maxJoinMembers}`} {t('members')}
										</span>
									)}
									<button
										onClick={handleJoin}
										disabled={isJoinLoading}
										className="btn btn--small"
										style={{
											backgroundColor: hasJoinedOptimistic ? 'var(--approve)' : 'inherit',
											color: hasJoinedOptimistic ? 'white' : 'inherit',
											borderColor: hasJoinedOptimistic ? 'var(--approve)' : 'inherit',
											opacity: isJoinLoading ? 0.7 : 1,
											cursor: isJoinLoading ? 'not-allowed' : 'pointer',
										}}
									>
										{hasJoinedOptimistic ? t('Leave') : t('Join')}
									</button>
								</>
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
							onIntegrate={() => setShowIntegrationModal(true)}
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
								() => {} //delete the brackets and uncomment the line below for functionality
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
					<button onClick={() => setShowImageUpload(false)} className={styles.closeUploadBtn}>
						✕
					</button>
				</div>
			)}
			{/* Integration Modal */}
			{showIntegrationModal && parentStatement && (
				<IntegrateSuggestionsModal
					sourceStatementId={statement.statementId}
					parentStatementId={parentStatement.statementId}
					onClose={() => setShowIntegrationModal(false)}
					onSuccess={() => {
						setShowIntegrationModal(false);
					}}
				/>
			)}
		</div>
	);
};

export default SuggestionCard;
