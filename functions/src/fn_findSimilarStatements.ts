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

    // Start content check and data fetching in parallel
    const [contentCheckResult, dataFetchResult] = await Promise.allSettled([
      checkForInappropriateContent(userInput),
      fetchDataAndProcess(statementId, userInput, creatorId, numberOfOptionsToGenerate)
    ]);

    // Check content first - if inappropriate, ignore data fetch results
    if (contentCheckResult.status === 'fulfilled') {
      const contentCheck = contentCheckResult.value;
      if (contentCheck.isInappropriate || contentCheck.error) {
        response.status(400).send({
          ok: false,
          error: "Input contains inappropriate content",
        });

        return;
      }
    } else {
      response.status(500).send({
        ok: false,
        error: "Unable to verify content safety",
      });

      return;
    }

    // If content is OK, use the data fetch results
    if (dataFetchResult.status === 'fulfilled') {
      const result = dataFetchResult.value;

      if (result.error) {
        response.status(result.statusCode || 500).send({
          ok: false,
          error: result.error,
        });

        return;
      }

      response.status(200).send({
        similarStatements: result.cleanedStatements,
        ok: true,
        userText: result.userText,
      });

      return;
    } else {
      response.status(500).send({
        ok: false,
        error: "Failed to process similarity search",
      });

      return;
    }
  } catch (error) {
    response.status(500).send({ error: error, ok: false });
    console.error("error", { error });

    return;
  }
}

async function fetchDataAndProcess(
  statementId: string,
  userInput: string,
  creatorId: string,
  numberOfOptionsToGenerate: number
) {
  try {
    // --- 1. Fetch Parent Statement and Validate ---
    const parentStatement = await getParentStatement(statementId);
    if (!parentStatement) {
      return {
        error: "Parent statement not found",
        statusCode: 404
      };
    }

    // --- 2. Fetch Existing Sub-statements and Check User Limits ---
    const subStatements = await getSubStatements(statementId);
    const userStatements = getUserStatements(subStatements, creatorId);
    const maxAllowed =
      parentStatement.statementSettings?.numberOfOptionsPerUser ?? Infinity;

    if (hasReachedMaxStatements(userStatements, maxAllowed)) {
      return {
        error: "You have reached the maximum number of suggestions allowed.",
        statusCode: 403
      };
    }

    const statementSimple = convertToSimpleStatements(subStatements);

    // --- 3. Find Similar Among Existing Options ---
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

    return {
      cleanedStatements,
      userText: duplicateStatement?.statement || userInput
    };
  } catch (processingError) {
    console.error("Error in fetchDataAndProcess:", processingError);

    return {
      error: "Failed to process data",
      statusCode: 500
    };
  }
}
