import { GoogleGenerativeAI } from '@google/generative-ai';
import { Response, onInit, Request } from 'firebase-functions/v1';
import { db } from '.';
import 'dotenv/config';
import { Collections } from '../../src/types/TypeEnums';
import { Statement } from '../../src/types/statement/Statement';

export async function findSimilarStatements(
	request: Request,
	response: Response
) {
	try {
		const numberOfOptionsToGenerate = 5;
		const parsedBody = request.body;

		const { statementId, userInput, generateIfNeeded = 6 } = parsedBody;
		//generateIfNeeded is a boolean that indicates if we should generate similar statements if no similar statements are found

		const ref = db.collection(Collections.statements);
		const query = ref.where('parentId', '==', statementId);

		const subStatementsDB = await query.get();

		const subStatements = subStatementsDB.docs.map((doc) =>
			doc.data()
		) as Statement[];

		const statementSimple: { statement: string, id: string }[] = subStatements.map((subStatement) => ({
			statement: subStatement.statement,
			id: subStatement.statementId,
		}));

		//if no options on the DB generate similar options by AI
		if (statementSimple.length === 0) {
			const textsByAI = await generateSimilar(userInput, numberOfOptionsToGenerate);
			response.status(200).send({ similarTexts: textsByAI, ok: true, userText: userInput });

			return;
		}

		//if there are options in the DB
		const _similarStatementsAI: string[] = await findSimilarStatementsAI(
			statementSimple.map((s) => s.statement),
			userInput,
			generateIfNeeded,
			numberOfOptionsToGenerate
		);

		const similarStatements = getStatementsFromTextsOfStatements(statementSimple, _similarStatementsAI, subStatements);

		const statementsLeftToGenerate = numberOfOptionsToGenerate - similarStatements.length;

		//if there are not enough similar statements in the DB and we need to generate more
		if (statementsLeftToGenerate > 0) {
			const generated: string[] = await generateSimilar(
				userInput,
				statementsLeftToGenerate
			);

			response.status(200).send({
				similarStatements,
				similarTexts: generated,
				userText: userInput,
				ok: true,
			});

			return;
		}

		// If there are enough similar statements in the DB send them

		response.status(200).send({
			similarStatements,
			ok: true,
			userText: userInput,
		});
	} catch (error) {
		response.status(500).send({ error: error, ok: false });
		console.error('error', { error });

		return;
	}

	function getStatementsFromTextsOfStatements(statementSimple: { statement: string; id: string; }[], _similarStatementsAI: string[], subStatements: Statement[]): Statement[] {
		const similarStatementsIds = statementSimple
			.filter((subStatement) => _similarStatementsAI.includes(subStatement.statement)
			)
			.map((s) => s.id);

		const statements = similarStatementsIds
			.map((id) => subStatements.find(
				(subStatement) => subStatement.statementId === id
			)
			)
			.filter((s) => s !== undefined);
		
return statements;
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

export async function findSimilarStatementsAI(
	allStatements: string[],
	userInput: string,
	generateIfNeeded?: boolean,
	numberOfSimilarStatements: number = 6
) {
	try {
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

export async function generateSimilar(
	userInput: string,
	optionsToBeGeneratedByAI: number = 5
): Promise<string[]> {
	try {
		const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

		const prompt = `
		create ${optionsToBeGeneratedByAI} similar sentences to the user input '${userInput}'.
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
