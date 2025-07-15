import { createContext } from 'react';
import { AuthorizationState } from '@/controllers/hooks/useAuthorization';

export const AuthContext = createContext<AuthorizationState | null>(null);
