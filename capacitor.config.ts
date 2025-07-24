import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.freedi.app',
	appName: 'Freedi',
	webDir: 'dist',
	server: {
		// Only use server config in development
		// Comment out or remove for production builds
		// For iOS Simulator use: http://localhost:5001
		// For Android Emulator use: http://10.0.2.2:5001
		// For iOS: use localhost, for Android: use 10.0.2.2
		url: 'http://localhost:5173', // Vite dev server port
		cleartext: true, // Allow HTTP (required for local development)
	},
	plugins: {
		SplashScreen: {
			launchShowDuration: 2000,
			backgroundColor: '#ffffff',
			showSpinner: false,
			androidSpinnerStyle: 'small',
			iosSpinnerStyle: 'small',
			splashFullScreen: true,
			splashImmersive: true,
		},
		StatusBar: {
			style: 'light',
			backgroundColor: '#ffffff',
		},
	},
};

export default config;
