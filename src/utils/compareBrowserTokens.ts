import { getMessaging, getToken } from 'firebase/messaging';
import { app, DB } from '@/controllers/db/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import { vapidKey } from '@/controllers/db/configKey';

export async function compareBrowserTokens() {
	console.info(
		'%c=== BROWSER TOKEN COMPARISON ===',
		'color: purple; font-weight: bold; font-size: 16px',
	);

	const messaging = getMessaging(app);
	const currentToken = await getToken(messaging, { vapidKey });

	console.info(
		'1. Current Browser:',
		navigator.userAgent.includes('Chrome')
			? 'Chrome'
			: navigator.userAgent.includes('Firefox')
				? 'Firefox'
				: 'Other',
	);
	console.info('2. Current Token:', currentToken);

	// Get all tokens for current user
	const user = JSON.parse(localStorage.getItem('userAuth') || '{}');
	if (!user.uid) {
		console.error('No user logged in');

		return;
	}

	console.info('3. User ID:', user.uid);

	// Query askedToBeNotified collection
	const q = query(collection(DB, Collections.askedToBeNotified), where('userId', '==', user.uid));

	const snapshot = await getDocs(q);
	console.info(`4. Found ${snapshot.size} token records for this user:`);

	snapshot.forEach((doc) => {
		const data = doc.data();
		console.info('   - Token:', data.token.substring(0, 20) + '...');
		console.info('     Statement:', data.statementId);
		console.info('     Created:', new Date(data.createdAt).toLocaleString());
		console.info('     Is Current Token:', data.token === currentToken);
	});

	// Check pushNotifications collection
	const pushQuery = query(collection(DB, 'pushNotifications'), where('uid', '==', user.uid));

	const pushSnapshot = await getDocs(pushQuery);
	console.info(`\n5. Found ${pushSnapshot.size} push notification records:`);

	pushSnapshot.forEach((doc) => {
		const data = doc.data();
		console.info('   - Token:', doc.id.substring(0, 20) + '...');
		console.info('     Browser:', data.browser || 'Unknown');
		console.info('     Created:', data.timestamp?.toDate?.()?.toLocaleString() || 'Unknown');
		console.info('     Is Current Token:', doc.id === currentToken);
	});

	// Compare with service worker registration
	console.info('\n6. Service Worker Push Subscription:');
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();

	if (subscription) {
		const endpoint = subscription.endpoint;
		const p256dh = subscription.toJSON().keys?.p256dh;
		console.info('   - Endpoint:', endpoint);
		console.info('   - P256dh key:', p256dh?.substring(0, 20) + '...');

		// Extract FCM token from endpoint if possible
		const fcmMatch = endpoint.match(/fcm\/send\/(.+)/);
		if (fcmMatch) {
			console.info('   - FCM token from endpoint:', fcmMatch[1].substring(0, 20) + '...');
			console.info('   - Matches current token:', fcmMatch[1] === currentToken);
		}
	} else {
		console.error('   - No push subscription found!');
	}

	console.info('\n%c=== END COMPARISON ===', 'color: purple; font-weight: bold');
}

// Add to window
if (typeof window !== 'undefined') {
	(window as { compareBrowserTokens?: typeof compareBrowserTokens }).compareBrowserTokens =
		compareBrowserTokens;
}
