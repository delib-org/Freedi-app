import { useIntroductionMV } from './IntroductionMV';
import styles from './Introduction.module.scss';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { MassConsensusPageUrls } from 'delib-npm';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useState } from 'react';
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { useDispatch } from 'react-redux';
import { setStatement } from '@/redux/statements/statementsSlice';
import Text from '@/view/components/text/Text';

const Introduction = () => {
	const { t, dir } = useUserConfig();
	const dispatch = useDispatch();
	const { statement, loading, error, subscription } = useIntroductionMV();
	const [edit, setEdit] = useState(false);
	const role = subscription?.role;

	if (error) return <div>{error}</div>;
	if (loading) return <div>Loading...</div>;

	function handleSubmitDescription(e) {
		e.preventDefault();
		const _description = e.target.description.value;

		setEdit(false);
		if (_description && _description !== statement?.description && statement)
			updateStatementText(statement, undefined, _description);
		const newStatement = { ...statement, description: _description };
		dispatch(setStatement(newStatement));

	}

	return (
		<div className={styles.introduction} style={{ direction: dir }}>
			<HeaderMassConsensus
				title={t('description')}
				backTo={MassConsensusPageUrls.introduction}
				backToApp={false}
				isIntro={true}
			/>
			<div className={styles.wrapper}>
				<h1>{statement?.statement}</h1>
				{!edit ? <Text description={statement?.description} /> :
					<form onSubmit={handleSubmitDescription}>
						<textarea name="description" defaultValue={statement?.description} placeholder={t("Add description here")}></textarea>
						<div className="btns">
							<button className='btn btn-primary' type="submit">Save</button><button className='btn btn-secondary' onClick={() => setEdit(false)}>Cancel</button>
						</div>
					</form>}
				{role === 'admin' && !edit &&
					<div className="btns">
						<button className='btn btn-primary' onClick={() => setEdit(true)}>Edit</button>
					</div>

				}

				<FooterMassConsensus
					isIntro={true}
					goTo={MassConsensusPageUrls.initialQuestion}
				/>
			</div>
		</div>
	);
};

export default Introduction;
