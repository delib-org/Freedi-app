import { Dispatch, FC, FormEvent, useState } from 'react';

// Third party imports
import { useNavigate, useParams } from 'react-router';

// Firestore functions

// Custom components
import QuestionSettings from '../QuestionSettings/QuestionSettings';
import AdvancedSettings from './../../components/advancedSettings/AdvancedSettings';
import ChoseBySettings from '../choseBy/ChoseBySettings';
import GetEvaluators from './../../components/GetEvaluators';
import GetVoters from './../../components/GetVoters';
import MembersSettings from './../../components/membership/MembersSettings';
import SectionTitle from './../../components/sectionTitle/SectionTitle';
import TitleAndDescription from './../../components/titleAndDescription/TitleAndDescription';
import { setNewStatement } from './../../statementSettingsCont';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import UploadImage from '@/view/components/uploadImage/UploadImage';

// Hooks & Helpers
import './StatementSettingsForm.scss';

// icons
import SaveIcon from '@/assets/icons/save.svg?react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { createSelector } from '@reduxjs/toolkit';
import { RootState, store } from '@/redux/store';
import Loader from '@/view/components/loaders/Loader';
import { Statement } from '@/types/statement/StatementTypes';
import { StatementSubscription } from '@/types/statement/StatementSubscription';
import { Role } from '@/types/user/UserSettings';

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
	const { t } = useLanguage();

	const [image, setImage] = useState<string>(imageUrl);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

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
			setError(null);
			
			try {
				// Check if user is logged in
				const currentUser = store.getState().user.user;
				if (!currentUser?.uid) {
					console.error('User not logged in when trying to create/update statement');
					setError('Please log in before creating a statement.');
					setLoading(false);
					return;
				}
				
				const newStatement = await setNewStatement({
					navigate,
					statementId,
					statement,
					parentStatement,
				});
				
				setLoading(false);
				
				if (!newStatement) {
					console.error('Failed to create/update statement - no statement returned');
					setError('Failed to save statement. Please try again.');
					return;
				}
				
				// Success - navigate to the new/updated statement
				navigate(`/statement/${newStatement.statementId}`);
			} catch (error) {
				console.error('Error in handleSubmit:', error);
				setError('An error occurred while saving. Please try again.');
				setLoading(false);
			}
		};

		const isNewStatement = !statementId;

		const statementSettingsProps = {
			statement,
			setStatementToEdit,
		} as const;

		if (loading)
			return (
				<div className='statement-settings-form'>
					<div className='loader-box'>
						<Loader />
					</div>
				</div>
			);

		return (
			<form
				onSubmit={handleSubmit}
				className='statement-settings-form'
				data-cy='statement-settings-form'
			>
				{error && (
					<div className="error-message" style={{ color: 'red', padding: '10px', textAlign: 'center' }}>
						{error}
					</div>
				)}
				
				<TitleAndDescription
					statement={statement}
					setStatementToEdit={setStatementToEdit}
				/>
				<SectionTitle title={t('General Settings')} />
				<section className='switches-area'>
					<AdvancedSettings {...statementSettingsProps} />
				</section>
				<ChoseBySettings {...statementSettingsProps} />

				{!isNewStatement && (
					<>
						<UploadImage
							statement={statementSettingsProps.statement}
							image={image}
							setImage={setImage}
						/>
						<QuestionSettings {...statementSettingsProps} />
						<SectionTitle title={t('Members')} />
						<MembersSettings statement={statement} />
						<section className='get-members-area'>
							<GetVoters
								statementId={statementId}
								joinedMembers={joinedMembers}
							/>
						</section>
						<section className='get-members-area'>
							<GetEvaluators statementId={statementId} />
						</section>
					</>
				)}

				<button
					type='submit'
					className='submit-button'
					aria-label='Submit button'
					data-cy='settings-statement-submit-btn'
				>
					<SaveIcon />
				</button>
			</form>
		);
	} catch (error) {
		console.error('Error in StatementSettingsForm:', error);

		return <div className="error-container">
			<p>An error occurred while loading the form. Please try again later.</p>
		</div>;
	}
};

export default StatementSettingsForm;