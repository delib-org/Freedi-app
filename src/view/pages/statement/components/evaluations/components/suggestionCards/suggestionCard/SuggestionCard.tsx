import React, { FC, useEffect, useRef, useState } from 'react';
import { logError } from '@/utils/errorHandling';

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
import JoinButtons from '@/view/pages/statement/components/joining/JoinButtons';
import Joined from '@/view/components/joined/Joined';
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
	if (!parentStatement)
		logError(new Error('parentStatement is not defined'), {
			operation: 'suggestionCard.SuggestionCard.unknown',
		});

	const { t, dir } = useTranslation();
	// Use parent's authorization instead of individual card authorization
	const { isAuthorized, isAdmin } = useAuthorization(parentStatement?.statementId);
	const enableJoining = parentStatement?.statementSettings?.joiningEnabled;
	const minJoinMembers = parentStatement?.statementSettings?.minJoinMembers;
	const maxJoinMembers = parentStatement?.statementSettings?.maxJoinMembers;
	const showEvaluation = parentStatement?.statementSettings?.showEvaluation;
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

	// Join count/status indicators apply to activists only (min/max on joined[]).
	const joinedCount = statement?.joined?.length ?? 0;
	const isBelowMinimum =
		enableJoining && minJoinMembers !== undefined && joinedCount < minJoinMembers;
	const isAboveMinimum =
		enableJoining && minJoinMembers !== undefined && joinedCount >= minJoinMembers;
	// Note: exceeding max is handled by admin splitting into rooms, not by blocking joining
	const exceedsMaximum =
		enableJoining && maxJoinMembers !== undefined && joinedCount > maxJoinMembers;

	// Use States
	const [isEdit, setIsEdit] = useState(false);
	const [shouldShowAddSubQuestionModal, setShouldShowAddSubQuestionModal] = useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);

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
			logError(error, { operation: 'suggestionCard.SuggestionCard.handleSetOption' });
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
								onSaveSuccess={() => setIsEdit(false)}
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
							{enableJoining && (
								<>
									<Joined statement={statement} />
									{/* Room Badge - shows user's assigned room for this option */}
									<RoomBadge statementId={statement.statementId} />
									{/* Join count indicator — activists only */}
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
									<JoinButtons statement={statement} parentStatement={parentStatement} />
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
