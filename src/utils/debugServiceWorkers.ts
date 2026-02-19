import { logError } from '@/utils/errorHandling';
export async function debugServiceWorkers() {
	console.info(
		'%c=== SERVICE WORKER DEBUG ===',
		'color: purple; font-weight: bold; font-size: 16px',
	);

	// 1. Check if service workers are supported
	console.info('%c1. Service Worker Support:', 'color: blue; font-weight: bold');
	console.info('   - Supported:', 'serviceWorker' in navigator);
	console.info('   - Secure context:', window.isSecureContext);
	console.info('   - Protocol:', window.location.protocol);

	if (!('serviceWorker' in navigator)) {
		logError(new Error('   ❌ Service Workers not supported in this browser!'), { operation: 'utils.debugServiceWorkers.debugServiceWorkers' });

		return;
	}

	// 2. List all registered service workers
	console.info('%c2. Registered Service Workers:', 'color: blue; font-weight: bold');
	try {
		const registrations = await navigator.serviceWorker.getRegistrations();
		console.info('   - Total registrations:', registrations.length);

		if (registrations.length === 0) {
			logError(new Error('   ❌ No service workers registered!'), { operation: 'utils.debugServiceWorkers.debugServiceWorkers' });
		} else {
			registrations.forEach((reg, index) => {
				console.info(`   - SW ${index + 1}:`);
				console.info(`     Scope: ${reg.scope}`);
				console.info(`     Active: ${reg.active ? 'Yes' : 'No'}`);
				console.info(`     Script URL: ${reg.active?.scriptURL || 'None'}`);
				console.info(`     State: ${reg.active?.state || 'None'}`);
				console.info(`     Update found: ${reg.installing ? 'Yes' : 'No'}`);

				// Check if it's Firebase SW
				if (reg.active?.scriptURL.includes('firebase-messaging-sw.js')) {
					console.info('     ✅ This is the Firebase messaging SW');
				}
			});
		}
	} catch (error) {
		logError(error, { operation: 'utils.debugServiceWorkers.unknown', metadata: { message: '   Error getting registrations:' } });
	}

	// 3. Check current controller
	console.info('%c3. Current Controller:', 'color: blue; font-weight: bold');
	if (navigator.serviceWorker.controller) {
		console.info('   - Script URL:', navigator.serviceWorker.controller.scriptURL);
		console.info('   - State:', navigator.serviceWorker.controller.state);
	} else {
		console.info('   - No active controller');
	}

	// 4. Try to manually register Firebase SW
	console.info('%c4. Manual Firebase SW Registration Test:', 'color: orange; font-weight: bold');
	try {
		console.info('   - Attempting to register /firebase-messaging-sw.js...');
		const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
			scope: '/firebase-messaging-sw/',
		});
		console.info('   - ✅ Registration successful!');
		console.info('   - Scope:', registration.scope);
		console.info('   - Active:', !!registration.active);

		// Wait for activation
		if (!registration.active) {
			console.info('   - Waiting for activation...');
			await new Promise((resolve) => {
				const checkActivation = setInterval(() => {
					if (registration.active) {
						clearInterval(checkActivation);
						console.info('   - ✅ Now active!');
						resolve(true);
					}
				}, 100);

				// Timeout after 5 seconds
				setTimeout(() => {
					clearInterval(checkActivation);
					logError(new Error('   - ❌ Activation timeout'), { operation: 'utils.debugServiceWorkers.checkActivation' });
					resolve(false);
				}, 5000);
			});
		}
	} catch (error) {
		logError(error, { operation: 'utils.debugServiceWorkers.checkActivation', metadata: { message: (error as Error).message } });
	}

	// 5. Check if Firebase SW file exists
	console.info('%c5. Firebase SW File Check:', 'color: blue; font-weight: bold');
	try {
		const response = await fetch('/firebase-messaging-sw.js');
		console.info('   - File exists:', response.ok);
		console.info('   - Status:', response.status);
		console.info('   - Content-Type:', response.headers.get('content-type'));

		if (!response.ok) {
			logError(new Error('   - ❌ File not accessible!'), { operation: 'utils.debugServiceWorkers.unknown' });
		} else {
			const text = await response.text();
			console.info('   - File size:', text.length, 'bytes');
			console.info('   - Starts with:', text.substring(0, 50) + '...');
		}
	} catch (error) {
		logError(error, { operation: 'utils.debugServiceWorkers.unknown', metadata: { message: '   - Error fetching file:' } });
	}

	// 6. Check PWAWrapper initialization
	console.info('%c6. PWAWrapper Check:', 'color: blue; font-weight: bold');
	console.info('   - Look for "[PWAWrapper] Initializing" in console above');
	console.info('   - Look for "Firebase Messaging SW registered" message');

	console.info(
		'%c=== END SERVICE WORKER DEBUG ===',
		'color: purple; font-weight: bold; font-size: 16px',
	);
}

// Add to window
if (typeof window !== 'undefined') {
	(window as { debugServiceWorkers?: typeof debugServiceWorkers }).debugServiceWorkers =
		debugServiceWorkers;
}
