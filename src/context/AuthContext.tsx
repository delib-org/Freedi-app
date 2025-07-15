import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { ReactNode, FC } from 'react';
import { AuthContext } from './auth/context';

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
	const auth = useAuthorization();

	return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};
