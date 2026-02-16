import { UserConfigContextType, UserConfigContext } from '@/context/UserConfigContext';
import { useContext } from 'react';

export function useUserConfig(): UserConfigContextType {
	const context = useContext(UserConfigContext);

	if (!context) {
		throw new Error('useUserConfig must be used within a UserConfigProvider');
	}

	return context;
}
