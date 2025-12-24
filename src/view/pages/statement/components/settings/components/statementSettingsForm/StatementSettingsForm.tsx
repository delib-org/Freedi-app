import { Dispatch, FC, FormEvent, useState } from 'react';

// Third party imports
import { useNavigate, useParams } from 'react-router';

// Firestore functions

// Custom components
import QuestionSettings from '../QuestionSettings/QuestionSettings';
import EnhancedAdvancedSettings from './../../components/advancedSettings/EnhancedAdvancedSettings';
import ChoseBySettings from '../choseBy/ChoseBySettings';
import GetEvaluators from './../../components/GetEvaluators';
import GetVoters from './../../components/GetVoters';
import SectionTitle from './../../components/sectionTitle/SectionTitle';
import TitleAndDescription from './../../components/titleAndDescription/TitleAndDescription';
import { setNewStatement } from './../../statementSettingsCont';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import UploadImage from '@/view/components/uploadImage/UploadImage';

// Hooks & Helpers
import styles from './StatementSettingsForm.module.scss';

// icons
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
					(membership: StatementSubscription) =>
						membership.statementId === statementId
				)
		);

	const members: StatementSubscription[] = useAppSelector(
		statementMembershipSelector(statementId)
	);

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
					data-cy='statement-settings-form'
				>
					<TitleAndDescription
						statement={statement}
						setStatementToEdit={setStatementToEdit}
					/>
					<UploadImage
							statement={statementSettingsProps.statement}
							image={image}
							setImage={setImage}
						/>
					{!isNewStatement && (
						<>
							<SectionTitle title={t('General Settings')} />
							<section className={styles.switchesArea}>
								<EnhancedAdvancedSettings {...statementSettingsProps} />
							</section>
						</>
					)}
					<button
						type='submit'
						className={`${!isNewStatement && styles.submitButton} btn btn--primary`}
						aria-label='Submit button'
						data-cy='settings-statement-submit-btn'
					>
						{t('Save')}
					</button>
				</form>
				{!isNewStatement && (
					<>
						<MembershipSettings statement={statement} setStatementToEdit={setStatementToEdit} />
						<MembersSettings statement={statement} />
						{statement.statementType === StatementType.question && <ChoseBySettings {...statementSettingsProps} />}
						<QuestionSettings {...statementSettingsProps} />
						<UserDemographicSetting statement={statement} />
						{isQuestion && <MemberValidation statement={statement} />}
						<EmailNotifications statement={statement} />
						{isQuestion && (
							<>
								<SectionTitle title={t('Clustering & Framings')} />
								<ClusteringAdmin statement={statement} />
							</>
						)}
						<SectionTitle title={t('Members')} />
						<section className={styles.getMembersArea}>
							<GetVoters
								statementId={statementId}
								joinedMembers={joinedMembers}
							/>
						</section>
						<section className={styles.getMembersArea}>
							<GetEvaluators statementId={statementId} />
						</section>
					</>
				)}
			</div>

		);
	} catch (error) {
		console.error(error);

		return null;
	}
};

export default StatementSettingsForm;
