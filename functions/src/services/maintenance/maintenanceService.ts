import { db } from '../../db';
import { Collections, DeliberativeElement, StatementType } from '@freedi/shared-types';

export class MaintenanceService {
	/**
	 * Update role from 'statement-creator' to 'admin'
	 */
	async updateRoles(): Promise<{ updated: number }> {
		const subscriptionsRef = db.collection(Collections.statementsSubscribe);
		const q = subscriptionsRef.where('role', '==', 'statement-creator');
		const subscriptionsDB = await q.get();

		const batch = db.batch();
		subscriptionsDB.docs.forEach((doc) => {
			const ref = subscriptionsRef.doc(doc.id);
			batch.update(ref, { role: 'admin' });
		});

		await batch.commit();

		return { updated: subscriptionsDB.size };
	}

	/**
	 * Migrate statementType to deliberativeElement
	 */
	async migrateDeliberativeElements(): Promise<{ updated: number }> {
		const statementsRef = db.collection(Collections.statements);
		const q = statementsRef.where('statementType', '!=', 'aa');
		const statementsDB = await q.get();

		const batch = db.batch();
		statementsDB.docs.forEach((doc) => {
			const ref = statementsRef.doc(doc.id);
			const data = doc.data();

			if (data.statementType === 'option') {
				batch.update(ref, {
					deliberativeElement: DeliberativeElement.option,
				});
			} else if (data.statementType === 'result') {
				batch.update(ref, {
					deliberativeElement: DeliberativeElement.option,
					isResult: true,
				});
			} else if (data.statementType === StatementType.question) {
				batch.update(ref, {
					deliberativeElement: DeliberativeElement.research,
				});
			} else {
				batch.update(ref, {
					deliberativeElement: DeliberativeElement.general,
				});
			}
		});

		await batch.commit();

		return { updated: statementsDB.size };
	}

	/**
	 * Update statement results settings
	 */
	async updateStatementResultsSettings(): Promise<{ updated: number; cleared: number }> {
		const statementsRef = db.collection(Collections.statements);

		// Update resultsBy field
		const q1 = statementsRef.where('resultsSettings.resultsBy', '!=', 'topOptions');
		const statementsDB1 = await q1.get();

		// Clear statement.results array
		const q2 = statementsRef.where('statement.results', '!=', []);
		const statementsDB2 = await q2.get();

		const batch = db.batch();

		// Update resultsBy
		statementsDB1.docs.forEach((doc) => {
			const ref = statementsRef.doc(doc.id);
			batch.update(ref, { 'resultsSettings.resultsBy': 'topOptions' });
		});

		// Clear results array
		let clearedCount = 0;
		statementsDB2.docs.forEach((doc) => {
			const ref = statementsRef.doc(doc.id);
			batch.update(ref, { 'statement.results': [] });
			clearedCount++;
		});

		await batch.commit();

		return { updated: statementsDB1.size, cleared: clearedCount };
	}

	/**
	 * Convert subscription token from string to array
	 */
	async updateSubscriptionTokenFormat(): Promise<{ total: number; updated: number }> {
		const subscriptionRef = db.collection(Collections.statementsSubscribe);
		const subscriptionsDB = await subscriptionRef.get();

		const batch = db.batch();
		let count = 0;

		subscriptionsDB.docs.forEach((doc) => {
			const data = doc.data();
			if (typeof data.token === 'string') {
				const ref = subscriptionRef.doc(doc.id);
				batch.update(ref, { token: [data.token] });
				count++;
			}
		});

		await batch.commit();

		return { total: subscriptionsDB.size, updated: count };
	}
}
