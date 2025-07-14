import { GenerativeModel, GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { logger } from "firebase-functions";
import "dotenv/config";

interface APIError {
	status?: number;
	statusText?: string;
	code?: string;
	message?: string;
}

/**
 * A cached singleton instance of the GenerativeModel.
 */
let _generativeModel: GenerativeModel | null = null;

/**
 * Get the GoogleGenerativeAI instance
 */
function getGenAI(): GoogleGenerativeAI {
	const apiKey = process.env.GOOGLE_API_KEY;

	if (!apiKey) {
		throw new Error("Missing GOOGLE_API_KEY environment variable");
	}

	return new GoogleGenerativeAI(apiKey);
}

/**
 * Initializes and retrieves the Generative AI model.
 */
async function getGenerativeAIModel(): Promise<GenerativeModel> {
	if (_generativeModel) {
		return _generativeModel;
	}

	logger.info("Initializing new GenerativeModel instance...");

	try {
		const modelName = process.env.AI_MODEL_NAME || "gemini-2.5-flash";
		logger.info(`Using AI model: ${modelName}`);

		const genAI = getGenAI();

		const modelConfig = {
			model: modelName,
			generationConfig: {
				responseMimeType: "application/json",
				temperature: 0.7,
			},
			safetySettings: [{
				category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
				threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
			},],
		};

		_generativeModel = genAI.getGenerativeModel(modelConfig);

		return _generativeModel;
	} catch (error) {
		logger.error("Error initializing GenerativeModel", error);
		const genAI = getGenAI();
		_generativeModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

		return _generativeModel;
	}
}

/**
 * Extract and parse JSON string from AI response
 */
export function extractAndParseJsonString(input: string): { strings: string[] } {
	try {
		const startIndex = input.indexOf("{");
		const endIndex = input.lastIndexOf("}");

		if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
			console.error("Invalid JSON format");

			return { strings: [] };
		}

		const jsonString = input.substring(startIndex, endIndex + 1);
		const parsedObject = JSON.parse(jsonString);

		if (parsedObject && Array.isArray(parsedObject.strings)) {
			return parsedObject;
		} else {
			console.error("Invalid JSON structure");

			return { strings: [] };
		}
	} catch (error) {
		console.error("Error parsing JSON", error);

		return { strings: [] };
	}
}

/**
 * A helper function to call the AI model with a given prompt and parse the JSON response.
 * Includes retry logic for handling temporary service unavailability.
 */
async function getAIResponseAsList(prompt: string, maxRetries: number = 3): Promise<string[]> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const model = await getGenerativeAIModel();

			logger.info(`AI request attempt ${attempt}/${maxRetries}`);

			const result = await model.generateContent(prompt);
			console.log("result:", result.response);
			const responseText = result.response.text();
			console.log(responseText)
			// Try to parse as JSON first
			try {
				const parsedJson = JSON.parse(responseText);
				console.log("Parsed JSON:", parsedJson);
				if (parsedJson && Array.isArray(parsedJson.strings)) {
					logger.info(`AI request successful on attempt ${attempt}`);

					console.log("Parsed JSON strings:", parsedJson.strings);

					return parsedJson.strings;
				}
			} catch {
				// If JSON parsing fails, try the extraction method
				const extracted = extractAndParseJsonString(responseText);
				if (extracted.strings.length > 0) {
					logger.info(`AI request successful on attempt ${attempt} (with extraction)`);

					return extracted.strings;
				}
			}

			logger.warn("AI response was not in the expected format.", { responseText, attempt });

			// If we got a response but it wasn't in the right format, don't retry
			return [];

		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const apiError = error as APIError;
			const errorStatus = apiError?.status;
			const errorStatusText = apiError?.statusText;

			logger.warn(`AI request failed on attempt ${attempt}/${maxRetries}`, {
				error: errorMessage,
				status: errorStatus,
				statusText: errorStatusText
			});

			// Check if it's a retryable error (503, 429, network issues)
			const isRetryableError =
				errorStatus === 503 || // Service Unavailable
				errorStatus === 429 || // Too Many Requests
				errorStatus === 500 || // Internal Server Error
				apiError?.code === 'NETWORK_ERROR' ||
				errorMessage?.includes('fetch');

			if (!isRetryableError || attempt === maxRetries) {
				logger.error("AI request failed permanently", {
					error: errorMessage,
					prompt: prompt.substring(0, 200) + "...",
					attempt,
					isRetryableError
				});
				break;
			}

			// Wait before retrying (exponential backoff)
			const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
			logger.info(`Waiting ${waitTime}ms before retry...`);
			await new Promise(resolve => setTimeout(resolve, waitTime));
		}
	}

	return [];
}

/**
 * Finds existing statements that are semantically similar to the user's input.
 */
export async function findSimilarStatementsAI(
	allStatements: string[],
	userInput: string,
	question: string,
	generateIfNeeded?: boolean,
	numberOfSimilarStatements: number = 6
): Promise<string[]> {
	const prompt = `
		Find up to ${numberOfSimilarStatements} sentences in the following strings: ${JSON.stringify(allStatements)} that are similar to the user input '${userInput}'. 
		The user input can be either in English or in Hebrew. Look for similar strings to the user input in both languages.
		Consider a match if the sentence shares at least 60% similarity in meaning. The user input here is the question the user was asked: '${question}'.
		
		Return your answer ONLY as a JSON object in the following format: { "strings": ["similar_string_1", "similar_string_2", ...] }
	`;

	return getAIResponseAsList(prompt);
}

/**
 * Generates new statements that are similar to the user's input.
 */
export async function generateSimilar(
	userInput: string,
	question: string,
	optionsToBeGeneratedByAI: number = 5
): Promise<string[]> {
	const prompt = `
		Create ${optionsToBeGeneratedByAI} similar sentences to the user input '${userInput}'. Try to keep it in the same spirit of the user input but never the same.
		Here is the question the user was asked: '${question}'.
		
		Return your answer ONLY as a JSON object in the following format: { "strings": ["generated_string_1", "generated_string_2", ...] }
	`;

	return getAIResponseAsList(prompt);
}
