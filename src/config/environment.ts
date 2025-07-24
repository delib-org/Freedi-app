import { Capacitor } from '@capacitor/core';

// Environment configuration
export const environment = {
	production: import.meta.env.PROD,
	development: import.meta.env.DEV,
	isNativePlatform: Capacitor.isNativePlatform(),
	
	// Use production auth for mobile OAuth (Google login doesn't work with auth emulator on mobile)
	useProductionAuth: Capacitor.isNativePlatform() && import.meta.env.DEV,
	
	// Firebase emulator hosts
	emulators: {
		auth: Capacitor.isNativePlatform() ? '192.168.33.13' : 'localhost',
		firestore: Capacitor.isNativePlatform() ? '192.168.33.13' : '127.0.0.1',
		storage: Capacitor.isNativePlatform() ? '192.168.33.13' : '127.0.0.1',
	}
};