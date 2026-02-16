import { Dispatch, FC, FormEvent, useState } from 'react';
import React from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '@/redux/store';
import {
	StatementSubscription,
	Role,
	Statement,
	StatementType,
	ParagraphType,
} from '@freedi/shared-types';
import { getParagraphsText, generateParagraphId } from '@/utils/paragraphUtils';
import { setNewStatement } from './../../statementSettingsCont';
import EnhancedAdvancedSettings from './../advancedSettings/EnhancedAdvancedSettings';
import styles from './EnhancedStatementSettingsForm.module.scss';
import {
	FileText,
	Users,
	MessageSquare,
	UserCheck,
	Settings,
	Save,
	X,
	AlertCircle,
	Shield,
	ChevronRight,
	Upload,
	Type,
	AlignLeft,
	Camera,
	BarChart,
	HelpCircle,
} from 'lucide-react';

// Import other components that we'll enhance
import QuestionSettings from '../QuestionSettings/QuestionSettings';
import ChoseBySettings from '../choseBy/ChoseBySettings';
import GetEvaluators from './../../components/GetEvaluators';
import GetVoters from './../../components/GetVoters';
import UserDemographicSetting from '../UserDemographicSettings/UserDemographicSetting';
import MembersSettings from '../membership/MembersSettings';
import MemberValidation from '../memberValidation/MemberValidation';
import MembershipSettings from '../membershipSettings/MembershipSettings';
import MembersManagement from '../membership/MembersManagement';

interface EnhancedStatementSettingsFormProps {
	statement: Statement;
	parentStatement?: Statement | 'top';
	setStatementToEdit: Dispatch<Statement>;
}

interface SettingsSectionProps {
	title: string;
	description?: string;
	icon: React.ElementType;
	children: React.ReactNode;
	priority?: 'essential' | 'important' | 'advanced';
	isCollapsible?: boolean;
	defaultExpanded?: boolean;
}

const SettingsSection: FC<SettingsSectionProps> = ({
	title,
	description,
	icon: Icon,
	children,
	priority = 'important',
	isCollapsible = false,
	defaultExpanded = true,
}) => {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	return (
		<div className={`${styles.settingsSection} ${styles[`settingsSection--${priority}`]}`}>
			<div
				className={`${styles.sectionHeader} ${isCollapsible ? styles['sectionHeader--clickable'] : ''}`}
				onClick={isCollapsible ? () => setIsExpanded(!isExpanded) : undefined}
			>
				<div className={styles.sectionHeaderLeft}>
					<div className={styles.sectionIcon}>
						<Icon size={20} />
					</div>
					<div className={styles.sectionInfo}>
						<h3 className={styles.sectionTitle}>{title}</h3>
						{description && <p className={styles.sectionDescription}>{description}</p>}
					</div>
				</div>
				{isCollapsible && (
					<ChevronRight
						size={20}
						className={`${styles.chevron} ${isExpanded ? styles['chevron--expanded'] : ''}`}
					/>
				)}
			</div>
			{(!isCollapsible || isExpanded) && <div className={styles.sectionContent}>{children}</div>}
		</div>
	);
};

const EnhancedStatementSettingsForm: FC<EnhancedStatementSettingsFormProps> = ({
	statement,
	parentStatement,
	setStatementToEdit,
}) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { statementId } = useParams();
	const [loading, setLoading] = useState<boolean>(false);
	const [unsavedChanges, setUnsavedChanges] = useState<boolean>(false);
	const [image, setImage] = useState<string>(statement.imagesURL?.main ?? '');

	// Title and Description state
	const title = statement?.statement || '';
	const paragraphsText = getParagraphsText(statement?.paragraphs);

	// Selector to get the statement memberships
	const statementMembershipSelector = (statementId: string | undefined) =>
		createSelector(
			(state: RootState) => state.statements.statementMembership,
			(memberships) =>
				memberships.filter(
					(membership: StatementSubscription) => membership.statementId === statementId,
				),
		);

	const members: StatementSubscription[] = useAppSelector(statementMembershipSelector(statementId));

	const joinedMembers = members.filter((member) => member.role !== Role.banned).map((m) => m.user);

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setLoading(true);
		const newStatement = await setNewStatement({
			navigate,
			statementId,
			statement,
			parentStatement,
		});
		setLoading(false);
		if (!newStatement) throw new Error('No new statement');
		setUnsavedChanges(false);
		navigate(`/statement/${newStatement.statementId}`);
	};

	const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newTitle = e.target.value;
		setStatementToEdit({
			...statement,
			statement: newTitle,
		});
		setUnsavedChanges(true);
	};

	const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const newParagraphsText = e.target.value;
		const lines = newParagraphsText.split('\n').filter((line) => line.trim());
		const newParagraphs = lines.map((line, index) => ({
			paragraphId: generateParagraphId(),
			type: ParagraphType.paragraph,
			content: line,
			order: index,
		}));
		setStatementToEdit({
			...statement,
			paragraphs: newParagraphs,
		});
		setUnsavedChanges(true);
	};

	const isNewStatement = !statementId;
	const isQuestion = statement.statementType === StatementType.question;

	const statementSettingsProps = {
		statement,
		setStatementToEdit,
	} as const;

	return (
		<div className={styles.enhancedSettings}>
			{/* Header with Save Status */}
			<div className={styles.header}>
				<div className={styles.headerContent}>
					<h1 className={styles.pageTitle}>
						<Settings size={28} />
						{isNewStatement ? t('Create New Statement') : t('Statement Settings')}
					</h1>
					<p className={styles.pageSubtitle}>
						{isNewStatement
							? t('Set up your new statement or question')
							: t('Configure how your statement works and who can interact with it')}
					</p>
				</div>
				{unsavedChanges && (
					<div className={styles.unsavedIndicator}>
						<AlertCircle size={16} />
						{t('Unsaved changes')}
					</div>
				)}
			</div>

			{/* Progress Indicator for New Statements */}
			{isNewStatement && (
				<div className={styles.progressBar}>
					<div className={styles.progressStep + ' ' + styles['progressStep--active']}>
						<div className={styles.progressStepNumber}>1</div>
						<div className={styles.progressStepLabel}>{t('Basic Info')}</div>
					</div>
					<div className={styles.progressLine}></div>
					<div className={styles.progressStep}>
						<div className={styles.progressStepNumber}>2</div>
						<div className={styles.progressStepLabel}>{t('Settings')}</div>
					</div>
					<div className={styles.progressLine}></div>
					<div className={styles.progressStep}>
						<div className={styles.progressStepNumber}>3</div>
						<div className={styles.progressStepLabel}>{t('Complete')}</div>
					</div>
				</div>
			)}

			<form onSubmit={handleSubmit} className={styles.settingsForm}>
				{/* Basic Information - Always visible */}
				<SettingsSection
					title={t('Basic Information')}
					description={t('Essential details about your statement')}
					icon={FileText}
					priority="essential"
				>
					<div className={styles.formGroup}>
						<label className={styles.label}>
							<Type size={16} />
							{t('Title')}
							<span className={styles.required}>*</span>
						</label>
						<input
							type="text"
							className={styles.input}
							placeholder={t('Enter a clear, descriptive title')}
							value={title}
							onChange={handleTitleChange}
							required
							maxLength={100}
						/>
						<span className={styles.charCount}>{title.length}/100</span>
					</div>

					<div className={styles.formGroup}>
						<label className={styles.label}>
							<AlignLeft size={16} />
							{t('Description')}
						</label>
						<textarea
							className={styles.textarea}
							placeholder={t('Provide context and details about your statement')}
							value={paragraphsText}
							onChange={handleDescriptionChange}
							rows={4}
							maxLength={500}
						/>
						<span className={styles.charCount}>{paragraphsText.length}/500</span>
					</div>

					<div className={styles.formGroup}>
						<label className={styles.label}>
							<Camera size={16} />
							{t('Cover Image')}
						</label>
						<div className={styles.imageUpload}>
							{image ? (
								<div className={styles.imagePreview}>
									<img src={image} alt={t('Cover')} />
									<button type="button" className={styles.removeImage} onClick={() => setImage('')}>
										<X size={16} />
									</button>
								</div>
							) : (
								<div className={styles.uploadPlaceholder}>
									<Upload size={24} />
									<span>{t('Click to upload image')}</span>
								</div>
							)}
						</div>
					</div>
				</SettingsSection>

				{/* Only show additional settings for existing statements */}
				{!isNewStatement && (
					<>
						{/* General Settings */}
						<SettingsSection
							title={t('General Settings')}
							description={t('Core configuration for your statement')}
							icon={Settings}
							priority="essential"
							isCollapsible={true}
							defaultExpanded={true}
						>
							<EnhancedAdvancedSettings {...statementSettingsProps} />
						</SettingsSection>

						{/* Membership & Access */}
						<SettingsSection
							title={t('Membership & Access')}
							description={t('Control who can join and participate')}
							icon={Shield}
							priority="important"
							isCollapsible={true}
							defaultExpanded={false}
						>
							<MembershipSettings statement={statement} setStatementToEdit={setStatementToEdit} />
							<MembersSettings statement={statement} />
						</SettingsSection>

						{/* Members Management */}
						<SettingsSection
							title={t('Members Management')}
							description={t('View and manage current members')}
							icon={Users}
							priority="important"
							isCollapsible={true}
							defaultExpanded={false}
						>
							<MembersManagement statement={statement} />
						</SettingsSection>

						{/* Question-specific settings */}
						{isQuestion && (
							<SettingsSection
								title={t('Question Configuration')}
								description={t('Specific settings for question statements')}
								icon={MessageSquare}
								priority="important"
								isCollapsible={true}
								defaultExpanded={false}
							>
								<ChoseBySettings {...statementSettingsProps} />
								<QuestionSettings {...statementSettingsProps} />
							</SettingsSection>
						)}

						{/* Survey - Available for all statement types */}
						<SettingsSection
							title={t('Survey')}
							description={t('Collect member information')}
							icon={UserCheck}
							priority="important"
							isCollapsible={true}
							defaultExpanded={false}
						>
							<UserDemographicSetting statement={statement} />
						</SettingsSection>

						{/* Member Validation - Only for questions */}
						{isQuestion && (
							<SettingsSection
								title={t('Member Validation')}
								description={t('Validate members before participation')}
								icon={Shield}
								priority="advanced"
								isCollapsible={true}
								defaultExpanded={false}
							>
								<MemberValidation statement={statement} />
							</SettingsSection>
						)}

						{/* Participation Metrics */}
						<SettingsSection
							title={t('Participation Metrics')}
							description={t('Track member engagement and voting')}
							icon={BarChart}
							priority="advanced"
							isCollapsible={true}
							defaultExpanded={false}
						>
							<div className={styles.metricsGrid}>
								<div className={styles.metricCard}>
									<GetVoters statementId={statementId} joinedMembers={joinedMembers} />
								</div>
								<div className={styles.metricCard}>
									<GetEvaluators statementId={statementId} />
								</div>
							</div>
						</SettingsSection>
					</>
				)}

				{/* Action Buttons */}
				<div className={styles.actionBar}>
					<div className={styles.actionBarLeft}>
						{unsavedChanges && (
							<span className={styles.unsavedText}>
								<AlertCircle size={14} />
								{t('You have unsaved changes')}
							</span>
						)}
					</div>
					<div className={styles.actionBarRight}>
						<button type="button" className={styles.btnSecondary} onClick={() => navigate('/home')}>
							<X size={18} />
							{t('Cancel')}
						</button>
						<button type="submit" className={styles.btnPrimary} disabled={loading}>
							{loading ? (
								<>
									<div className={styles.spinner}></div>
									{t('Saving...')}
								</>
							) : (
								<>
									<Save size={18} />
									{isNewStatement ? t('Create Statement') : t('Save Changes')}
								</>
							)}
						</button>
					</div>
				</div>
			</form>

			{/* Help Footer */}
			<div className={styles.helpFooter}>
				<HelpCircle size={16} />
				<span>{t('Need help?')}</span>
				<a href="#" className={styles.helpLink}>
					{t('View documentation')}
				</a>
				<span className={styles.separator}>•</span>
				<a href="#" className={styles.helpLink}>
					{t('Contact support')}
				</a>
			</div>
		</div>
	);
};

export default EnhancedStatementSettingsForm;
