import { Dispatch, FC, FormEvent, useState } from 'react';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { isAdvancedGroupVisible } from '../../settingsVisibility';
import { SettingsVariant } from '../../settingsTypeHelpers';
import { logError } from '@/utils/errorHandling';

// Third party imports
import { useNavigate, useParams } from 'react-router';
import { Pencil, Users, BarChart3, Brain, Shield, Settings } from 'lucide-react';

// Custom components
import InstantSettings from '../instantSettings/InstantSettings';
import QuestionSettings from '../QuestionSettings/QuestionSettings';
import ChoseBySettings from '../choseBy/ChoseBySettings';
import TitleAndDescription from './../../components/titleAndDescription/TitleAndDescription';
import { SettingsSection } from './../../components/settingsSection';
import { setNewStatement } from './../../statementSettingsCont';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import UploadImage from '@/view/components/uploadImage/UploadImage';

// Settings sub-components (former "General Settings" categories, now flat)
import VisibilitySettings from '../advancedSettings/VisibilitySettings';
import ParticipationSettings from '../advancedSettings/ParticipationSettings';
import EvaluationSettings from '../advancedSettings/EvaluationSettings';
import AISettings from '../advancedSettings/AISettings';
import DiscussionSettings from '../advancedSettings/DiscussionSettings';
import NavigationSettings from '../advancedSettings/NavigationSettings';
import LocalizationSettings from '../advancedSettings/LocalizationSettings';
import ExportSettings from '../advancedSettings/ExportSettings';
import SynthesisPanel from '../synthesisPanel/SynthesisPanel';
import AnchoredSettings from '../QuestionSettings/AnchoredSettings';
import JoinFormSettings from '../QuestionSettings/JoinFormSettings/JoinFormSettings';
import JoinResolutionSettings from '../QuestionSettings/JoinResolutionSettings/JoinResolutionSettings';
import DeadlineSettings from '../QuestionSettings/DeadlineSettings';

// Hooks & Helpers
import styles from './StatementSettingsForm.module.scss';
import advStyles from '../advancedSettings/EnhancedAdvancedSettings.module.scss';
import { useStatementSettingsHandlers } from '../../useStatementSettingsHandlers';
import { defaultStatementSettings } from '../../emptyStatementModel';

// Redux & Types
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { createStatementsByParentSelector } from '@/redux/utils/selectorFactories';
import Loader from '@/view/components/loaders/Loader';
import { Role, Statement, StatementSettings, StatementType } from '@freedi/shared-types';
import EmailNotifications from '../emailNotifications/EmailNotifications';
import ModerationLog from '../moderationLog/ModerationLog';
import PeopleSection from '../../../host/PeopleSection';
import { buildStatementPath } from '@/routes/statementPaths';

interface StatementSettingsFormProps {
	statement: Statement;
	parentStatement?: Statement | 'top';
	setStatementToEdit: Dispatch<Statement>;
	/**
	 * 'legacy': the whole settings page (hero toggles, People, exports here).
	 * 'hub': composed inside the Host hub, which owns Live now, People, Results
	 * exports, AI, Clustering and Insights — so this form omits them.
	 */
	variant?: SettingsVariant;
}

/**
 * Which settings components each variant composes. Read by the
 * duplicate-control guard test together with the keys each file writes, so
 * adding a toggle that already exists elsewhere on the same page fails CI.
 * `omit` lists keys a component only renders under a prop the variant does
 * not pass. The hub list also names the AI group's components, which the
 * hub renders in its own AI and Clustering cards — same page, same guard.
 * 'PeopleSection' stands for PEOPLE_SECTION_COMPONENTS: both pages render the
 * same People section.
 */
export const FORM_COMPOSITION: Record<
	SettingsVariant,
	Array<{ component: string; omit?: string[] }>
> = {
	legacy: [
		{ component: 'InstantSettings' },
		{ component: 'ParticipationSettings', omit: ['hasChat'] },
		{ component: 'ChoseBySettings' },
		{ component: 'DeadlineSettings' },
		{ component: 'EvaluationSettings' },
		{ component: 'AnchoredSettings' },
		{ component: 'AISettings' },
		{ component: 'SynthesisPanel' },
		{ component: 'DiscussionSettings' },
		{ component: 'ModerationLog' },
		{ component: 'PeopleSection' },
		{ component: 'QuestionSettings' },
		{ component: 'VisibilitySettings' },
		{ component: 'NavigationSettings' },
		{ component: 'LocalizationSettings' },
		{ component: 'EmailNotifications' },
		{ component: 'ExportSettings' },
	],
	hub: [
		{ component: 'InstantSettings' },
		{ component: 'ParticipationSettings' },
		{ component: 'ChoseBySettings' },
		{ component: 'EvaluationSettings' },
		{ component: 'AnchoredSettings' },
		{ component: 'AISettings' },
		{ component: 'SynthesisPanel' },
		{ component: 'DiscussionSettings' },
		{ component: 'ModerationLog' },
		{ component: 'PeopleSection' },
		{ component: 'QuestionSettings' },
		{ component: 'VisibilitySettings', omit: ['powerFollowMe'] },
		{ component: 'NavigationSettings' },
		{ component: 'LocalizationSettings' },
		{ component: 'EmailNotifications' },
	],
};

// The shared settings SCSS module nests everything under .enhancedSettings;
// flat groups keep that context via this wrapper (flatGroup drops the old
// page-shell padding/width).
const groupWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

const StatementSettingsForm: FC<StatementSettingsFormProps> = ({
	statement,
	parentStatement,
	setStatementToEdit,
	variant = 'legacy',
}) => {
	const imageUrl = statement.imagesURL?.main ?? '';
	const isHub = variant === 'hub';

	// * Hooks * //
	const navigate = useNavigate();
	const { statementId } = useParams();
	const { t } = useTranslation();

	const [image, setImage] = useState<string>(imageUrl);
	const [loading, setLoading] = useState<boolean>(false);
	const [advancedRevealed, setAdvancedRevealed] = useState(false);
	const creator = useAppSelector(creatorSelector);

	// Prefer the live Redux statement for instant-save groups so toggles
	// reflect Firestore writes as soon as the listener fires.
	const liveStatement = useAppSelector(statementSelector(statement.statementId));
	const settingsStatement = liveStatement ?? statement;
	const settings: StatementSettings =
		settingsStatement.statementSettings ?? defaultStatementSettings;
	const handlers = useStatementSettingsHandlers(settingsStatement);

	const currentUserSubscription = useAppSelector(statementSubscriptionSelector(statementId));
	const isAdminOrCreator =
		currentUserSubscription?.role === Role.admin || currentUserSubscription?.role === Role.creator;

	const selectSubStatements = createStatementsByParentSelector(
		(state: RootState) => state.statements.statements,
	);
	const subStatements = useSelector(selectSubStatements(statement.statementId));

	try {
		// * Functions * //
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
			// Navigate to the statement page after saving
			navigate(buildStatementPath({ statementId: newStatement.statementId }));
		};

		const isNewStatement = !statementId;
		const isQuestion = settingsStatement.statementType === StatementType.question;
		const showAdvanced =
			advancedRevealed ||
			isAdvancedGroupVisible({ statement: settingsStatement, advanceUser: creator?.advanceUser });

		const statementSettingsProps = {
			statement: settingsStatement,
			setStatementToEdit,
		} as const;

		if (loading)
			return (
				<div className={styles.statementSettingsForm}>
					<div className={styles.loaderBox}>
						<Loader />
					</div>
				</div>
			);

		return (
			<div className="wrapper">
				{/* ⚡ Instant Settings — always visible, single source of truth for
				    participation mode, rating scale, and high-frequency toggles */}
				{!isNewStatement && <InstantSettings statement={settingsStatement} variant={variant} />}

				{/* Group 1 — Question & Description (the only part that needs Save) */}
				<form
					onSubmit={handleSubmit}
					className={styles.statementSettingsForm}
					data-cy="statement-settings-form"
				>
					{isNewStatement ? (
						<>
							<TitleAndDescription statement={statement} setStatementToEdit={setStatementToEdit} />
							<UploadImage statement={statement} image={image} setImage={setImage} />
							<button
								type="submit"
								className="btn btn--primary"
								aria-label="Submit button"
								data-cy="settings-statement-submit-btn"
							>
								{t('Save')}
							</button>
						</>
					) : (
						<SettingsSection
							title={t('Question & Description')}
							description={t('The question text and image everyone sees')}
							icon={Pencil}
							priority="high"
							defaultExpanded={true}
						>
							<TitleAndDescription statement={statement} setStatementToEdit={setStatementToEdit} />
							<UploadImage statement={statement} image={image} setImage={setImage} />
							<div className={styles.saveArea}>
								<p className={styles.saveCaption}>
									{t(
										'Only the question text and image need saving — everything else on this page saves automatically',
									)}
								</p>
								<button
									type="submit"
									className="btn btn--primary"
									aria-label="Submit button"
									data-cy="settings-statement-submit-btn"
								>
									{t('Save')}
								</button>
							</div>
						</SettingsSection>
					)}
				</form>

				{!isNewStatement && (
					<>
						{/* Group 2 — Participation Rules */}
						<SettingsSection
							title={t('Participation Rules')}
							description={t('What participants are allowed to do')}
							icon={Users}
							priority="high"
							defaultExpanded={false}
						>
							<div className={groupWrapClass}>
								<ParticipationSettings
									statement={settingsStatement}
									settings={settings}
									handleSettingChange={handlers.handleSettingChange}
									showChatToggle={isHub}
								/>
								{isQuestion && (
									<>
										<JoinFormSettings statement={settingsStatement} />
										<JoinResolutionSettings statement={settingsStatement} />
									</>
								)}
							</div>
						</SettingsSection>

						{/* Group 3 — Results & Decision */}
						<SettingsSection
							title={t('Results & Decision')}
							description={t('How results are shown and how the winner is chosen')}
							icon={BarChart3}
							priority="high"
							defaultExpanded={false}
						>
							<div className={groupWrapClass}>
								{isQuestion && <ChoseBySettings {...statementSettingsProps} />}
								{isQuestion && !isHub && <DeadlineSettings statement={settingsStatement} />}
								<EvaluationSettings
									statement={settingsStatement}
									settings={settings}
									handleSettingChange={handlers.handleSettingChange}
								/>
								{isQuestion && <AnchoredSettings statement={settingsStatement} />}
							</div>
						</SettingsSection>

						{/* Group 4 — AI & Smart Features (the hub has its own AI and Clustering sections) */}
						{!isHub && (
							<SettingsSection
								title={t('AI & Smart Features')}
								description={t('Optional AI help. Everything here is off unless you turn it on')}
								icon={Brain}
								priority="medium"
								defaultExpanded={false}
							>
								<div className={groupWrapClass}>
									<AISettings
										statement={settingsStatement}
										settings={settings}
										handleSettingChange={handlers.handleSettingChange}
									/>
									{isQuestion && <SynthesisPanel statement={settingsStatement} />}
									<DiscussionSettings
										statement={settingsStatement}
										settings={settings}
										handleSettingChange={handlers.handleSettingChange}
									/>
									{isAdminOrCreator && <ModerationLog statement={settingsStatement} />}
								</div>
							</SettingsSection>
						)}

						{/* Group 5 — People (the hub has its own People section) */}
						{!isHub && (
							<SettingsSection
								title={t('host.people')}
								description={t('Who can see this question and who runs it')}
								icon={Shield}
								priority="high"
								defaultExpanded={false}
							>
								{/* The same People section the Host hub renders (one Members list). */}
								<PeopleSection
									statement={settingsStatement}
									setStatementToEdit={setStatementToEdit}
								/>
							</SettingsSection>
						)}

						{/* Group 6 — Data & Advanced: folded away unless the user wants
						    advanced tools or already customised something in it. */}
						{!showAdvanced && (
							<button
								type="button"
								className={styles.revealAdvanced}
								onClick={() => setAdvancedRevealed(true)}
								data-testid="reveal-advanced"
							>
								{t('host.showAdvanced')}
							</button>
						)}
						{showAdvanced && (
							<SettingsSection
								title={t('Data & Advanced')}
								description={t('Exports, notifications, language, and rarely-changed setup')}
								icon={Settings}
								priority="low"
								defaultExpanded={false}
							>
								<div className={groupWrapClass}>
									<QuestionSettings {...statementSettingsProps} />
									<VisibilitySettings
										statement={settingsStatement}
										settings={settings}
										handleHideChange={handlers.handleHideChange}
										handleSettingChange={handlers.handleSettingChange}
										handlePowerFollowMeChange={handlers.handlePowerFollowMeChange}
										handleIsDocumentChange={handlers.handleIsDocumentChange}
										showPresenterMode={!isHub}
									/>
									<NavigationSettings
										statement={settingsStatement}
										settings={settings}
										handleSettingChange={handlers.handleSettingChange}
									/>
									<LocalizationSettings
										statement={settingsStatement}
										handleDefaultLanguageChange={handlers.handleDefaultLanguageChange}
										handleForceLanguageChange={handlers.handleForceLanguageChange}
									/>
									<EmailNotifications statement={settingsStatement} />
									{!isHub && (
										<>
											<ExportSettings statement={settingsStatement} subStatements={subStatements} />
										</>
									)}
								</div>
							</SettingsSection>
						)}
					</>
				)}
			</div>
		);
	} catch (error) {
		logError(error, { operation: 'statementSettingsForm.StatementSettingsForm.unknown' });

		return null;
	}
};

export default StatementSettingsForm;
