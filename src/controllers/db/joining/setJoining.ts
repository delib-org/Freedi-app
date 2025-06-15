import { doc, runTransaction } from "firebase/firestore";
import { DB } from "../config";
import { Collections, Creator, Statement } from "delib-npm";
import { store } from "@/redux/store";

export async function toggleJoining(statementId: string) {
	try {
		const creator = store.getState().creator.creator;
		if (!creator) throw new Error("Creator not found in user state");
		if (!statementId) throw new Error("Statement ID is required");

		const statementRef = doc(DB, Collections.statements, statementId);

		await runTransaction(DB, async (transaction) => {
			const statementDB = await transaction.get(statementRef);
			if (!statementDB.exists()) throw new Error("Statement does not exist");
			const statement = statementDB.data() as Statement;

			if (!statement?.joined) {
				transaction.update(statementRef, {
					joined: [creator]
				});

				return;
			}

			const isUserJoined = statement.joined?.find((user: Creator) => user.uid === creator.uid) ? true : false;

			const updatedJoined = isUserJoined
				? statement.joined.filter((user: Creator) => user.uid !== creator.uid)
				: [...(statement.joined || []), creator];

			transaction.update(statementRef, {
				joined: updatedJoined
			});
		});

	} catch (error) {
		console.error('Error setting joining status:', error);
	}
}