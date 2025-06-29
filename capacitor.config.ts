import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.freedi.app',
	appName: 'freedi-app',
	webDir: 'dist',
	server: {
		// Point to your Firebase hosting emulator
		url: 'http://10.0.2.2:5000', // Firebase hosting emulator port
		cleartext: true, // Allow HTTP (required for local development)
	},
};

export default config;
