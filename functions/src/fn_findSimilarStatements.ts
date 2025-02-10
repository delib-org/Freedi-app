import { GoogleGenerativeAI } from '@google/generative-ai';
import { Response, onInit, Request } from 'firebase-functions/v1';
import { db } from '.';
import 'dotenv/config';
import { Collections } from '../../src/types/enums';
import { Statement } from '../../src/types/statement';


export async function findSimilarStatements(
	request: Request,
	response: Response
) {
	try {
		const parsedBody = request.body;

		const { statementId, userInput, generateIfNeeded = 6 } = parsedBody;
		//generateIfNeeded is a boolean that indicates if we should generate similar statements if no similar statements are found


		const ref = db.collection(Collections.statements);
		const query = ref.where('parentId', '==', statementId);

		const subStatementsDB = await query.get();

		const subStatements = subStatementsDB.docs.map((doc) =>
			doc.data()
		) as Statement[];

		const statementsText = subStatements.map((subStatement) => ({
			statement: subStatement.statement,
			id: subStatement.statementId,
		}));

		if (statementsText.length === 0) {
			const similarStatements = await generateSimilar(userInput);
			response.status(200).send(similarStatements);

			return;
		}

		const genAiResponse = await runGenAI(
			statementsText.map((s) => s.statement),
			userInput,
			generateIfNeeded,
			5
		);

		const similarStatementsIds = statementsText
			.filter((subStatement) => genAiResponse.includes(subStatement.statement))
			.map((s) => s.id);

		const similarStatements = similarStatementsIds.map((id) => subStatements.find((subStatement) => subStatement.statementId === id)).filter((s) => s !== undefined);

		const remainingSimilarStatements = 5 - similarStatements.length;

		if (remainingSimilarStatements > 0) {

			const generated = await generateSimilar(userInput, remainingSimilarStatements);
			response.status(200).send({ optionsInDB: similarStatements, optionsGenerated: generated, userOption: { statement: userInput, statementId: null }, ok: true });
			return;
		}

		response.status(200).send({ optionsInDB: similarStatements, ok: true, userOption: { statement: userInput, statementId: null } });
	} catch (error: any) {
		response.status(500).send({ error: error.message, ok: false });
		console.error(error.message, { error });
		return;
	}
}

let genAI: GoogleGenerativeAI;

onInit(() => {
	try {
		if (!process.env.GOOGLE_API_KEY) {
			throw new Error('Missing GOOGLE_API_KEY environment variable');
		}

		genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
	} catch (error) {
		console.error('Error initializing GenAI', error);
	}
});

export async function runGenAI(allStatements: string[], userInput: string, generateIfNeeded?: boolean, numberOfSimilarStatements: number = 6) {
	try {
		console.log("runGenAI 2", allStatements, userInput, generateIfNeeded);
		const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

		const prompt = `
		Find up to ${numberOfSimilarStatements} sentences in the following strings:  ${allStatements},  that are similar to the user input '${userInput}'. 
		The use Input can be either in English or in Hebrew. Look for similar strings to the user input in both languages.
		Consider a match if the sentence shares at least 60% similarity in meaning the user input.
		Give answer back in this json format: { strings: ['string1', 'string2', ...] }
		`;

		const result = await model.generateContent(prompt);

		const response = result.response;
		const text = response.text();

		return extractAndParseJsonString(text).strings;
	} catch (error) {
		console.error('Error running GenAI', error);

		return [];
	}
}

export async function generateSimilar(userInput: string, remainingSimilarStatements: number = 5) {
	try {
		console.log("runGenAI 2", userInput,);
		const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

		const prompt = `
		create ${remainingSimilarStatements} similar sentences to the user input '${userInput}'.
		Give answer back in this json format: { strings: ['string1', 'string2', ...] }
		`;

		const result = await model.generateContent(prompt);

		const response = result.response;
		console.log("results:", response);
		const text = response.text();

		return extractAndParseJsonString(text).strings;
	} catch (error) {
		console.error('Error running GenAI', error);

		return [];
	}
}

function extractAndParseJsonString(input: string): { strings: string[] } {
	try {
		// Find the first '{' and the last '}'
		const startIndex = input.indexOf('{');
		const endIndex = input.lastIndexOf('}');

		if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
			console.error('Invalid JSON format');

			return { strings: [''] };
		}

		// Extract the JSON substring
		const jsonString = input.substring(startIndex, endIndex + 1);

		// Parse the JSON string
		const parsedObject = JSON.parse(jsonString);

		// Validate the structure of the parsed object
		if (parsedObject && Array.isArray(parsedObject.strings)) {
			return parsedObject;
		} else {
			console.error('Invalid JSON structure');

			return { strings: [''] };
		}
	} catch (error) {
		console.error('Error parsing JSON', error);

		return { strings: [''] };
	}
}
