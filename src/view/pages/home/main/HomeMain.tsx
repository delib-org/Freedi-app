import { useContext, useEffect, useState } from 'react';
import '@/view/style/homePage.scss';
import styles from './HomeMain.module.scss';
// Third party libraries
import { useNavigate } from 'react-router';

// Redux store
import MainCard from './mainCard/MainCard';
import bike from '@/assets/images/bike.png';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementsSubscriptionsSelector, topSubscriptionsSelector } from '@/redux/statements/statementsSlice';

// Custom components
import Footer from '@/view/components/footer/Footer';
import PeopleLoader from '@/view/components/loaders/PeopleLoader';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { StatementType } from 'delib-npm';
import MainQuestionCard from './mainQuestionCard/MainQuestionCard';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import NewStatement from '../../statement/components/newStatemement/newStatement';
import { StatementContext } from '../../statement/StatementCont';
import { selectNewStatementShowModal } from '@/redux/statements/newStatementSlice';
import { useSelector } from 'react-redux';

const HomeMain = () => {
	// Hooks
	const navigate = useNavigate();
	const [loading, setLoading] = useState(true);
	const [subPage, setSubPage] = useState<"decisions" | "groups">("decisions");
	const [subPageTitle, setSubPageTitle] = useState<"Decisions" | "Groups">("Decisions");
	const { user } = useAuthentication();
	const { t } = useUserConfig();
	const { setNewStatementType } = useContext(StatementContext)
	const showNewStatementModal = useSelector(selectNewStatementShowModal);

	setNewStatementType(StatementType.question);

	const topSubscriptions = useAppSelector(topSubscriptionsSelector)
		.sort((a, b) => b.lastUpdate - a.lastUpdate)
		.filter((sub) => sub.user?.uid === user?.uid);

	const latestDecisions = useAppSelector(statementsSubscriptionsSelector)
		.filter((sub) => sub.statement.statementType === StatementType.question)
		.sort((a, b) => b.lastUpdate - a.lastUpdate)

	function handleAddStatement() {
		navigate('/home/addStatement', {
			state: { from: window.location.pathname },
		});
	}

	useEffect(() => {
		setTimeout(() => {
			setLoading(false);
		}, 3000);

		if (topSubscriptions.length > 0) {
			setLoading(false);
		}
	}, [topSubscriptions]);

	useEffect(() => {
		setSubPageTitle(subPage === "decisions" ? "Decisions" : "Groups");
	}, [subPage])

	return (
		<main className='home-page__main slide-in'>
			{showNewStatementModal && <div className={styles.newStatementContainer}>
				<NewStatement />
			</div>}
			<div className='heroImg'></div>
			<img
				className='bikeImg'
				alt='Three-Characters-on-a-bicycle'
				src={bike}
			/>

			<div
				className='wrapper main-wrap'
				style={{
					justifyContent:
						topSubscriptions.length > 0 ? 'start' : 'center',
				}}
			>
				<h2>{t(subPageTitle)}</h2>
				{(() => {
					if (loading) {
						return (
							<div className='peopleLoadingScreen'>
								<PeopleLoader />
							</div>
						);
					}

					const itemsToRender = subPage === "groups" ? topSubscriptions : latestDecisions;

					return itemsToRender.map((sub) => (
						subPage === "groups" ?
							<MainCard
								key={sub.statementId}
								simpleStatement={sub.statement}
							/> :
							<MainQuestionCard
								key={sub.statementId}
								simpleStatement={sub.statement}
							/>
					));
				})()}
			</div>
			<Footer addGroup={handleAddStatement} isMain={true} setSubPage={setSubPage} subPage={subPage} />
		</main>
	);
};

export default HomeMain;
