import { Dispatch, FC, FormEvent, useState } from 'react';
import { logError } from '@/utils/errorHandling';

// Third party imports
import { useNavigate, useParams } from 'react-router';
import {
	Settings,
	Users,
	Vote,
	HelpCircle,
	UserCheck,
	Shield,
	Bell,
	Network,
	BarChart3,
} from 'lucide-react';

// Custom components
import QuestionSettings from '../QuestionSettings/QuestionSettings';
import EnhancedAdvancedSettings from './../../components/advancedSettings/EnhancedAdvancedSettings';
import ChoseBySettings from '../choseBy/ChoseBySettings';
import GetEvaluators from './../../components/GetEvaluators';
import GetVoters from './../../components/GetVoters';
import TitleAndDescription from './../../components/titleAndDescription/TitleAndDescription';
import { SettingsSection } from './../../components/settingsSection';
import { setNewStatement } from './../../statementSettingsCont';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import UploadImage from '@/view/components/uploadImage/UploadImage';

// Hooks & Helpers
import styles from './StatementSettingsForm.module.scss';

// Redux & Types
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '@/redux/store';
import Loader from '@/view/components/loaders/Loader';
import { StatementSubscription, Role, Statement, StatementType } from '@freedi/shared-types';
import MembershipSettings from '../membershipSettings/MembershipSettings';
import UserDemographicSetting from '../UserDemographicSettings/UserDemographicSetting';
import MembersSettings from '../membership/MembersSettings';
import MemberValidation from '../memberValidation/MemberValidation';
import EmailNotifications from '../emailNotifications/EmailNotifications';
import { ClusteringAdmin } from '../ClusteringAdmin';
import { OptionRooms } from '../optionRooms';

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
		const isQuestion = statement.statementType === StatementType.question;

		const statementSettingsProps = {
			statement,
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
				<form
					onSubmit={handleSubmit}
					className={styles.statementSettingsForm}
					data-cy="statement-settings-form"
				>
					<TitleAndDescription statement={statement} setStatementToEdit={setStatementToEdit} />
					<UploadImage
						statement={statementSettingsProps.statement}
						image={image}
						setImage={setImage}
					/>
					{!isNewStatement && (
						<SettingsSection
							title={t('General Settings')}
							description={t('Configure the behavior and appearance of your discussion')}
							icon={Settings}
							priority="high"
							defaultExpanded={true}
							tooltip={t('These settings control how participants interact with your discussion')}
						>
							<section className={styles.switchesArea}>
								<EnhancedAdvancedSettings {...statementSettingsProps} />
							</section>
						</SettingsSection>
					)}
					<button
						type="submit"
						className={`${!isNewStatement && styles.submitButton} btn btn--primary`}
						aria-label="Submit button"
						data-cy="settings-statement-submit-btn"
					>
						{t('Save')}
					</button>
				</form>
				{!isNewStatement && (
					<>
						{/* Membership & Access Section */}
						<SettingsSection
							title={t('Membership & Access')}
							description={t('Control who can access and participate in this discussion')}
							icon={Users}
							priority="high"
							defaultExpanded={false}
							tooltip={t('Manage membership types and access permissions')}
						>
							<MembershipSettings statement={statement} setStatementToEdit={setStatementToEdit} />
							<MembersSettings statement={statement} />
						</SettingsSection>

						{/* Decision Making Section - only for questions */}
						{statement.statementType === StatementType.question && (
							<SettingsSection
								title={t('Decision Making')}
								description={t('Configure how decisions are made')}
								icon={Vote}
								priority="medium"
								defaultExpanded={false}
								tooltip={t('Set up voting and selection methods')}
							>
								<ChoseBySettings {...statementSettingsProps} />
							</SettingsSection>
						)}

						{/* Question Structure Section */}
						<SettingsSection
							title={t('Question Structure')}
							description={t('Configure question types and sub-questions')}
							icon={HelpCircle}
							priority="medium"
							defaultExpanded={false}
							tooltip={t('Organize your discussion structure')}
						>
							<QuestionSettings {...statementSettingsProps} />
						</SettingsSection>

						{/* User Demographics Section */}
						<SettingsSection
							title={t('User Demographics')}
							description={t('Collect demographic information from participants')}
							icon={UserCheck}
							priority="low"
							defaultExpanded={false}
							tooltip={t('Gather optional demographic data for analysis')}
						>
							<UserDemographicSetting statement={statement} />
						</SettingsSection>

						{/* Option Rooms Section - for grouping participants */}
						<OptionRooms statement={statement} />

						{/* Validation Section - only for questions */}
						{isQuestion && (
							<SettingsSection
								title={t('Member Validation')}
								description={t('Verify participant eligibility')}
								icon={Shield}
								priority="low"
								defaultExpanded={false}
								tooltip={t('Set up validation rules for participants')}
							>
								<MemberValidation statement={statement} />
							</SettingsSection>
						)}

						{/* Notifications Section */}
						<SettingsSection
							title={t('Email Notifications')}
							description={t('Configure email alerts and notifications')}
							icon={Bell}
							priority="low"
							defaultExpanded={false}
							tooltip={t('Set up email notifications for participants')}
						>
							<EmailNotifications statement={statement} />
						</SettingsSection>

						{/* Clustering & Analysis - only for questions */}
						{isQuestion && (
							<SettingsSection
								title={t('Clustering & Framings')}
								description={t('AI-powered grouping and analysis of responses')}
								icon={Network}
								priority="low"
								defaultExpanded={false}
								tooltip={t('Use AI to cluster similar responses and identify patterns')}
							>
								<ClusteringAdmin statement={statement} />
							</SettingsSection>
						)}

						{/* Participants Data Section */}
						<SettingsSection
							title={t('Participants Data')}
							description={t('View and export participant information')}
							icon={BarChart3}
							priority="low"
							defaultExpanded={false}
							tooltip={t('Access voter and evaluator data')}
						>
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
