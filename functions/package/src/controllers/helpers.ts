import { parse } from "valibot";
import { getStatementSubscriptionId, StatementSubscription, StatementSubscriptionSchema } from "../models/statement/StatementSubscription";
import { Statement } from "../models/statement/StatementTypes";
import { Creator, User } from "../models/user/User";
import { Role } from "../models/user/UserSettings";

interface SetSubscriptionProps {
    statement: Statement;
    user: User | Creator;
    role?: Role;
    getInAppNotification?: boolean;
    getEmailNotification?: boolean;
    getPushNotification?: boolean;
}

export function createSubscription({
    statement,
    user,
    role = Role.member,
    getInAppNotification = true,
    getEmailNotification = false,
    getPushNotification = false,

}: SetSubscriptionProps): StatementSubscription | undefined {
    try {
        const newStatementSubscriptionId = getStatementSubscriptionId(
            statement.statementId,
            user
        );
        if (!newStatementSubscriptionId)
            throw new Error('No newStatementSubscriptionId');
        const newSubscription: StatementSubscription = {
            statementId: statement.statementId,
            role,
            lastUpdate: Date.now(),
            statement: statement,
            statementsSubscribeId: newStatementSubscriptionId,
            user: statement.creator,
            userId: user.uid,
            getInAppNotification,
            getEmailNotification,
            getPushNotification,
        };

        return parse(StatementSubscriptionSchema, newSubscription);
    } catch (error) {
        console.error(error);

        return undefined;
    }
}

export function updateArray<T>(
    currentArray: Array<T>,
    newItem: T,
    updateByProperty: keyof T & string
): Array<T> {
    // Check if property exists early to avoid unnecessary operations
    if (newItem[updateByProperty] === undefined) {
        console.error(`Item doesn't have property ${updateByProperty}`);

        return currentArray;
    }

    const index = currentArray.findIndex(
        (item) => item[updateByProperty] === newItem[updateByProperty]
    );

    // If item not found, just return a new array with the item added
    if (index === -1) {
        return [...currentArray, newItem];
    }

    // Check if the item actually needs to be updated
    // Avoid unnecessary spread operations and comparisons
    const existingItem = currentArray[index];
    let needsUpdate = false;

    // Compare only the keys in newItem for changes
    for (const key in newItem) {
        if (existingItem[key] !== newItem[key]) {
            needsUpdate = true;
            break;
        }
    }

    // Only create a new array if an update is needed
    if (!needsUpdate) {
        return currentArray;
    }

    // Create a new array with the updated item
    const result = [...currentArray];
    result[index] = { ...existingItem, ...newItem };

    return result;
}