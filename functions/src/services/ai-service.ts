import {
  GenerativeModel,
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
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
    const modelName = process.env.AI_MODEL_NAME || "gemini-1.5-flash";
    logger.info(`Using AI model: ${modelName}`);

    const genAI = getGenAI();

    const modelConfig = {
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3, // Lower temperature for faster, more deterministic responses
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
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
export function extractAndParseJsonString(input: string): {
  strings: string[];
} {
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
async function getAIResponseAsList(
  prompt: string,
  maxRetries: number = 3
): Promise<string[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = await getGenerativeAIModel();
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Handle both strings or error
      try {
        const parsed = JSON.parse(responseText);

        if (Array.isArray(parsed.strings)) {
          return parsed.strings;
        }

        return [];
      } catch (parseError) {
        console.error("Failed to parse AI response:", responseText, parseError);

        return [];
      }
    } catch (error: unknown) {
      if (!(await handleError(error, attempt, maxRetries, prompt))) break;
    }
  }

  return [];
}

async function handleError(
  error: unknown,
  attempt: number,
  maxRetries: number,
  prompt: string
): Promise<boolean> {
  const errorMessage =
    error instanceof Error ? error.message : JSON.stringify(error);
  const apiError = error as APIError;
  const errorStatus = apiError?.status;
  const errorStatusText = apiError?.statusText;

  logger.warn(`AI request failed on attempt ${attempt}/${maxRetries}`, {
    error: errorMessage,
    status: errorStatus,
    statusText: errorStatusText,
  });

  const isRetryableError =
    errorStatus === 503 ||
    errorStatus === 429 ||
    errorStatus === 500 ||
    apiError?.code === "NETWORK_ERROR" ||
    errorMessage?.includes("fetch");

  if (!isRetryableError || attempt === maxRetries) {
    logger.error("AI request failed permanently", {
      error: errorMessage,
      prompt: prompt.substring(0, 200) + "...",
      attempt,
      isRetryableError,
    });

    return false;
  }

  const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
  logger.info(`Waiting ${waitTime}ms before retry...`);
  await new Promise((resolve) => setTimeout(resolve, waitTime));

  return true;
}
export async function checkForInappropriateContent(userInput: string): Promise<{ isInappropriate: boolean; error?: string }> {
  const prompt = `
    You are a content moderator. Check if the following text contains any profanity, slurs, hate speech, sexually explicit language, or any other inappropriate content: "${userInput}"
    
    Return ONLY this JSON format:
    - If inappropriate: { "inappropriate": true }
    - If clean: { "inappropriate": false }
  `;

  try {
    const model = await getGenerativeAIModel();
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const parsed = JSON.parse(responseText);
    
    return { 
      isInappropriate: parsed.inappropriate === true 
    };
  } catch (error) {
    logger.error("Error checking for inappropriate content:", error);
    // If we can't check, assume it's inappropriate to be safe

    return { isInappropriate: true, error: "Unable to verify content" };
  }
}
/**
 * Finds existing statements that are semantically similar to the user's input.
 */
export async function findSimilarStatementsAI(
  allStatements: string[],
  userInput: string,
  question: string,
  numberOfSimilarStatements: number = 6
): Promise<string[]> {
  // Only optimize the prompt format and processing, not the scope
  const prompt = `Find up to ${numberOfSimilarStatements} similar sentences to "${userInput}" from: ${JSON.stringify(allStatements)}
Consider 60%+ meaning similarity. Context: "${question}"
Return JSON: {"strings": ["match1", "match2"...]}`;

  return getAIResponseAsList(prompt);
}

/**
 * Generates new statements that are similar to the user's input.
 * not being used for now
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

/**
 * Improves a suggestion title and description using AI, with optional user instructions
 * @param title - The original suggestion title
 * @param description - The original suggestion description (optional)
 * @param instructions - Optional user instructions for improvement
 * @param parentTitle - The parent statement's title (question) for context
 * @param parentDescription - The parent statement's description for context
 * @returns Object containing improved title, description and detected language
 */
export async function improveSuggestion(
  title: string,
  description?: string,
  instructions?: string,
  parentTitle?: string,
  parentDescription?: string
): Promise<{ improvedTitle: string; improvedDescription?: string; detectedLanguage: string }> {
  try {
    // Always detect language from the title (or description if title is too short)
    const textForDetection = title.length > 10 ? title : (description || title);
    const detectedLanguage = await detectLanguage(textForDetection);

    let prompt: string;

    // Include parent context if available
    const parentContext = parentTitle ? `
        Context - This suggestion is responding to the following question/topic:
        Question: "${parentTitle}"
        ${parentDescription ? `Additional context: "${parentDescription}"` : ""}

        ` : "";

    if (instructions && instructions.trim()) {
      // User provided specific instructions
      prompt = `
        ${parentContext}
        Improve the following suggestion according to these specific instructions: "${instructions}"

        Original suggestion title: "${title}"
        ${description ? `Original suggestion description: "${description}"` : ""}

        Requirements:
        1. Follow the user's instructions carefully
        2. Maintain the original meaning and intent
        3. Write the improved version in ${detectedLanguage || "the same language as the original"}
        4. Make the text clearer and more articulate
        5. Ensure proper grammar and structure
        6. Keep the title concise and impactful
        7. If there's a description, make it more detailed and explanatory
        8. Ensure the suggestion is relevant to the question/topic provided in the context

        Return ONLY a JSON object with this format:
        {
          "improvedTitle": "improved title here",
          ${description ? '"improvedDescription": "improved description here"' : ""}
        }
      `;
    } else {
      // Automatic improvement without instructions
      prompt = `
        ${parentContext}
        Improve the following suggestion to make it clearer, more articulate, and better structured:

        Original suggestion title: "${title}"
        ${description ? `Original suggestion description: "${description}"` : ""}

        Requirements:
        1. Enhance clarity and readability
        2. Improve grammar and sentence structure
        3. Make the point more compelling and well-articulated
        4. Maintain the original meaning and intent
        5. Keep the same tone and style
        6. Write in ${detectedLanguage || "the same language as the original"}
        7. Keep the title concise and impactful (usually under 100 characters)
        8. If there's a description, expand it to provide more context and details
        9. Ensure the suggestion directly addresses the question/topic provided in the context

        Return ONLY a JSON object with this format:
        {
          "improvedTitle": "improved title here",
          ${description ? '"improvedDescription": "improved description here"' : ""}
        }
      `;
    }

    const model = await getGenerativeAIModel();
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    try {
      const parsed = JSON.parse(responseText);

      if (parsed.improvedTitle && typeof parsed.improvedTitle === "string") {
        return {
          improvedTitle: parsed.improvedTitle,
          improvedDescription: parsed.improvedDescription,
          detectedLanguage: detectedLanguage || "en",
        };
      }

      throw new Error("Invalid response format from AI");
    } catch {
      logger.error("Failed to parse AI response for improvement:", responseText);
      throw new Error("Failed to parse improvement response");
    }
  } catch (error) {
    logger.error("Error improving suggestion:", error);
    throw error;
  }
}

/**
 * Detects the language of the given text
 * @param text - Text to detect language for
 * @returns Language code (e.g., "en", "he", "es")
 */
async function detectLanguage(text: string): Promise<string> {
  try {
    const prompt = `
      Detect the language of this text: "${text}"

      Return ONLY a JSON object with the ISO 639-1 language code:
      { "language": "xx" }

      Examples:
      - English: "en"
      - Hebrew: "he"
      - Spanish: "es"
      - German: "de"
      - Dutch: "nl"
      - Arabic: "ar"
    `;

    const model = await getGenerativeAIModel();
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    try {
      const parsed = JSON.parse(responseText);

      return parsed.language || "en";
    } catch {
      logger.warn("Failed to detect language, defaulting to English");

      return "en";
    }
  } catch (error) {
    logger.error("Error detecting language:", error);

    return "en"; // Default to English on error
  }
}
