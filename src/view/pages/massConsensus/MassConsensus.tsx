import { useAuthentication } from '@/controllers/hooks/useAuthentication'
import { usePublicAccess } from '@/controllers/hooks/usePublicAccess'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router'
import { HeaderProvider } from './headerMassConsensus/HeaderContext'
import { ExplanationProvider } from '@/contexts/massConsensus/ExplanationProvider'
import HeaderMassConsensus from './headerMassConsensus/HeaderMassConsensus'
import styles from './MassConsensus.module.scss'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import { setMassConsensusMemberToDB } from '@/controllers/db/massConsensus/setMassConsensus'
import { setMassConsensusProcess } from '@/redux/massConsensus/massConsensusSlice'
import { useGetStatementSubscriptionQuery, useGetMassConsensusProcessQuery } from '@/redux/massConsensus/massConsensusApi';
import Accessibility from '@/view/components/accessibility/Accessibility'
import LoadingPage from '@/view/pages/loadingPage/LoadingPage'
import { ErrorBoundary } from 'react-error-boundary'

const MassConsensusErrorFallback = ({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) => {
	return (
		<div style={{ padding: '20px', background: '#fee', border: '1px solid #f00', margin: '20px' }}>
			<h2>Error in Mass Consensus</h2>
			<p>An error occurred in the Mass Consensus component:</p>
			<pre style={{ background: '#fff', padding: '10px', overflow: 'auto' }}>
				{error.message}
				{'\n\n'}
				{error.stack}
			</pre>
			<button onClick={resetErrorBoundary} style={{ padding: '10px', marginTop: '10px' }}>
				Try Again
			</button>
		</div>
	);
};

const MassConsensus = () => {
	const navigate = useNavigate()
	const location = useLocation()
	const { dir } = useUserConfig();
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>();
	const { user } = useAuthentication();
	const { isCheckingAccess } = usePublicAccess(statementId);

	const { data: subscription, isLoading: isSubscriptionLoading } = useGetStatementSubscriptionQuery({
		statementId: statementId || '',
		userId: user?.uid || '',
	}, { skip: !statementId || !user });

	const { data: process, isLoading: isProcessLoading } = useGetMassConsensusProcessQuery(statementId || '', { skip: !statementId });

	useEffect(() => {
		if (location.pathname === `/mass-consensus/${statementId}` ||
			location.pathname === `/mass-consensus/${statementId}/`) {
			navigate(`/mass-consensus/${statementId}/introduction`);
		}
	}, [location.pathname, navigate, statementId]);

	useEffect(() => {
		if (process) {
			dispatch(setMassConsensusProcess(process));
		}
	}, [process, dispatch]);

	useEffect(() => {
		if (user && statementId) {
			setMassConsensusMemberToDB(user, statementId);
		}
	}, [user, statementId]);

	// Show loading while checking public access or fetching data
	if (isCheckingAccess || isSubscriptionLoading || isProcessLoading) {
		return <LoadingPage />;
	}

	return (
		<ExplanationProvider>
			<HeaderProvider>
				<div className={styles.massConsensusPage}>
					<HeaderMassConsensus />
					<Accessibility />
					<main className={styles.massConsensusMain} style={{ direction: dir }}>
						<div className={styles.massConsensusMain__wrapper}>
							<ErrorBoundary
								FallbackComponent={MassConsensusErrorFallback}
								onError={(error) => {
									console.error('MassConsensus ErrorBoundary caught:', error);
								}}
							>
								<Outlet />
							</ErrorBoundary>
						</div>
					</main>
				</div>
			</HeaderProvider>
		</ExplanationProvider>
	)
}

export default MassConsensus