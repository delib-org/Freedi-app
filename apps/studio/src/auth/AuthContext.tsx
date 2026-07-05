import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react';
import {
	GoogleAuthProvider,
	signInWithPopup,
	signOut as fbSignOut,
	onAuthStateChanged,
	type User,
} from 'firebase/auth';
import { auth } from '@/firebase';

interface AuthState {
	user: User | null;
	loading: boolean;
	signInWithGoogle: () => Promise<void>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (u) => {
			setUser(u);
			setLoading(false);
		});

		return () => unsubscribe();
	}, []);

	const signInWithGoogle = async () => {
		await signInWithPopup(auth, new GoogleAuthProvider());
	};

	const signOut = async () => {
		await fbSignOut(auth);
	};

	return (
		<AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthState {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth must be used within AuthProvider');

	return ctx;
}
