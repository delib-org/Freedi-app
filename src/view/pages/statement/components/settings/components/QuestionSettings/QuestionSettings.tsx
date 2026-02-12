/**
 * NAMING CLARIFICATION:
 * - EvaluationUI (evaluationSettings.evaluationUI) = Evaluation MODE (how users participate: suggestions, voting, checkbox, clustering)
 * - evaluationType (statementSettings.evaluationType) = Rating SCALE (what input UI they see: range/5-point, likeDislike/simple, singleLike/like-only)
 */
import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';
import React, { FC, useState, useRef } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import SectionTitle from '../sectionTitle/SectionTitle';
import styles from './QuestionSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { EvaluationUI, StatementType, evaluationType } from '@freedi/shared-types';
import ConsentIcon from '@/assets/icons/doubleCheckIcon.svg?react';
import SuggestionsIcon from '@/assets/icons/smile.svg?react';
import VotingIcon from '@/assets/icons/votingIcon.svg?react';
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import AnchorIcon from '@/assets/icons/anchor.svg?react';
import UsersIcon from '@/assets/icons/users20px.svg?react';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import LikeIcon from '@/assets/icons/likeIcon.svg?react';
import EvaluationsIcon from '@/assets/icons/evaluationsIcon.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getMassConsensusQuestionUrl } from '@/controllers/db/config';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import RatingScaleButtons from './RatingScaleButtons/RatingScaleButtons';
import { setEvaluationUIType, setAnchoredEvaluationSettings } from '@/controllers/db/evaluation/setEvaluation';
import VotingSettings from './votingSettings/VotingSettings';
import AnchoredBadge from '@/view/components/badges/AnchoredBadge';
import { uploadAnchorIcon, validateImageFile } from '@/controllers/db/storage/uploadHelpers';

const QuestionSettings: FC<StatementSettingsProps> = ({
	statement,
	// setStatementToEdit,
}) => {
	const { t } = useTranslation();
	const [anchoredCount, setAnchoredCount] = useState(
		statement.evaluationSettings?.anchored?.numberOfAnchoredStatements || 3
	);
	const [showCommunityBadges, setShowCommunityBadges] = useState(
		statement.evaluationSettings?.anchored?.differentiateBetweenAnchoredAndNot || false
	);
	const [anchorIcon, setAnchorIcon] = useState(
		statement.evaluationSettings?.anchored?.anchorIcon || ''
	);
	const [anchorDescription, setAnchorDescription] = useState(
		statement.evaluationSettings?.anchored?.anchorDescription || ''
	);
	const [anchorLabel, setAnchorLabel] = useState(
		statement.evaluationSettings?.anchored?.anchorLabel || ''
	);
	const [isLoadingIcon, setIsLoadingIcon] = useState(false);
	const [iconError, setIconError] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<string>('');
	const [linkCopied, setLinkCopied] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const questionLink = getMassConsensusQuestionUrl(statement.statementId);

	const handleCopyLink = async () => {
		try {
			await navigator.clipboard.writeText(questionLink);
			setLinkCopied(true);
			setTimeout(() => setLinkCopied(false), 2000);
		} catch (error) {
			console.error('Failed to copy link:', error);
		}
	};

	const handleOpenLink = () => {
		window.open(questionLink, '_blank');
	};

	try {
		const { questionSettings } = statement;
		if (statement.statementType !== StatementType.question) return null;
		const isVoting = statement.evaluationSettings?.evaluationUI === EvaluationUI.voting;
		const isAnchoredEnabled = statement.evaluationSettings?.anchored?.anchored || false;

		function handleRequireSolutionToggle(enabled: boolean) {
			setStatementSettingToDB({
				statement,
				property: 'askUserForASolutionBeforeEvaluation',
				newValue: enabled,
				settingsSection: 'questionSettings',
			});
		}

		/**
		 * Handle evaluation type change - sets both evaluationSettings.evaluationUI
		 * and statementSettings.evaluationType for main app compatibility
		 */
		function handleEvaluationTypeChange(value: EvaluationUI) {
			// Set the EvaluationUI for MC app and question settings
			setEvaluationUIType(statement.statementId, value);

			// Map EvaluationUI to evaluationType for main app Evaluation component
			let evalType: evaluationType;
			switch (value) {
				case EvaluationUI.voting:
				case EvaluationUI.checkbox:
					evalType = evaluationType.singleLike;
					break;
				case EvaluationUI.suggestions:
				case EvaluationUI.clustering:
				default:
					evalType = evaluationType.range;
					break;
			}

			// Set statementSettings.evaluationType for main app
			setStatementSettingToDB({
				statement,
				property: 'evaluationType',
				newValue: evalType,
				settingsSection: 'statementSettings',
			});

			// Also set enhancedEvaluation for backward compatibility
			setStatementSettingToDB({
				statement,
				property: 'enhancedEvaluation',
				newValue: evalType === evaluationType.range,
				settingsSection: 'statementSettings',
			});
		}

		/**
		 * Handle rating scale change - sets statementSettings.evaluationType
		 * This determines which evaluation UI component is rendered in the main app
		 * (5-point emoji scale, thumbs up/down, or like-only)
		 */
		function handleRatingScaleChange(scale: evaluationType) {
			setStatementSettingToDB({
				statement,
				property: 'evaluationType',
				newValue: scale,
				settingsSection: 'statementSettings',
			});

			// Backward compatibility: enhancedEvaluation = true means 5-point range scale
			setStatementSettingToDB({
				statement,
				property: 'enhancedEvaluation',
				newValue: scale === evaluationType.range,
				settingsSection: 'statementSettings',
			});
		}

		function handleAnchoredToggle(enabled: boolean) {
			setAnchoredEvaluationSettings(statement.statementId, {
				anchored: enabled,
				numberOfAnchoredStatements: anchoredCount,
				differentiateBetweenAnchoredAndNot: showCommunityBadges,
				anchorIcon,
				anchorDescription,
				anchorLabel
			});
		}

		function handleAnchoredCountChange(e: React.ChangeEvent<HTMLInputElement>) {
			const value = Number(e.target.value);
			if (value >= 1 && value <= 10) {
				setAnchoredCount(value);
				if (isAnchoredEnabled) {
					setAnchoredEvaluationSettings(statement.statementId, {
						anchored: true,
						numberOfAnchoredStatements: value,
						differentiateBetweenAnchoredAndNot: showCommunityBadges,
						anchorIcon,
						anchorDescription,
						anchorLabel
					});
				}
			}
		}

		function handleCommunityBadgesToggle(enabled: boolean) {
			setShowCommunityBadges(enabled);
			if (isAnchoredEnabled) {
				setAnchoredEvaluationSettings(statement.statementId, {
					anchored: true,
					numberOfAnchoredStatements: anchoredCount,
					differentiateBetweenAnchoredAndNot: enabled,
					anchorIcon,
					anchorDescription,
					anchorLabel
				});
			}
		}

		function handleClearIcon() {
			setAnchorIcon('');
			setIconError(false);

			if (isAnchoredEnabled) {
				setAnchoredEvaluationSettings(statement.statementId, {
					anchored: true,
					numberOfAnchoredStatements: anchoredCount,
					differentiateBetweenAnchoredAndNot: showCommunityBadges,
					anchorIcon: '',
					anchorDescription,
					anchorLabel
				});
			}
		}

		function handleAnchorDescriptionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
			const value = e.target.value;
			if (value.length <= 100) {
				setAnchorDescription(value);
				if (isAnchoredEnabled) {
					setAnchoredEvaluationSettings(statement.statementId, {
						anchored: true,
						numberOfAnchoredStatements: anchoredCount,
						differentiateBetweenAnchoredAndNot: showCommunityBadges,
						anchorIcon,
						anchorDescription: value,
						anchorLabel
					});
				}
			}
		}

		function handleAnchorLabelChange(e: React.ChangeEvent<HTMLInputElement>) {
			const value = e.target.value;
			if (value.length <= 20) {
				setAnchorLabel(value);
				if (isAnchoredEnabled) {
					setAnchoredEvaluationSettings(statement.statementId, {
						anchored: true,
						numberOfAnchoredStatements: anchoredCount,
						differentiateBetweenAnchoredAndNot: showCommunityBadges,
						anchorIcon,
						anchorDescription,
						anchorLabel: value
					});
				}
			}
		}

		// Drag and drop handlers
		const handleDragEnter = (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(true);
		};

		const handleDragLeave = (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);
		};

		const handleDragOver = (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
		};

		const handleDrop = async (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);

			const files = Array.from(e.dataTransfer.files);
			if (files.length > 0) {
				await handleFileUpload(files[0]);
			}
		};

		const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (files && files.length > 0) {
				await handleFileUpload(files[0]);
			}
		};

		const handleFileUpload = async (file: File) => {
			// Validate file
			const error = validateImageFile(file);
			if (error) {
				setIconError(true);
				setUploadProgress(error);

				return;
			}

			setIsLoadingIcon(true);
			setIconError(false);
			setUploadProgress(t('Resizing image to 32x32px...'));

			try {
				// Upload to Firebase Storage
				setUploadProgress(t('Uploading image...'));
				const result = await uploadAnchorIcon(file, statement.statementId);

				// Update state and database
				setAnchorIcon(result.url);
				setUploadProgress(t('Image uploaded successfully!'));

				if (isAnchoredEnabled) {
					await setAnchoredEvaluationSettings(statement.statementId, {
						anchored: true,
						numberOfAnchoredStatements: anchoredCount,
						differentiateBetweenAnchoredAndNot: showCommunityBadges,
						anchorIcon: result.url,
						anchorDescription,
						anchorLabel
					});
				}

				// Clear progress after success
				setTimeout(() => setUploadProgress(''), 3000);
			} catch (error) {
				console.error('Upload error:', error);
				setIconError(true);
				setUploadProgress(error instanceof Error ? error.message : t('Failed to upload image'));
			} finally {
				setIsLoadingIcon(false);
			}
		};

		return (
			<div className={styles.questionSettings}>
				<SectionTitle title={t('Evaluation Mode')} />
				<MultiSwitch
					options={[
						{ label: t('Agreement'), value: EvaluationUI.suggestions, icon: <SuggestionsIcon />, toolTip: t('Consensus') },
						{ label: t('Voting'), value: EvaluationUI.voting, icon: <VotingIcon />, toolTip: t('Voting') },
						{ label: t('Approval'), value: EvaluationUI.checkbox, icon: <ConsentIcon />, toolTip: t('Consent') },
						{ label: t('Cluster'), value: EvaluationUI.clustering, icon: <ClusterIcon />, toolTip: t('Clustering') },
					]}
					onClick={(value) => { handleEvaluationTypeChange(value as EvaluationUI); }}
					currentValue={statement.evaluationSettings?.evaluationUI}
				/>
				{isVoting && <VotingSettings />}

				<SectionTitle title={t('Rating Scale')} />
				<RatingScaleButtons
					options={[
						{
							label: t('5-Point Scale'),
							value: evaluationType.range,
							icon: <SuggestionsIcon />,
							toolTip: t('5 emoji faces from negative to positive'),
							score: 0
						},
						{
							label: t('Simple Scale'),
							value: evaluationType.likeDislike,
							icon: <EvaluationsIcon />,
							toolTip: t('Thumbs up or down'),
							score: 1
						},
						{
							label: t('Like Only'),
							value: evaluationType.singleLike,
							icon: <LikeIcon />,
							toolTip: t('Only positive feedback'),
							score: 2
						},
						{
							label: t('Community Voice'),
							value: evaluationType.communityVoice,
							icon: <UsersIcon />,
							toolTip: t('Respectful 4-level resonance scale'),
							score: 3
						},
					]}
					onClick={(value) => { handleRatingScaleChange(value as evaluationType); }}
					currentValue={statement.statementSettings?.evaluationType || evaluationType.range}
				/>

				<SectionTitle title={t('Question Settings')} />

				<div className={styles.questionLink}>
					<label>{t('Question Link')}</label>
					<div className={styles.questionLink__container}>
						<input
							type="text"
							value={questionLink}
							readOnly
							className={styles.questionLink__input}
						/>
						<button
							type="button"
							onClick={handleCopyLink}
							className={styles.questionLink__button}
						>
							<ShareIcon />
							<span>{linkCopied ? t('Copied!') : t('Copy')}</span>
						</button>
						<button
							type="button"
							onClick={handleOpenLink}
							className={styles.questionLink__button}
						>
							<span>{t('Open')}</span>
						</button>
					</div>
				</div>

				<SectionTitle title={t('Mass Consensus Settings')} />
				<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
					{t('These settings control the new Mass Consensus app behavior')}
				</p>

				<h3 className='title'>{t('Require original input before viewing others')}</h3>
				<CustomSwitchSmall
					label={t('Request solution at start')}
					checked={questionSettings?.askUserForASolutionBeforeEvaluation || false}
					setChecked={handleRequireSolutionToggle}
					textChecked={t('Request solution at start')}
					textUnchecked={t("Don't ask")}
					imageChecked={<SuggestionsIcon />}
					imageUnchecked={<SuggestionsIcon />}
					colorChecked='var(--question)'
					colorUnchecked='var(--question)'
				/>

				<h3 className='title'>{t('Anchored Sampling')}</h3>
				<p>{t('Anchored sampling allows the admin to insert certain pre-defined options into the evaluation process. These options are prepared in advance and will always appear to participants, no matter what other options are being sampled.')}</p>
				<CustomSwitchSmall
					label={t('Enable Anchored Sampling')}
					checked={isAnchoredEnabled}
					setChecked={handleAnchoredToggle}
					textChecked={t('Anchored')}
					textUnchecked={t('Standard')}
					imageChecked={<AnchorIcon />}
					imageUnchecked={<SuggestionsIcon />}
					colorChecked='var(--question)'
					colorUnchecked='var(--question)'
				/>

				{isAnchoredEnabled && (
					<>
								<div className={styles.anchoredCount}>
									<label>{t('Number of anchored options in evaluation')}</label>
									<input
										type="number"
										min="1"
										max="10"
										value={anchoredCount}
										onChange={handleAnchoredCountChange}
										data-cy="anchored-count-input"
									/>
								</div>
								<CustomSwitchSmall
									label={t('Show Community Recognition')}
									checked={showCommunityBadges}
									setChecked={handleCommunityBadgesToggle}
									textChecked={t('Show Badges')}
									textUnchecked={t('Hide Badges')}
									imageChecked={<UsersIcon />}
									imageUnchecked={<AnchorIcon />}
									colorChecked='var(--question)'
									colorUnchecked='var(--question)'
								/>

								{/* Enhanced Anchor Customization Section */}
								<div className={styles.anchorCustomization}>
									<div className={styles.anchorCustomization__title}>
										<AnchorIcon style={{ width: '18px', height: '18px' }} />
										{t('Customize Anchor Appearance')}
									</div>

									{/* Icon Customization */}
									<div className={`${styles.anchorCustomization__field} ${styles['anchorCustomization__field--icon']}`}>
										<label>{t('Anchor Icon')}</label>

										{/* Drag and Drop Zone */}
										<div
											className={`${styles.dropZone} ${isDragging ? styles['dropZone--active'] : ''} ${anchorIcon ? styles['dropZone--hasImage'] : ''}`}
											onDragEnter={handleDragEnter}
											onDragLeave={handleDragLeave}
											onDragOver={handleDragOver}
											onDrop={handleDrop}
											onClick={() => fileInputRef.current?.click()}
										>
											<input
												ref={fileInputRef}
												type="file"
												accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
												onChange={handleFileSelect}
												style={{ display: 'none' }}
											/>

											{anchorIcon ? (
												<div className={styles.dropZone__preview}>
													<img
														src={anchorIcon}
														alt="Custom anchor icon"
														onError={() => setIconError(true)}
													/>
													<div className={styles.dropZone__overlay}>
														<div style={{ fontSize: '24px', color: 'white' }}>📤</div>
														<span>{t('Click or drag to replace')}</span>
													</div>
												</div>
											) : (
												<div className={styles.dropZone__empty}>
													<div style={{ fontSize: '32px' }}>📤</div>
													<p>{t('Drag & drop image')}</p>
													<p className={styles.dropZone__or}>{t('or')}</p>
													<button type="button" className={styles.dropZone__button}>
														{t('Choose File')}
													</button>
													<p className={styles.dropZone__hint}>
														{t('Image will be resized to 32x32px')}
													</p>
												</div>
											)}

											{isLoadingIcon && (
												<div className={styles.dropZone__loading}>
													<div className={styles.spinner} />
													<p>{uploadProgress}</p>
												</div>
											)}
										</div>

										{/* Status Messages */}
										{uploadProgress && !isLoadingIcon && (
											<div className={`${styles.statusMessage} ${iconError ? styles['statusMessage--error'] : styles['statusMessage--success']}`}>
												{uploadProgress}
											</div>
										)}

										{/* Clear Button */}
										{anchorIcon && (
											<button
												onClick={handleClearIcon}
												className={styles.clearButton}
												type="button"
											>
												{t('Remove Custom Icon')}
											</button>
										)}

										<div className={styles.helperText}>
											{t('Supported formats: PNG, JPG, GIF, SVG, WebP (max 5MB)')}
										</div>
									</div>

									{/* Label Customization */}
									<div className={`${styles.anchorCustomization__field} ${styles['anchorCustomization__field--label']}`}>
										<label>{t('Badge Label')}</label>
										<input
											type="text"
											className={styles.labelInput}
											placeholder={t('Enter badge label (e.g., "Priority", "Essential")')}
											value={anchorLabel}
											onChange={handleAnchorLabelChange}
											maxLength={20}
										/>
										<div className={`${styles.charCount} ${
											anchorLabel.length > 15 ? styles['charCount--warning'] : ''
										} ${
											anchorLabel.length === 20 ? styles['charCount--error'] : ''
										}`}>
											{anchorLabel.length}/20
										</div>
									</div>

									{/* Description Customization */}
									<div className={`${styles.anchorCustomization__field} ${styles['anchorCustomization__field--description']}`}>
										<label>{t('Tooltip Description')}</label>
										<textarea
											className={styles.descriptionInput}
											placeholder={t('Enter custom tooltip text (e.g., "Priority option selected by moderator")')}
											value={anchorDescription}
											onChange={handleAnchorDescriptionChange}
											maxLength={100}
										/>
										<div className={`${styles.charCount} ${
											anchorDescription.length > 90 ? styles['charCount--warning'] : ''
										} ${
											anchorDescription.length === 100 ? styles['charCount--error'] : ''
										}`}>
											{anchorDescription.length}/100
										</div>
									</div>

									{/* Live Preview */}
									<div className={styles.anchorCustomization__preview}>
										<div className={styles.anchorCustomization__previewTitle}>
											{t('Preview')}
										</div>
										<div className={styles.anchorCustomization__previewContent}>
											<AnchoredBadge
												customIcon={anchorIcon}
												customDescription={anchorDescription}
												customLabel={anchorLabel}
											/>
											<span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
												{t('This is how the anchored badge will appear')}
											</span>
										</div>
									</div>
								</div>
					</>
				)}
			</div>
		);
	} catch (error: unknown) {
		console.error(error);

		return <p>{(error as Error).message}</p>;
	}
};

export default QuestionSettings;
