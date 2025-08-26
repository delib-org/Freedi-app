/**
 * ✅ Migration Script for Existing Notifications
 * 
 * This script updates all existing notifications in the database
 * to include the new read/unread tracking fields.
 * 
 * Run this script once to migrate existing data.
 */

import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { DB } from '@/controllers/db/config';
import { Collections } from 'delib-npm';

export async function migrateExistingNotifications() {
	console.info('🔄 Starting notification migration...');
	
	try {
		// Get all existing notifications
		const notificationsRef = collection(DB, Collections.inAppNotifications);
		const snapshot = await getDocs(notificationsRef);
		
		if (snapshot.empty) {
			console.info('✅ No notifications to migrate');
			return { success: true, message: 'No notifications to migrate', count: 0 };
		}
		
		console.info(`📊 Found ${snapshot.size} notifications to migrate`);
		
		// Process in batches of 500 (Firestore batch write limit)
		const batchSize = 500;
		let batchCount = 0;
		let processedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;
		
		const docs = snapshot.docs;
		
		for (let i = 0; i < docs.length; i += batchSize) {
			const batch = writeBatch(DB);
			const batchDocs = docs.slice(i, i + batchSize);
			let batchUpdates = 0;
			
			batchDocs.forEach((docSnapshot) => {
				try {
					const data = docSnapshot.data();
					
					// Skip if document is invalid
					if (!data) {
						skippedCount++;
						console.warn(`Skipping invalid document: ${docSnapshot.id}`);
						return;
					}
					
					// Add new fields if they don't exist
					const updates: any = {};
					
					// Set read to false if not present
					if (data.read === undefined) {
						updates.read = false;
					}
					
					// Set viewedInList to false if not present
					if (data.viewedInList === undefined) {
						updates.viewedInList = false;
					}
					
					// Set viewedInContext to false if not present
					if (data.viewedInContext === undefined) {
						updates.viewedInContext = false;
					}
					
					// Only update if there are changes
					if (Object.keys(updates).length > 0) {
						batch.update(docSnapshot.ref, updates);
						batchUpdates++;
						processedCount++;
					} else {
						skippedCount++;
					}
				} catch (docError) {
					errorCount++;
					console.error(`Error processing document ${docSnapshot.id}:`, docError);
				}
			});
			
			// Only commit if there are updates in this batch
			if (batchUpdates > 0) {
				try {
					await batch.commit();
					batchCount++;
					console.info(`✅ Batch ${batchCount} completed (${Math.min((i + batchSize), docs.length)} / ${docs.length})`);
				} catch (batchError) {
					console.error(`❌ Batch ${batchCount} failed:`, batchError);
					errorCount += batchUpdates;
					processedCount -= batchUpdates;
				}
			}
		}
		
		console.info(`✅ Migration complete!`);
		console.info(`   - Updated: ${processedCount} notifications`);
		console.info(`   - Skipped: ${skippedCount} notifications (already migrated or invalid)`);
		if (errorCount > 0) {
			console.warn(`   - Errors: ${errorCount} notifications failed`);
		}
		
		return { 
			success: true, 
			message: `Migration complete! Updated ${processedCount} notifications`,
			updated: processedCount,
			skipped: skippedCount,
			errors: errorCount
		};
		
	} catch (error) {
		console.error('❌ Migration failed:', error);
		throw error;
	}
}

// Optional: Function to mark all notifications as read for testing
export async function markAllNotificationsAsReadForUser(userId: string) {
	console.info(`🔄 Marking all notifications as read for user ${userId}...`);
	
	try {
		const notificationsRef = collection(DB, Collections.inAppNotifications);
		const snapshot = await getDocs(notificationsRef);
		
		// Filter notifications safely - check if userId field exists
		const userNotifications = snapshot.docs.filter(doc => {
			const data = doc.data();
			// Check if userId exists and matches
			return data && data.userId && data.userId === userId;
		});
		
		if (userNotifications.length === 0) {
			console.info('✅ No notifications found for user');
			return { success: true, message: 'No notifications found for user', count: 0 };
		}
		
		const batch = writeBatch(DB);
		const now = Date.now();
		let updateCount = 0;
		
		userNotifications.forEach((docSnapshot) => {
			try {
				batch.update(docSnapshot.ref, {
					read: true,
					readAt: now,
					viewedInList: true,
					viewedInContext: true
				});
				updateCount++;
			} catch (error) {
				console.error(`Error updating document ${docSnapshot.id}:`, error);
			}
		});
		
		if (updateCount > 0) {
			await batch.commit();
			console.info(`✅ Marked ${updateCount} notifications as read`);
		}
		
		return { success: true, message: `Marked ${updateCount} notifications as read`, count: updateCount };
		
	} catch (error) {
		console.error('❌ Failed to mark notifications as read:', error);
		throw error;
	}
}

// To run the migration, uncomment and call this function
// migrateExistingNotifications();