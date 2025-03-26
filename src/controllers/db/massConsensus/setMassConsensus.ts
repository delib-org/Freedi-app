import { Collections, Creator, getStatementSubscriptionId, MassConsensusMember, User } from "delib-npm";
import { DB } from "../config";
import { doc, setDoc } from "firebase/firestore";
import { convertFirebaseUserToCreator } from "@/types/user/userUtils";


export async function setMassConsensusMemberToDB(creator: Creator | User, statementId: string) {
    try {
        const newMember: MassConsensusMember = {
            statementId,
            lastUpdate: new Date().getTime(),
            creator: convertFirebaseUserToCreator(creator)
        };
        const memberId = getStatementSubscriptionId(statementId, creator);
        if (!memberId) throw new Error('Error getting member id');
        const memberRef = doc(DB, Collections.massConsensusMembers, memberId);
        await setDoc(memberRef, newMember, { merge: true });

        return { message: 'Member added successfully', ok: true };
    } catch (error) {
        console.error(error);
        return { message: 'Error adding member', ok: false };
    }
}