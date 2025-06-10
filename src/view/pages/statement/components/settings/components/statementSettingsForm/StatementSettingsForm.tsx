import { Dispatch, FC, FormEvent, useState } from 'react';

// Third party imports
import { useNavigate, useParams } from 'react-router';

// Firestore functions
import { setNewStatement } from './../../statementSettingsCont';

// Custom components
import QuestionSettings from '../QuestionSettings/QuestionSettings';
import AdvancedSettings from './../../components/advancedSettings/AdvancedSettings';
import ChoseBySettings from '../choseBy/ChoseBySettings';
import GetEvaluators from './../../components/GetEvaluators';
import GetVoters from './../../components/GetVoters';
import SectionTitle from './../../components/sectionTitle/SectionTitle';
import TitleAndDescription from './../../components/titleAndDescription/TitleAndDescription';
import UploadImage from '@/view/components/uploadImage/UploadImage';
import MembershipSettings from '../membershipSettings/MembershipSettings';

// Hooks & Helpers
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useProfanityCheck } from '@/controllers/hooks/useProfanityCheck';
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '@/redux/store';
import './StatementSettingsForm.scss';

// Types
import { StatementSubscription, Role, Statement, StatementType } from 'delib-npm';

// Components
import Loader from '@/view/components/loaders/Loader';

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
	const { t } = useUserConfig();
	const { validateText, isChecking, error } = useProfanityCheck(); // ✅ Profanity hook

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

		const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			setLoading(true);

			// ✅ Profanity check on title + description
			const fullText = `${statement.statement ?? ''}\n${statement.description ?? ''}`;
			const isClean = await validateText(fullText);
			if (!isClean) {
				setLoading(false);

				return;
			}

			if (!statement?.statement?.trim()) {
				setLoading(false);
				throw new Error('No new statement');
			}

			const newStatement = await setNewStatement({
				navigate,
				statementId,
				statement,
				parentStatement,
			});

			setLoading(false);

			if (!newStatement) throw new Error('No new statement');
			navigate(`/statement/${newStatement.statementId}`);
		};

		const isNewStatement = !statementId;
		const statementSettingsProps = { statement, setStatementToEdit } as const;

		if (loading || isChecking)
			return (
				<div className='statement-settings-form'>
					<div className='loader-box'>
						<Loader />
					</div>
				</div>
			);

		return (
			<div className='wrapper'>
				<form
					onSubmit={handleSubmit}
					className='statement-settings-form'
					data-cy='statement-settings-form'
				>
					<TitleAndDescription
						statement={statement}
						setStatementToEdit={setStatementToEdit}
					/>

					{/* ✅ Show profanity error */}
					{error && (
						<p style={{ color: 'red', fontSize: '0.9rem', marginTop: '0.5rem' }}>
							{error}
						</p>
					)}

					<SectionTitle title={t('General Settings')} />
					<section className='switches-area'>
						<AdvancedSettings {...statementSettingsProps} />
					</section>

					<button
						type='submit'
						className='submit-button btn'
						aria-label='Submit button'
						data-cy='settings-statement-submit-btn'
					>
						{t('Save')}
					</button>
				</form>

				<MembershipSettings
					statement={statement}
					setStatementToEdit={setStatementToEdit}
				/>

				{statement.statementType === StatementType.question && (
					<ChoseBySettings {...statementSettingsProps} />
				)}

				{!isNewStatement && (
					<>
						<UploadImage
							statement={statement}
							image={image}
							setImage={setImage}
						/>
						<QuestionSettings {...statementSettingsProps} />
						<SectionTitle title={t('Members')} />
						<section className='get-members-area'>
							<GetVoters statementId={statementId} joinedMembers={joinedMembers} />
						</section>
						<section className='get-members-area'>
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
