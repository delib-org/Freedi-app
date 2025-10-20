import React, { FC, useEffect, useRef, useState } from 'react';

// Third Party

// Redux Store
import { useParams } from 'react-router';
import StatementChatMore from '../../../../chat/components/statementChatMore/StatementChatMore';
import CreateStatementModal from '../../../../createStatementModal/CreateStatementModal';
import Evaluation from '../../evaluation/Evaluation';
import SolutionMenu from '../../solutionMenu/SolutionMenu';
import AddQuestionIcon from '@/assets/icons/addQuestion.svg?react';
import { updateStatementText, updateStatementMainImage } from '@/controllers/db/statements/setStatements';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import useStatementColor, {
	StyleProps,
} from '@/controllers/hooks/useStatementColor';
import { setStatementElementHight } from '@/redux/statements/statementsSlice';
import EditableStatement from '@/view/components/edit/EditableStatement';
import IconButton from '@/view/components/iconButton/IconButton';
import styles from './SuggestionCard.module.scss';
import { StatementType, Statement } from 'delib-npm';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { toggleJoining } from '@/controllers/db/joining/setJoining';
import Joined from '@/view/components/joined/Joined';
import { Link } from 'react-router';
import ImprovementModal from '@/view/components/improvementModal/ImprovementModal';
import { improveSuggestionWithTimeout } from '@/services/suggestionImprovement';
import Loader from '@/view/components/loaders/Loader';
import CommunityBadge from '@/view/components/badges/CommunityBadge';
import AnchoredBadge from '@/view/components/badges/AnchoredBadge';
import UploadImage from '@/view/components/uploadImage/UploadImage';

interface Props {
	statement: Statement | undefined;
	siblingStatements?: Statement[];
	parentStatement?: Statement | undefined;
	positionAbsolute?: boolean;
}

const SuggestionCard: FC<Props> = ({
	parentStatement,
	siblingStatements,
	statement,
	positionAbsolute = true,
}) => {
	// Hooks
	if (!parentStatement) console.error('parentStatement is not defined');

	const { t, dir } = useUserConfig();
	// Use parent's authorization instead of individual card authorization
	const { isAuthorized, isAdmin, creator } = useAuthorization(parentStatement?.statementId);
	const enableJoining = parentStatement?.statementSettings?.joiningEnabled;
	const showEvaluation = parentStatement?.statementSettings?.showEvaluation;
	const enableAIImprovement = parentStatement?.statementSettings?.enableAIImprovement;
	const showBadges = parentStatement?.evaluationSettings?.anchored?.differentiateBetweenAnchoredAndNot;
	const isAnchored = statement?.anchored === true;
	const anchorIcon = parentStatement?.evaluationSettings?.anchored?.anchorIcon;
	const anchorDescription = parentStatement?.evaluationSettings?.anchored?.anchorDescription;
	const anchorLabel = parentStatement?.evaluationSettings?.anchored?.anchorLabel;

	// Redux Store
	const dispatch = useAppDispatch();

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

	// Use States
	const [isEdit, setIsEdit] = useState(false);
	const [shouldShowAddSubQuestionModal, setShouldShowAddSubQuestionModal] =
		useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);

	// Improvement feature states
	const [showImprovementModal, setShowImprovementModal] = useState(false);
	const [isImproving, setIsImproving] = useState(false);
	const [originalTitle, setOriginalTitle] = useState<string | null>(null);
	const [originalDescription, setOriginalDescription] = useState<string | null>(null);
	const [hasBeenImproved, setHasBeenImproved] = useState(false);

	// Image states
	const imageUrl = statement?.imagesURL?.main ?? "";
	const [image, setImage] = useState<string>(imageUrl);
	const [imageDisplayMode, setImageDisplayMode] = useState<'above' | 'inline'>('above');
	const [showImageUpload, setShowImageUpload] = useState(false);

	// Removed sortSubStatements call - sorting is handled at parent level in SuggestionCards

	const statementColor: StyleProps = useStatementColor({
		statement,
	});

	useEffect(() => {
		const element = elementRef.current;
		if (element) {
			setTimeout(() => {
				dispatch(
					setStatementElementHight({
						statementId: statement.statementId,
						height: elementRef.current?.clientHeight,
					})
				);
			}, 0);
		}
	}, [elementRef.current?.clientHeight]);

	// Check if text is clamped and add overflow class
	useEffect(() => {
		const checkOverflow = () => {
			const textContainer = textContainerRef.current;
			if (textContainer) {
				const isOverflowing = textContainer.scrollHeight > textContainer.clientHeight;
				const textElement = textContainer.parentElement;

				if (textElement) {
					if (isOverflowing) {
						textElement.classList.add(styles.hasOverflow);
					} else {
						textElement.classList.remove(styles.hasOverflow);
					}
				}
			}
		};

		// Add a small delay to ensure rendering is complete
		setTimeout(checkOverflow, 50);
	}, [statement?.statement]);

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

	async function handleJoin() {
		// Optimistically update the UI immediately
		setHasJoinedOptimistic(!hasJoinedOptimistic);
		setIsJoinLoading(true);

		try {
			// Call the API function in the background
			await toggleJoining(statement.statementId);
		} catch (error) {
			// If the API call fails, revert the optimistic update
			console.error('Failed to toggle joining:', error);
			setHasJoinedOptimistic(hasJoinedOptimistic); // revert to original state
			// Optionally show an error message to the user here
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

	function handleToggleImageMode() {
		setImageDisplayMode(prev => prev === 'above' ? 'inline' : 'above');
	}

	function handleImageUploadClick() {
		if (fileInputRef.current) {
			fileInputRef.current.click();
		}
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
			<div className={styles.main}>
				{/* Image Above Mode - Display image at the top of card */}
				{image && imageDisplayMode === 'above' && (
					<div className={styles.imageAbove}>
						<UploadImage
							statement={statement}
							fileInputRef={fileInputRef}
							image={image}
							setImage={setImage}
						/>
						{isAuthorized && (
							<button
								className={styles.imageToggleBtn}
								onClick={handleToggleImageMode}
								title={t('Switch to inline mode')}
							>
								⇄
							</button>
						)}
					</div>
				)}
				<div className={styles.info}>
					<div className={styles.text}>
						{/* Image Inline Mode - Display image at start of text */}
						{image && imageDisplayMode === 'inline' && (
							<div className={styles.imageInline} style={{ float: dir === 'ltr' ? 'left' : 'right' }}>
								<UploadImage
									statement={statement}
									fileInputRef={fileInputRef}
									image={image}
									setImage={setImage}
								/>
								{isAuthorized && (
									<button
										className={styles.imageToggleBtn}
										onClick={handleToggleImageMode}
										title={t('Switch to above mode')}
									>
										⇅
									</button>
								)}
							</div>
						)}
						<div className={styles.textContent} ref={textContainerRef}>
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
						<Link to={`/statement/${statement.statementId}`} className={styles.showMore}>
							{t('Show more')}
						</Link>
						<div className="btns btns--end">
							{/* Show Add Image button if no image and user is authorized */}
							{!image && isAuthorized && (
								<button
									onClick={() => setShowImageUpload(true)}
									className="btn btn--small btn--secondary"
								>
									{t('Add Image')}
								</button>
							)}
							{/* Show Remove Image button if image exists and user is authorized */}
							{image && isAuthorized && (
								<button
									onClick={async () => {
										setImage('');
										// Update database to remove image
										await updateStatementMainImage(statement, '');
									}}
									className="btn btn--small btn--cancel"
								>
									{t('Remove Image')}
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
							{enableJoining && (
								<>
									<Joined statement={statement} />
									<button
										onClick={handleJoin}
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
