import { DB } from '@/controllers/db/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import { notificationService } from '@/services/notificationService';

interface NotificationDebugInfo {
	userId: string;
	userEmail?: string;
	currentToken: string | null;
	storedTokens: string[];
	subscriptions: Array<{
		statementId: string;
		statementTitle?: string;
		role: string;
		notifications: {
			inApp: boolean;
			push: boolean;
			email: boolean;
		};
	}>;
	askedToBeNotified: Array<{
		statementId: string;
		token: string;
		subscribed: boolean;
	}>;
}

export async function debugGroupNotifications(statementId?: string) {
	console.info(
		'%c=== GROUP NOTIFICATIONS DEBUG ===',
		'color: blue; font-weight: bold; font-size: 16px',
	);

	const currentUser = notificationService.getCurrentUserId();
	const currentToken = notificationService.getToken();

	if (!currentUser) {
		console.error('No user logged in');

		return;
	}

	console.info('Current User:', currentUser);
	console.info('Current Token:', currentToken?.substring(0, 30) + '...');

	const debugInfo: NotificationDebugInfo = {
		userId: currentUser,
		currentToken,
		storedTokens: [],
		subscriptions: [],
		askedToBeNotified: [],
	};

	try {
		// 1. Check stored FCM tokens for this user
		console.info(
			'%c1. Checking FCM Tokens in pushNotifications collection:',
			'color: green; font-weight: bold',
		);
		const tokensQuery = query(
			collection(DB, 'pushNotifications'),
			where('userId', '==', currentUser),
		);
		const tokensSnapshot = await getDocs(tokensQuery);

		tokensSnapshot.forEach((doc) => {
			const data = doc.data();
			debugInfo.storedTokens.push(doc.id);
			console.info(`   - Token: ${doc.id.substring(0, 30)}...`);
			console.info(
				`     Last Update: ${data.lastUpdate?.toDate ? data.lastUpdate.toDate() : data.lastUpdate}`,
			);
			console.info(`     Platform: ${data.platform}`);
		});

		if (debugInfo.storedTokens.length === 0) {
			console.error('   ❌ No FCM tokens found in pushNotifications collection!');
		}

		// 2. Check statement subscriptions
		console.info('%c2. Checking Statement Subscriptions:', 'color: green; font-weight: bold');
		const subscriptionsQuery = statementId
			? query(
					collection(DB, Collections.statementsSubscribe),
					where('userId', '==', currentUser),
					where('statementId', '==', statementId),
				)
			: query(collection(DB, Collections.statementsSubscribe), where('userId', '==', currentUser));

		const subscriptionsSnapshot = await getDocs(subscriptionsQuery);

		for (const subDoc of subscriptionsSnapshot.docs) {
			const data = subDoc.data();

			// Get statement title
			let statementTitle = 'Unknown';
			try {
				const stmtDoc = await getDoc(doc(DB, Collections.statements, data.statementId));
				if (stmtDoc.exists()) {
					statementTitle = stmtDoc.data().statement || 'Untitled';
				}
			} catch (e) {
				console.error('Error fetching statement:', e);
			}

			const subInfo = {
				statementId: data.statementId,
				statementTitle,
				role: data.role,
				notifications: {
					inApp: data.getInAppNotification || false,
					push: data.getPushNotification || false,
					email: data.getEmailNotification || false,
				},
			};

			debugInfo.subscriptions.push(subInfo);

			console.info(`   - Statement: ${statementTitle}`);
			console.info(`     ID: ${data.statementId}`);
			console.info(`     Role: ${data.role}`);
			console.info(
				`     Notifications: InApp=${subInfo.notifications.inApp}, Push=${subInfo.notifications.push}, Email=${subInfo.notifications.email}`,
			);
		}

		if (debugInfo.subscriptions.length === 0) {
			console.error('   ❌ No statement subscriptions found!');
		}

		// 3. Check askedToBeNotified collection
		console.info('%c3. Checking askedToBeNotified collection:', 'color: green; font-weight: bold');

		// Check for current token
		if (currentToken) {
			const notifyQuery = statementId
				? query(
						collection(DB, Collections.askedToBeNotified),
						where('token', '==', currentToken),
						where('statementId', '==', statementId),
					)
				: query(collection(DB, Collections.askedToBeNotified), where('token', '==', currentToken));

			const notifySnapshot = await getDocs(notifyQuery);

			notifySnapshot.forEach((doc) => {
				const data = doc.data();
				debugInfo.askedToBeNotified.push({
					statementId: data.statementId,
					token: data.token,
					subscribed: data.subscribed,
				});

				console.info(`   - Statement ID: ${data.statementId}`);
				console.info(`     Subscribed: ${data.subscribed}`);
				console.info(`     Document ID: ${doc.id}`);
			});

			if (debugInfo.askedToBeNotified.length === 0) {
				console.error('   ❌ No entries found in askedToBeNotified collection!');
				console.info("   ℹ️  This means push notifications won't be sent to this device");
			}
		}

		// 4. Summary and recommendations
		console.info('%c4. Summary:', 'color: purple; font-weight: bold');
		console.info('   - FCM Tokens stored:', debugInfo.storedTokens.length);
		console.info('   - Statement subscriptions:', debugInfo.subscriptions.length);
		console.info('   - Push notification registrations:', debugInfo.askedToBeNotified.length);

		// Check for issues
		const issues = [];

		if (!currentToken) {
			issues.push('No FCM token available');
		}

		if (debugInfo.storedTokens.length === 0) {
			issues.push('No tokens in pushNotifications collection');
		}

		if (currentToken && !debugInfo.storedTokens.includes(currentToken)) {
			issues.push('Current token not found in pushNotifications collection');
		}

		if (debugInfo.subscriptions.length === 0) {
			issues.push('Not subscribed to any statements');
		}

		const pushEnabledSubs = debugInfo.subscriptions.filter((s) => s.notifications.push);
		if (pushEnabledSubs.length === 0) {
			issues.push('Push notifications not enabled for any subscriptions');
		}

		if (debugInfo.askedToBeNotified.length === 0) {
			issues.push('Not registered in askedToBeNotified collection');
		}

		if (issues.length > 0) {
			console.error('%c5. Issues Found:', 'color: red; font-weight: bold');
			issues.forEach((issue, i) => console.error(`   ${i + 1}. ${issue}`));

			console.info('%c6. Recommendations:', 'color: orange; font-weight: bold');
			console.info('   1. Make sure you have enabled push notifications for the statement');
			console.info('   2. Check that notification permissions are granted');
			console.info('   3. Try refreshing the notification token: await refreshNotificationToken()');
			console.info('   4. Ensure you are subscribed to the statement/group');
		} else {
			console.info('%c✅ Everything looks good!', 'color: green; font-weight: bold');
		}
	} catch (error) {
		console.error('Error during debug:', error);
	}

	console.info('%c=== END DEBUG ===', 'color: blue; font-weight: bold; font-size: 16px');

	return debugInfo;
}

// Helper function to register for push notifications for a specific statement
export async function registerForStatementPushNotifications(statementId: string) {
	console.info(`Registering for push notifications for statement: ${statementId}`);

	const userId = notificationService.getCurrentUserId();
	const token = notificationService.getToken();

	if (!userId || !token) {
		console.error('Missing user ID or FCM token');

		return false;
	}

	try {
		const result = await notificationService.registerForStatementNotifications(
			userId,
			token,
			statementId,
		);
		console.info(`Registration result: ${result ? 'Success' : 'Failed'}`);

		return result;
	} catch (error) {
		console.error('Error registering for notifications:', error);

		return false;
	}
}

// Add to window for easy access
if (typeof window !== 'undefined') {
	(window as { debugGroupNotifications?: typeof debugGroupNotifications }).debugGroupNotifications =
		debugGroupNotifications;
	(
		window as {
			registerForStatementPushNotifications?: typeof registerForStatementPushNotifications;
		}
	).registerForStatementPushNotifications = registerForStatementPushNotifications;
}
