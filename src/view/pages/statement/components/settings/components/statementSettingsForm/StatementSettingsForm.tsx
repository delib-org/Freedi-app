import { Dispatch, FC, FormEvent, useState } from 'react';
import { logError } from '@/utils/errorHandling';

// Third party imports
import { useNavigate, useParams } from 'react-router';
import { Pencil, Users, BarChart3, Brain, Shield, Settings } from 'lucide-react';

// Custom components
import InstantSettings from '../instantSettings/InstantSettings';
import QuestionSettings from '../QuestionSettings/QuestionSettings';
import ChoseBySettings from '../choseBy/ChoseBySettings';
import GetEvaluators from './../../components/GetEvaluators';
import GetVoters from './../../components/GetVoters';
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
import ConfidenceIndexSettings from '../QuestionSettings/ConfidenceIndexSettings';
import JoinFormSettings from '../QuestionSettings/JoinFormSettings/JoinFormSettings';
import JoinResolutionSettings from '../QuestionSettings/JoinResolutionSettings/JoinResolutionSettings';
import DeadlineSettings from '../QuestionSettings/DeadlineSettings';

// Hooks & Helpers
import styles from './StatementSettingsForm.module.scss';
import { useStatementSettingsHandlers } from '../../useStatementSettingsHandlers';
import { defaultStatementSettings } from '../../emptyStatementModel';

// Redux & Types
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useSelector } from 'react-redux';
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '@/redux/store';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { createStatementsByParentSelector } from '@/redux/utils/selectorFactories';
import Loader from '@/view/components/loaders/Loader';
import {
	StatementSubscription,
	Role,
	Statement,
	StatementSettings,
	StatementType,
} from '@freedi/shared-types';
import MembershipSettings from '../membershipSettings/MembershipSettings';
import UserDemographicSetting from '../UserDemographicSettings/UserDemographicSetting';
import MembersSettings from '../membership/MembersSettings';
import AdminsManagement from '../membership/AdminsManagement/AdminsManagement';
import MemberValidation from '../memberValidation/MemberValidation';
import EmailNotifications from '../emailNotifications/EmailNotifications';
import { OptionRooms } from '../optionRooms';
import ModerationLog from '../moderationLog/ModerationLog';

interface StatementSettingsFormProps {
	statement: Statement;
	parentStatement?: Statement | 'top';
	setStatementToEdit: Dispatch<Statement>;
}

const StatementSettingsForm: FC<StatementSettingsFormProps> = ({
	statement,
	parentStatement,
	setStatementToEdit,
}) => {
	const imageUrl = statement.imagesURL?.main ?? '';

	// * Hooks * //
	const navigate = useNavigate();
	const { statementId } = useParams();
	const { t } = useTranslation();

	const [image, setImage] = useState<string>(imageUrl);
	const [loading, setLoading] = useState<boolean>(false);

	// Prefer the live Redux statement for instant-save groups so toggles
	// reflect Firestore writes as soon as the listener fires.
	const liveStatement = useAppSelector(statementSelector(statement.statementId));
	const settingsStatement = liveStatement ?? statement;
	const settings: StatementSettings =
		settingsStatement.statementSettings ?? defaultStatementSettings;
	const handlers = useStatementSettingsHandlers(settingsStatement);

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
	const currentUserSubscription = useAppSelector(statementSubscriptionSelector(statementId));
	const isAdminOrCreator =
		currentUserSubscription?.role === Role.admin || currentUserSubscription?.role === Role.creator;

	const selectSubStatements = createStatementsByParentSelector(
		(state: RootState) => state.statements.statements,
	);
	const subStatements = useSelector(selectSubStatements(statement.statementId));

	try {
		const joinedMembers = members
			.filter((member) => member.role !== Role.banned)
			.map((m) => m.user);

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
			navigate(`/statement/${newStatement.statementId}`);
		};

		const isNewStatement = !statementId;
		const isQuestion = settingsStatement.statementType === StatementType.question;

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
				{!isNewStatement && <InstantSettings statement={settingsStatement} />}

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
							<ParticipationSettings
								statement={settingsStatement}
								settings={settings}
								handleSettingChange={handlers.handleSettingChange}
							/>
							{isQuestion && (
								<>
									<JoinFormSettings statement={settingsStatement} />
									<JoinResolutionSettings statement={settingsStatement} />
								</>
							)}
						</SettingsSection>

						{/* Breakout rooms — renders its own section */}
						<OptionRooms statement={settingsStatement} />

						{/* Group 3 — Results & Decision */}
						<SettingsSection
							title={t('Results & Decision')}
							description={t('How results are shown and how the winner is chosen')}
							icon={BarChart3}
							priority="high"
							defaultExpanded={false}
						>
							{isQuestion && <ChoseBySettings {...statementSettingsProps} />}
							{isQuestion && <DeadlineSettings statement={settingsStatement} />}
							<EvaluationSettings
								statement={settingsStatement}
								settings={settings}
								handleSettingChange={handlers.handleSettingChange}
							/>
							{isQuestion && (
								<>
									<AnchoredSettings statement={settingsStatement} />
									<ConfidenceIndexSettings statement={settingsStatement} />
								</>
							)}
						</SettingsSection>

						{/* Group 4 — AI & Smart Features */}
						<SettingsSection
							title={t('AI & Smart Features')}
							description={t('Optional AI help. Everything here is off unless you turn it on')}
							icon={Brain}
							priority="medium"
							defaultExpanded={false}
						>
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
						</SettingsSection>

						{/* Group 5 — Members & Access */}
						<SettingsSection
							title={t('Members & Access')}
							description={t('Who can see this question and who runs it')}
							icon={Shield}
							priority="high"
							defaultExpanded={false}
						>
							<MembershipSettings
								statement={settingsStatement}
								setStatementToEdit={setStatementToEdit}
							/>
							<MembersSettings statement={settingsStatement} />
							{isAdminOrCreator && <AdminsManagement statement={settingsStatement} />}
							{isQuestion && <MemberValidation statement={settingsStatement} />}
							<UserDemographicSetting statement={settingsStatement} />
						</SettingsSection>

						{/* Group 6 — Data & Advanced */}
						<SettingsSection
							title={t('Data & Advanced')}
							description={t('Exports, notifications, language, and rarely-changed setup')}
							icon={Settings}
							priority="low"
							defaultExpanded={false}
						>
							<QuestionSettings {...statementSettingsProps} />
							<VisibilitySettings
								statement={settingsStatement}
								settings={settings}
								handleHideChange={handlers.handleHideChange}
								handleSettingChange={handlers.handleSettingChange}
								handlePowerFollowMeChange={handlers.handlePowerFollowMeChange}
								handleIsDocumentChange={handlers.handleIsDocumentChange}
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
							<ExportSettings statement={settingsStatement} subStatements={subStatements} />
							<section className={styles.getMembersArea}>
								<GetVoters statementId={statementId} joinedMembers={joinedMembers} />
							</section>
							<section className={styles.getMembersArea}>
								<GetEvaluators statementId={statementId} />
							</section>
						</SettingsSection>
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
