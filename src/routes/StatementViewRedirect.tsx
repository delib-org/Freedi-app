import { Navigate, useLocation } from 'react-router';
import { canonicalizeStatementPath } from './statementPaths';

export default function StatementViewRedirect() {
	const { pathname, search, hash } = useLocation();
	const target = canonicalizeStatementPath(pathname + search);

	return <Navigate to={(target ?? '/home') + hash} replace />;
}
