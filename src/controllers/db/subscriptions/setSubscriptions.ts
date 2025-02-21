import { doc, updateDoc, setDoc, Timestamp, getDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { getUserFromFirebase } from '../users/usersGeneral';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import { store } from '@/redux/store';
import { Collections } from '@/types/TypeEnums';
import { Statement, StatementSchema } from '@/types/statement/Statement';
import { StatementSubscriptionSchema } from '@/types/statement/StatementSubscription';
import { User } from '@/types/user/User';
import { parse } from 'valibot';
import { Role } from '@/types/user/UserSettings';

export async function setStatementSubscriptionToDB(
	statement: Statement,
	role: Role = Role.member
) {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');
		if (!user.uid) throw new Error('User not logged in');

		const { statementId } = parse(StatementSchema, statement);

		const statementsSubscribeId = getStatementSubscriptionId(
			statementId,
			user
		);
		if (!statementsSubscribeId)
			throw new Error('Error in getting statementsSubscribeId');

		const statementsSubscribeRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementsSubscribeId
		);

		//check if user is already subscribed
		const statementSubscription = await getDoc(statementsSubscribeRef);
		if (statementSubscription.exists()) return;

		//if not subscribed, subscribe
		const subscriptionData = {
			user,
			statementsSubscribeId,
			statement,
			role,
			userId: user.uid,
			statementId,
			lastUpdate: Timestamp.now().toMillis(),
			createdAt: Timestamp.now().toMillis(),
		};

		if (user.uid === statement.creatorId)
			subscriptionData.role = Role.admin;

		const parsedStatementSubscription = parse(
			StatementSubscriptionSchema,
			subscriptionData
		);

		await setDoc(statementsSubscribeRef, parsedStatementSubscription, {
			merge: true,
		});
	} catch (error) {
		console.error(error);
	}
}

export async function updateSubscriberForStatementSubStatements(
	statement: Statement
) {
	try {
		const user = getUserFromFirebase();
		if (!user) throw new Error('User not logged in');
		if (!user.uid) throw new Error('User not logged in');

		const statementsSubscribeId = `${user.uid}--${statement.statementId}`;

		const statementsSubscribeRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementsSubscribeId
		);
		const newSubStatementsRead = {
			totalSubStatementsRead: statement.totalSubStatements || 0,
		};

		await updateDoc(statementsSubscribeRef, newSubStatementsRead);
	} catch (error) {
		console.error(error);
	}
}

export async function setRoleToDB(
	statement: Statement,
	role: Role,
	user: User
): Promise<void> {
	try {
		//getting current user role in statement
		const currentUser = store.getState().user.user;
		if (!currentUser) throw new Error('User not logged in');
		const currentUserStatementSubscriptionId = getStatementSubscriptionId(
			statement.statementId,
			currentUser
		);
		if (!currentUserStatementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');
		const currentUserStatementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			currentUserStatementSubscriptionId
		);
		const currentUserStatementSubscription = await getDoc(
			currentUserStatementSubscriptionRef
		);
		const currentUserRole = currentUserStatementSubscription.data()?.role;
		if (!currentUserRole)
			throw new Error('Error in getting currentUserRole');
		if (
			currentUserRole !== Role.admin ||
			statement.creator.uid === user.uid
		)
			return;

		//setting user role in statement
		const statementSubscriptionId = getStatementSubscriptionId(
			statement.statementId,
			user
		);
		if (!statementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');
		const statementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId
		);

		return setDoc(statementSubscriptionRef, { role }, { merge: true });
	} catch (error) {
		console.error(error);
	}
}

export async function updateMemberRole(
	statementId: string,
	userId: string,
	newRole: Role
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(
			statementId,
			{
				uid: userId,
				displayName: '',
			}
		);
		if (!statementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId
		);
		await updateDoc(statementSubscriptionRef, { role: newRole });
	} catch (error) {
		console.error('Error updating member role:', error);
	}
}
