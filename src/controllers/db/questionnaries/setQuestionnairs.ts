import { logger } from "@sentry/react";
import { Collections, Questionnaire, QuestionnaireSchema } from "delib-npm";
import { doc, setDoc } from "firebase/firestore"; // Add setDoc import
import { DB } from "../config";
import { safeParse } from "valibot";

export async function setQuestionnaire(questionnaire: Questionnaire): Promise<boolean> {
    try {
        const questionnaireRef = doc(DB, Collections.questionnaires, questionnaire.questionnaireId);
        const results = safeParse(QuestionnaireSchema, questionnaire);
        
        if (!results.success) {
            // At this point, TypeScript should know results.issues exists
            logger.error("Invalid questionnaire data:", { issues: results.issues });
            throw new Error(`Invalid questionnaire data: ${results.issues.map(i => i.message).join(', ')}`);
        }

        
        
        // Actually write to the database
        await setDoc(questionnaireRef, questionnaire);
        
        logger.info("Questionnaire saved successfully");
        return true;
        
    } catch (error) {
        logger.error("Error setting questionnaire:", error);
        return false;
    }
}