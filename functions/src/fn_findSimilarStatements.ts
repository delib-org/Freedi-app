import { Request, Response } from "firebase-functions/v1";
import {
  checkForInappropriateContent,
  findSimilarStatementsAI,
} from "./services/ai-service";
import {
  getParentStatement,
  getSubStatements,
  getUserStatements,
  convertToSimpleStatements,
  getStatementsFromTexts,
  removeDuplicateStatement,
  hasReachedMaxStatements,
} from "./services/statement-service";

/**
 * Main Cloud Function to find or generate similar statements.
 * HTTP function that handles the business logic for finding similar statements.
 */
export async function findSimilarStatements(
  request: Request,
  response: Response
) {
  try {
    const numberOfOptionsToGenerate = 5;
    const parsedBody = request.body;

    const { statementId, userInput, creatorId } = parsedBody;
    const contentCheck = await checkForInappropriateContent(userInput);

    if (contentCheck.isInappropriate || contentCheck.error) {
      response.status(400).send({
        ok: false,
        error: "Input contains inappropriate content",
      });
      
      return;
    }
    // --- 1. Fetch Parent Statement and Validate ---
    const parentStatement = await getParentStatement(statementId);
    if (!parentStatement) {
      response
        .status(404)
        .send({ ok: false, error: "Parent statement not found" });

      return;
    }

    // --- 2. Fetch Existing Sub-statements and Check User Limits ---
    const subStatements = await getSubStatements(statementId);
    const userStatements = getUserStatements(subStatements, creatorId);
    const maxAllowed =
      parentStatement.statementSettings?.numberOfOptionsPerUser ?? Infinity;

    if (hasReachedMaxStatements(userStatements, maxAllowed)) {
      response.status(403).send({
        ok: false,
        error: "You have reached the maximum number of suggestions allowed.",
      });

      return;
    }

    const statementSimple = convertToSimpleStatements(subStatements);

    // --- Handle Case: Find Similar Among Existing Options ---

    const similarStatementsAI = await findSimilarStatementsAI(
      statementSimple.map((s) => s.statement),
      userInput,
      parentStatement.statement,
      numberOfOptionsToGenerate
    );

    const similarStatements = getStatementsFromTexts(
      statementSimple,
      similarStatementsAI,
      subStatements
    );

    const { statements: cleanedStatements, duplicateStatement } =
      removeDuplicateStatement(similarStatements, userInput);

    // --- 6. If there are enough similar statements in the DB send them ---
    response.status(200).send({
      similarStatements: cleanedStatements,
      ok: true,
      userText: duplicateStatement?.statement || userInput,
    });

    return;
  } catch (error) {
    response.status(500).send({ error: error, ok: false });
    console.error("error", { error });

    return;
  }
}
