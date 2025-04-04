import { Collections, ResultsSettings, ResultsSettingsSchema } from "delib-npm";
import { doc, updateDoc } from "firebase/firestore";
import { DB } from "../config";
import { parse } from "valibot";

export async function updateResultSettingsToDB(
	statementId: string,
	resultSettings: ResultsSettings
) {
	try {
		const resultSettingsRef = doc(DB, Collections.statements, statementId);
		parse(ResultsSettingsSchema, resultSettings)
		await updateDoc(resultSettingsRef, resultSettings);
	} catch (error) {
		console.error(error);
	}
}