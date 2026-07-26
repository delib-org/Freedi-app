import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { GameProvider, useGame } from './state/GameContext';
import { useUser } from './lib/user';
import Intro from './pages/Intro';
import Compass from './pages/Compass';
import MapPage from './pages/MapPage';
import Voyage from './pages/Voyage';
import Summary from './pages/Summary';
import Admin from './pages/Admin';

/** Routes that need a signed-in user (everything except the intro). */
function Protected({ children }: { children: ReactElement }) {
	const { user, loading } = useUser();
	const game = useGame();

	if (loading || game.loading) {
		return (
			<div className="page justify-center">
				<p className="panel">מרימים את המפרשים…</p>
			</div>
		);
	}
	if (!user) return <Navigate to="/" replace />;

	return children;
}

export default function App() {
	return (
		<GameProvider>
			<main dir="rtl">
				<div className="ocean-bg" />
				<div className="vignette" />
				<Routes>
					<Route path="/" element={<Intro />} />
					<Route
						path="/compass"
						element={
							<Protected>
								<Compass />
							</Protected>
						}
					/>
					<Route
						path="/map"
						element={
							<Protected>
								<MapPage />
							</Protected>
						}
					/>
					<Route
						path="/voyage"
						element={
							<Protected>
								<Voyage />
							</Protected>
						}
					/>
					<Route
						path="/summary"
						element={
							<Protected>
								<Summary />
							</Protected>
						}
					/>
					<Route
						path="/admin"
						element={
							<Protected>
								<Admin />
							</Protected>
						}
					/>
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</main>
		</GameProvider>
	);
}
