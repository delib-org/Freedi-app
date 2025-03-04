import { useEffect, useState } from 'react';
import '@/view/style/homePage.scss';

// Third party libraries
import { useNavigate } from 'react-router';

// Redux store
import MainCard from './mainCard/MainCard';
import bike from '@/assets/images/bike.png';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { topSubscriptionsSelector } from '@/redux/statements/statementsSlice';

// Custom components
import Footer from '@/view/components/footer/Footer';
import PeopleLoader from '@/view/components/loaders/PeopleLoader';
import { StatementSubscription } from '@/types/statement/StatementSubscriptionTypes';

const HomeMain = () => {
	// Hooks
	const navigate = useNavigate();
	const [loading, setLoading] = useState(true);

	const statementSubscriptions: StatementSubscription[] = useAppSelector(topSubscriptionsSelector)
		.sort((a, b) => b.lastUpdate - a.lastUpdate);

	function handleAddStatement() {
		navigate('/home/addStatement', {
			state: { from: window.location.pathname },
		});
	}

	useEffect(() => {
		setTimeout(() => {
			setLoading(false);
		}, 3000);

		if (statementSubscriptions.length > 0) {
			setLoading(false);
		}
	}, [statementSubscriptions]);

	return (
		<main className='home-page__main slide-in'>
			<div className='heroImg'></div>
			<img
				className='bikeImg'
				alt='Three-Characters-on-a-bicycle'
				src={bike}
			/>

			<div
				className='wrapper main-wrap'
				style={{
					justifyContent: statementSubscriptions.length > 0 ? 'start' : 'center',
				}}
			>
				{!loading ? (
					statementSubscriptions.map((sb) => (
						<MainCard
							key={sb.statement.statementId}
							simpleStatement={sb.statement}
						/>
					))
				) : (
					<div className='peopleLoadingScreen'>
						<PeopleLoader />
					</div>
				)}
			</div>
			<Footer onclick={handleAddStatement} />
		</main>
	);
};

export default HomeMain;
