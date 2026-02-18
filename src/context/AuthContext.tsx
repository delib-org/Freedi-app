import { AuthorizationState, useAuthorization } from '@/controllers/hooks/useAuthorization';
import { createContext, useContext, ReactNode, FC } from 'react';

const AuthContext = createContext<AuthorizationState | null>(null);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const auth = useAuthorization();

	return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuthContext must be used within an AuthProvider');
	}

	return context;
};
