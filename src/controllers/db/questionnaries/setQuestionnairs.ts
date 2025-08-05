import { logger } from "@sentry/react";
import { Collections, Questionnaire, QuestionnaireQuestion, QuestionnaireQuestionSchema, QuestionnaireSchema, Statement } from "delib-npm";
import { arrayUnion, doc, setDoc, updateDoc, deleteField } from "firebase/firestore"; // Add setDoc import
import { DB } from "../config";
import { check, safeParse } from "valibot";
import { checkValidationErrors } from "@/utils/validation";

export async function updateQuestionnaireDetails({
    statementId,
    question,
    description,
}: {
    statementId: string;
    question: string;
    description?: string;
}): Promise<boolean> {
    try {
        const questionnaireRef = doc(DB, Collections.statements, statementId);

        // Update the document in Firestore using dot notation to avoid overwriting
        await updateDoc(questionnaireRef, {
            "questionnaire.question": question,
            "questionnaire.description": description || "",
            "questionnaire.lastUpdate": Date.now(),
        });

        return true;

    } catch (error) {
        console.error("Error updating questionnaire details:", error);
        logger.error("Error updating questionnaire details:", error);
        return false;
    }
}

export async function setQuestionnaireQuestion({ questionnaireId, questionnaireQuestion }: { questionnaireId: string; questionnaireQuestion: QuestionnaireQuestion }): Promise<boolean> {
    try {
        console.log("setting questionnaire question:", questionnaireId);
        const statementRef = doc(DB, Collections.statements, questionnaireId);

        checkValidationErrors(QuestionnaireQuestionSchema, questionnaireQuestion);

        console.log({
            questionnaire: {
                questions: {
                    [questionnaireQuestion.questionnaireQuestionId]: questionnaireQuestion,
                }
            }
        });
        await updateDoc(statementRef, {
            [`questionnaire.questions.${questionnaireQuestion.questionnaireQuestionId}`]: questionnaireQuestion,
        });

        logger.info("Questionnaire question set successfully");
        return true;

    } catch (error) {
        console.error("Error setting questionnaire question:", error);
        logger.error("Error setting questionnaire question:", error);
        return false;
    }
}

export async function deleteQuestionnaireQuestion({ questionnaireId, questionnaireQuestionId }: { questionnaireId: string; questionnaireQuestionId: string }): Promise<boolean> {
    try {
        const statementRef = doc(DB, Collections.statements, questionnaireId);

        // Remove the question from the questions object
        await updateDoc(statementRef, {
            [`questionnaire.questions.${questionnaireQuestionId}`]: deleteField(),
        });

        logger.info("Questionnaire question deleted successfully");
        return true;

    } catch (error) {
        console.error("Error deleting questionnaire question:", error);
        logger.error("Error deleting questionnaire question:", error);
        return false;
    }
}