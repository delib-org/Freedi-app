import { GoogleGenerativeAI } from "@google/generative-ai";
import { Response, Request } from "firebase-functions/v1";
import { db } from ".";
import "dotenv/config";
import { Collections, Statement } from "delib-npm";

export async function findSimilarStatements(
  request: Request,
  response: Response
) {
  try {
    const numberOfOptionsToGenerate = 5;
    const parsedBody = request.body;

    const {
      statementId,
      userInput,
      creatorId,
      generateIfNeeded = 6,
    } = parsedBody;
    //generateIfNeeded is a boolean that indicates if we should generate similar statements if no similar statements are found

    const ref = db.collection(Collections.statements);
    const parentDoc = await ref.doc(statementId).get();
    if (!parentDoc.exists) {
      response
        .status(404)
        .send({ ok: false, error: "Parent statement not found" });

      return;
    }
    const parentStatement = parentDoc.data() as Statement;

    const query = ref.where("parentId", "==", statementId);
    const subStatementsDB = await query.get();

    const subStatements = subStatementsDB.docs.map((doc) =>
      doc.data()
    ) as Statement[];
    const userStatements = subStatements.filter(
      (s) => s.creatorId === creatorId
    );
    const maxAllowed =
      parentStatement.statementSettings?.numberOfOptionsPerUser ?? 1;

    if (userStatements.length >= maxAllowed) {
      response.status(403).send({
        ok: false,
        error: "You have reached the maximum number of suggestions allowed.",
      });

      return;
    }
    const statementSimple: { statement: string; id: string }[] =
      subStatements.map((subStatement) => ({
        statement: subStatement.statement,
        id: subStatement.statementId,
      }));

    //if no options on the DB generate similar options by AI
    if (statementSimple.length === 0) {
      const textsByAI = await generateSimilar(
        userInput,

        parentStatement.statement,
        numberOfOptionsToGenerate
      );

      response.status(200).send({
        similarTexts: textsByAI,
        ok: true,
        userText: userInput,
      });

      return;
    }

    //if there are options in the DB
    const _similarStatementsAI: string[] = await findSimilarStatementsAI(
      statementSimple.map((s) => s.statement),
      userInput,
      parentStatement.statement,
      generateIfNeeded,
      numberOfOptionsToGenerate
    );

    const similarStatements = getStatementsFromTextsOfStatements(
      statementSimple,
      _similarStatementsAI,
      subStatements
    );
    const duplicateStatement = similarStatements.find(
      (stat) => stat.statement === userInput
    );

    if (duplicateStatement) {
      const index = similarStatements.indexOf(duplicateStatement);
      if (index !== -1) {
        similarStatements.splice(index, 1);
      }
    }
    const statementsLeftToGenerate =
      numberOfOptionsToGenerate - similarStatements.length;

    //if there are not enough similar statements in the DB and we need to generate more
    if (statementsLeftToGenerate > 0) {
      const generated: string[] = await generateSimilar(
        userInput,
        parentStatement.statement,
        statementsLeftToGenerate
      );

      response.status(200).send({
        similarStatements,
        similarTexts: generated,
        userText: duplicateStatement || userInput,
        ok: true,
      });

      return;
    }

    // If there are enough similar statements in the DB send them

    response.status(200).send({
      similarStatements,
      ok: true,
      userText: duplicateStatement || userInput,
    });

    return;
  } catch (error) {
    response.status(500).send({ error: error, ok: false });
    console.error("error", { error });

    return;
  }

  function getStatementsFromTextsOfStatements(
    statementSimple: { statement: string; id: string }[],
    _similarStatementsAI: string[],
    subStatements: Statement[]
  ): Statement[] {
    const similarStatementsIds = statementSimple
      .filter((subStatement) =>
        _similarStatementsAI.includes(subStatement.statement)
      )
      .map((s) => s.id);

    const statements = similarStatementsIds
      .map((id) =>
        subStatements.find((subStatement) => subStatement.statementId === id)
      )
      .filter((s) => s !== undefined);

    return statements;
  }
}

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  return new GoogleGenerativeAI(apiKey);
}

export async function findSimilarStatementsAI(
  allStatements: string[],
  userInput: string,
  question: string,
  generateIfNeeded?: boolean,
  numberOfSimilarStatements: number = 6
) {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const prompt = `
		Find up to ${numberOfSimilarStatements} sentences in the following strings:  ${allStatements},  that are similar to the user input '${userInput}'. 
		The use Input can be either in English or in Hebrew. Look for similar strings to the user input in both languages.
		Consider a match if the sentence shares at least 60% similarity in meaning the user input here is the question the user was asked: '${question}'.
		Give answer back in this json format: { strings: ['string1', 'string2', ...] }
		`;

    const result = await model.generateContent(prompt);

    const response = result.response;
    const text = response.text();

    return extractAndParseJsonString(text).strings;
  } catch (error) {
    console.error("Error running GenAI", error);

    return [];
  }
}

export async function generateSimilar(
  userInput: string,
  question: string,
  optionsToBeGeneratedByAI: number = 5
): Promise<string[]> {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const prompt = `
		create ${optionsToBeGeneratedByAI} similar sentences to the user input '${userInput}' try to keep it in the same spirit of the user input but never the same.
		here is the question the user was asked: '${question}'.
		Give answer back in this json format: { strings: ['string1', 'string2', ...] }
		`;

    const result = await model.generateContent(prompt);

    const response = result.response;
    const text = response.text();

    return extractAndParseJsonString(text).strings;
  } catch (error) {
    console.error("Error running GenAI", error);

    return [];
  }
}

export function extractAndParseJsonString(input: string): {
  strings: string[];
} {
  try {
    // Find the first '{' and the last '}'
    const startIndex = input.indexOf("{");
    const endIndex = input.lastIndexOf("}");

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      console.error("Invalid JSON format");

      return { strings: [""] };
    }

    // Extract the JSON substring
    const jsonString = input.substring(startIndex, endIndex + 1);

    // Parse the JSON string
    const parsedObject = JSON.parse(jsonString);

    // Validate the structure of the parsed object
    if (parsedObject && Array.isArray(parsedObject.strings)) {
      return parsedObject;
    } else {
      console.error("Invalid JSON structure");

      return { strings: [""] };
    }
  } catch (error) {
    console.error("Error parsing JSON", error);

    return { strings: [""] };
  }
}
