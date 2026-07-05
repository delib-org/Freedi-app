import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import Login from '@/pages/Login';
import MyEvents from '@/pages/MyEvents';
import EventDashboard from '@/pages/EventDashboard';
import AppHeader from '@/components/AppHeader';

export default function App() {
	const { user, loading } = useAuth();

	if (loading) {
		return <div className="studio-loading">Loading…</div>;
	}

	if (!user) {
		return <Login />;
	}

	return (
		<>
			<AppHeader />
			<Routes>
				<Route path="/" element={<MyEvents />} />
				<Route path="/events/:eventId" element={<EventDashboard />} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</>
	);
}
