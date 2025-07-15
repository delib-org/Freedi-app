import { createContext } from 'react';
import { UserConfigContextType } from './types';

// Create context
export const UserConfigContext = createContext<
	UserConfigContextType | undefined
>(undefined);
