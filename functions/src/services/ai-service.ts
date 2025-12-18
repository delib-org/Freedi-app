import {
  GenerativeModel,
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { logger } from "firebase-functions";
import "dotenv/config";
import { GEMINI_MODEL } from "../config/gemini";
import { notifyAIError } from "./error-notification-service";

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
    const modelName = GEMINI_MODEL;
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
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    };

    _generativeModel = genAI.getGenerativeModel(modelConfig);

    return _generativeModel;
  } catch (error) {
    logger.error("Error initializing GenerativeModel", error);
    const genAI = getGenAI();
    // Use the same model from environment or fall back to a supported model
    const fallbackModel = GEMINI_MODEL;
    logger.info(`Using fallback model: ${fallbackModel}`);
    _generativeModel = genAI.getGenerativeModel({ model: fallbackModel });

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
      logger.error("Invalid JSON format", { input: input.substring(0, 100) });

      return { strings: [] };
    }

    const jsonString = input.substring(startIndex, endIndex + 1);
    const parsedObject = JSON.parse(jsonString);

    if (parsedObject && Array.isArray(parsedObject.strings)) {
      return parsedObject;
    } else {
      logger.error("Invalid JSON structure", { input: input.substring(0, 100) });

      return { strings: [] };
    }
  } catch (error) {
    logger.error("Error parsing JSON", { error, input: input.substring(0, 100) });

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
        logger.error("Failed to parse AI response", { responseText: responseText.substring(0, 200), parseError });

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
    // Log error with full context for Error Reporting
    logger.error("AI request failed permanently", error instanceof Error ? error : new Error(errorMessage), {
      prompt: prompt.substring(0, 200) + "...",
      attempt,
      isRetryableError,
      model: GEMINI_MODEL,
    });

    // Send email notification to admin
    notifyAIError(errorMessage, {
      model: GEMINI_MODEL,
      prompt: prompt,
      attempt,
      functionName: "ai-service.handleError",
    }).catch((notifyError) => {
      logger.warn("Failed to send AI error notification", { notifyError });
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
    You are a content moderator for a collaborative discussion platform.
    Your job is to protect users from genuinely harmful content.

    Check if the following text contains ANY of these:
    - Profanity, curse words, or vulgar language
    - Slurs or derogatory terms targeting any group
    - Hate speech or discriminatory language
    - Personal attacks, insults, or harassment
    - Sexually explicit or suggestive content
    - Violence, threats, or harmful content
    - Spam or gibberish text

    Text to analyze: "${userInput}"

    IMPORTANT: Only flag content that is CLEARLY inappropriate. Normal suggestions, opinions, and ideas should be allowed even if they are unusual or you disagree with them. We want to minimize false positives.

    Return ONLY this JSON format (no markdown, no code blocks):
    - If clearly inappropriate: { "inappropriate": true }
    - If acceptable or unclear: { "inappropriate": false }
  `;

  try {
    // Use temperature 0 for deterministic, consistent content moderation
    const genAI = getGenAI();
    const moderationModel = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0, // Deterministic for consistent results
      },
    });

    const result = await moderationModel.generateContent(prompt);
    let responseText = result.response.text();

    // Strip markdown code blocks if present
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    logger.info("Content moderation response:", { responseText: responseText.substring(0, 200) });

    const parsed = JSON.parse(responseText);

    return {
      isInappropriate: parsed.inappropriate === true
    };
  } catch (error) {
    // Log the error for debugging
    logger.error("Error checking for inappropriate content:", error);

    // Check if the error is due to Google's safety filters blocking the content
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('SAFETY') || errorMessage.includes('blocked') || errorMessage.includes('harm')) {
      logger.warn("Content blocked by Google safety filters - treating as inappropriate");
      return { isInappropriate: true, error: "Content blocked by safety filters" };
    }

    // On error, allow the content through rather than blocking legitimate content
    // The actual content safety is also handled by Google's AI safety filters
    logger.warn("Content moderation failed, allowing content through");

    return { isInappropriate: false, error: "Unable to verify content - allowing through" };
  }
}
/**
 * Finds existing statements that are semantically similar to the user's input.
 * @deprecated Use findSimilarStatementsByIds instead for more reliable matching
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

interface StatementWithId {
  id: string;
  text: string;
}

/**
 * Finds existing statements that are semantically similar to the user's input.
 * Returns statement IDs directly to avoid text matching issues.
 */
export async function findSimilarStatementsByIds(
  statements: StatementWithId[],
  userInput: string,
  question: string,
  numberOfSimilarStatements: number = 6
): Promise<string[]> {
  if (statements.length === 0) {
    logger.info("No existing statements to compare against");
    return [];
  }

  // Format statements as numbered list with IDs for the AI
  const statementsForAI = statements.map((s, i) => `[${s.id}]: "${s.text}"`).join('\n');

  const prompt = `You are helping find similar suggestions in a collaborative platform.

USER'S NEW SUGGESTION: "${userInput}"

CONTEXT/QUESTION: "${question}"

EXISTING SUGGESTIONS (format: [ID]: "text"):
${statementsForAI}

TASK: Find up to ${numberOfSimilarStatements} existing suggestions that are semantically similar to the user's new suggestion.
Consider suggestions with 60%+ meaning similarity - they discuss the same topic, propose similar solutions, or express similar ideas.

IMPORTANT: Return ONLY the IDs of similar suggestions, not the text.

Return JSON format: {"ids": ["id1", "id2", ...]}
If no similar suggestions found, return: {"ids": []}`;

  try {
    const model = await getGenerativeAIModel();
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // Strip markdown code blocks if present
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    logger.info("AI similarity response:", { responseText: responseText.substring(0, 200) });

    const parsed = JSON.parse(responseText);

    if (Array.isArray(parsed.ids)) {
      // Validate that returned IDs exist in our statements
      const validIds = parsed.ids.filter((id: string) =>
        statements.some(s => s.id === id)
      );

      logger.info(`AI found ${parsed.ids.length} similar, ${validIds.length} valid IDs`);

      return validIds;
    }

    return [];
  } catch (error) {
    logger.error("Error in findSimilarStatementsByIds:", error);
    return [];
  }
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
        6. Preserve the full title without truncation - do not shorten or cut off the title
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
        7. Preserve the full title without truncation - do not shorten or cut off the title
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
 * Generates a concise title and description from user's solution text
 * @param userInput - The full text input from the user
 * @param questionContext - The question/topic the solution is responding to
 * @returns Object containing generated title and description
 */
export async function generateTitleAndDescription(
  userInput: string,
  questionContext: string
): Promise<{ title: string; description: string }> {
  try {
    // Detect language
    const isHebrew = /[\u0590-\u05FF]/.test(userInput);

    const prompt = isHebrew
      ? `צור כותרת ותיאור עבור ההצעה הבאה. הם חייבים להיות שונים זה מזה.

ההצעה: "${userInput}"
${questionContext ? `הקשר: "${questionContext}"` : ""}

כללים חשובים:
1. כותרת: נסח מחדש את הרעיון במילים אחרות - אל תקצר או תחתוך, שמור על המשמעות המלאה
2. תיאור: ארוך יותר, התחל עם "הצעה ל" ואז הסבר את היתרונות

דוגמאות:
- קלט: "נלך לאכול פיצה"
  {"title": "ארוחה איטלקית משותפת", "description": "הצעה לצאת לאכול פיצה ביחד - הזדמנות נהדרת לבילוי משפחתי טעים"}

- קלט: "נצא לטיול בטבע"
  {"title": "יציאה לחיק הטבע", "description": "הצעה לצאת לטיול בטבע - דרך מצוינת להתאוורר וליהנות מהנוף היפה"}

- קלט: "נשחק משחק לוח"
  {"title": "ערב משחקים", "description": "הצעה לשחק משחק לוח יחד - פעילות מהנה שמחזקת את הקשר המשפחתי"}

החזר JSON בלבד:`
      : `Create a title and description for this proposal. They MUST be different.

Proposal: "${userInput}"
${questionContext ? `Context: "${questionContext}"` : ""}

IMPORTANT RULES:
1. TITLE: Rephrase the idea in different words - do NOT truncate or shorten, preserve the full meaning
2. DESCRIPTION: Longer, start with "Proposal to" and explain benefits

Examples:
- Input: "Let's go eat pizza"
  {"title": "Italian dining outing", "description": "Proposal to go eat pizza together - a great opportunity for a delicious family meal"}

- Input: "Watch a movie together"
  {"title": "Cinema night", "description": "Proposal to watch a movie as a family - a fun and relaxing activity for everyone"}

- Input: "Play a board game"
  {"title": "Game night activity", "description": "Proposal to play a board game together - an enjoyable way to bond and have fun"}

Return JSON ONLY:`;

    // Use higher temperature for creative title/description generation
    const genAI = getGenAI();
    const creativeModel = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8, // Higher temperature for creative, varied output
      },
    });

    const model = creativeModel;
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    logger.info("=== AI generateTitleAndDescription ===");
    logger.info(`User input: ${userInput.substring(0, 50)}`);
    logger.info(`Raw AI response: ${responseText.substring(0, 200)}`);

    // Strip markdown code blocks if present
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    try {
      const parsed = JSON.parse(responseText);

      logger.info(`Parsed title: ${parsed.title}`);
      logger.info(`Parsed description: ${parsed.description}`);
      logger.info(`Title === Description? ${parsed.title === parsed.description}`);

      if (parsed.title && typeof parsed.title === "string" &&
          parsed.description && typeof parsed.description === "string" &&
          parsed.title !== parsed.description) {
        logger.info("Using AI-generated values (different title/description)");
        return {
          title: parsed.title,
          description: parsed.description,
        };
      }

      // Fallback: create different title and description
      logger.warn("AI returned invalid or identical values, using fallback");
      const fallback = createFallbackTitleDescription(userInput);
      logger.info(`Fallback title: ${fallback.title}`);
      logger.info(`Fallback description: ${fallback.description}`);

      return fallback;
    } catch {
      logger.error("Failed to parse AI response for title/description:", responseText);

      return createFallbackTitleDescription(userInput);
    }
  } catch (error) {
    logger.error("Error generating title and description:", error);

    return createFallbackTitleDescription(userInput);
  }
}

/**
 * Creates fallback title and description that are always different
 * Note: Does NOT truncate the title - preserves full user input
 */
function createFallbackTitleDescription(userInput: string): { title: string; description: string } {
  // Always use full user input as title without truncation
  const isHebrew = /[\u0590-\u05FF]/.test(userInput);
  const descriptionPrefix = isHebrew ? "הצעה זו מציעה" : "This suggestion proposes";

  return {
    title: userInput,
    description: `${descriptionPrefix}: ${userInput}`,
  };
}

/**
 * Detected suggestion from multi-suggestion detection
 */
export interface DetectedSuggestion {
  title: string;
  description: string;
  originalText: string;
}

/**
 * Result of multi-suggestion detection
 */
export interface MultiSuggestionDetectionResult {
  isMultiple: boolean;
  suggestions: DetectedSuggestion[];
}

/**
 * Detects if user input contains multiple suggestions and splits them
 * @param userInput - The user's input text
 * @param questionContext - The question/topic context for better understanding
 * @returns Object indicating if multiple suggestions detected and the split suggestions
 */
export async function detectAndSplitMultipleSuggestions(
  userInput: string,
  questionContext: string
): Promise<MultiSuggestionDetectionResult> {
  try {
    // Detect language for appropriate response
    const isHebrew = /[\u0590-\u05FF]/.test(userInput);

    const prompt = isHebrew
      ? `בדוק אם הטקסט הבא מכיל מספר הצעות/רעיונות נפרדים.

קלט המשתמש: "${userInput}"
${questionContext ? `הקשר/שאלה: "${questionContext}"` : ""}

משימה:
1. קבע אם הקלט מכיל יותר מהצעה/רעיון אחד
2. אם יש מספר הצעות, פצל אותן להצעות נפרדות
3. לכל הצעה, תן כותרת מלאה (ללא קיצור) ותיאור מורחב

כללים:
- סמן כמרובה רק אם יש רעיונות נפרדים באמת (לא רק פרטים של רעיון אחד)
- חפש מפרידים כמו: פסיקים, "ו", רשימות ממוספרות, נקודות
- כל הצעה מפוצלת צריכה להיות עצמאית ומשמעותית
- שמור על השפה המקורית

החזר JSON בפורמט:
{
  "isMultiple": true/false,
  "suggestions": [
    {
      "title": "כותרת קצרה לרעיון הראשון",
      "description": "תיאור מורחב של הרעיון הראשון",
      "originalText": "החלק מהטקסט המקורי שממנו נלקח"
    }
  ]
}

אם זו הצעה בודדת, החזר: {"isMultiple": false, "suggestions": []}`
      : `Analyze if the following text contains multiple separate suggestions/ideas.

USER INPUT: "${userInput}"
${questionContext ? `CONTEXT/QUESTION: "${questionContext}"` : ""}

TASK:
1. Determine if the input contains MORE THAN ONE distinct suggestion/idea
2. If multiple suggestions exist, split them into separate proposals
3. For each suggestion, provide a full title (do not truncate) and expanded description

RULES:
- Only flag as multiple if there are truly DISTINCT ideas (not just details of one idea)
- Look for separators like: commas, "and", numbered lists, bullet points
- Each split suggestion should be self-contained and meaningful
- Preserve the original language

Return JSON format:
{
  "isMultiple": true/false,
  "suggestions": [
    {
      "title": "Short title for first idea",
      "description": "Expanded description of the first idea",
      "originalText": "The portion of the original text this came from"
    }
  ]
}

If NOT multiple suggestions (single idea), return: {"isMultiple": false, "suggestions": []}`;

    const model = await getGenerativeAIModel();
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // Strip markdown code blocks if present
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    logger.info("Multi-suggestion detection response:", { responseText: responseText.substring(0, 300) });

    const parsed = JSON.parse(responseText);

    if (typeof parsed.isMultiple === "boolean" && Array.isArray(parsed.suggestions)) {
      // Validate suggestions have required fields
      const validSuggestions = parsed.suggestions.filter(
        (s: DetectedSuggestion) =>
          typeof s.title === "string" &&
          typeof s.description === "string" &&
          s.title.length > 0
      );

      return {
        isMultiple: parsed.isMultiple && validSuggestions.length > 1,
        suggestions: validSuggestions,
      };
    }

    return { isMultiple: false, suggestions: [] };
  } catch (error) {
    logger.error("Error in detectAndSplitMultipleSuggestions:", error);
    return { isMultiple: false, suggestions: [] };
  }
}

/**
 * Paragraph with source information for merge operations
 */
export interface ParagraphForMerge {
  content: string;
  sourceStatementId?: string;
}

/**
 * Result of merging paragraphs
 */
export interface MergeParagraphsResult {
  paragraphs: ParagraphForMerge[];
  newTitle: string;
}

/**
 * Merges new content into existing paragraphs and generates a new title
 * The AI reorganizes all content into a coherent document
 * @param existingParagraphs - Current paragraphs of the target statement
 * @param newContent - The new user's suggestion text
 * @param newStatementId - ID of the source statement being merged
 * @param questionContext - The question/topic for context
 * @returns Reorganized paragraphs and new title reflecting all content
 */
export async function mergeAndReorganizeParagraphs(
  existingParagraphs: ParagraphForMerge[],
  newContent: string,
  newStatementId: string,
  questionContext: string
): Promise<MergeParagraphsResult> {
  try {
    const isHebrew = /[\u0590-\u05FF]/.test(newContent) ||
      existingParagraphs.some(p => /[\u0590-\u05FF]/.test(p.content));

    // Format existing paragraphs for the AI
    const existingContent = existingParagraphs
      .map((p, i) => `[${i + 1}] ${p.content}`)
      .join('\n');

    const prompt = isHebrew
      ? `אתה עורך תוכן שמאחד הצעות דומות למסמך קוהרנטי אחד.

תוכן קיים (פסקאות):
${existingContent || "(ריק)"}

תוכן חדש להוספה:
"${newContent}"

הקשר/שאלה: "${questionContext}"

משימה:
1. שלב את התוכן החדש עם הפסקאות הקיימות
2. ארגן מחדש לזרימה הגיונית וקוהרנטית
3. הסר כפילויות אבל שמור על כל הרעיונות הייחודיים
4. צור כותרת חדשה שמשקפת את כל התוכן המאוחד

כללים:
- שמור על כל הרעיונות הייחודיים מכל המקורות
- ארגן בסדר הגיוני (לא בהכרח לפי סדר ההגעה)
- התוכן החדש צריך להשתלב בצורה טבעית
- הכותרת חייבת לשקף את מגוון הרעיונות

החזר JSON בפורמט:
{
  "paragraphs": [
    {"content": "פסקה ראשונה...", "isNew": false},
    {"content": "פסקה שניה...", "isNew": true},
    ...
  ],
  "newTitle": "כותרת שמשקפת את כל התוכן"
}`
      : `You are a content editor merging similar proposals into one coherent document.

EXISTING CONTENT (paragraphs):
${existingContent || "(empty)"}

NEW CONTENT TO ADD:
"${newContent}"

CONTEXT/QUESTION: "${questionContext}"

TASK:
1. Integrate the new content with existing paragraphs
2. Reorganize into a logical, coherent flow
3. Remove duplicates but preserve all unique ideas
4. Generate a new title that reflects ALL merged content

RULES:
- Preserve all unique ideas from all sources
- Organize in logical order (not necessarily chronological)
- New content should integrate naturally
- Title MUST reflect the variety of ideas

Return JSON format:
{
  "paragraphs": [
    {"content": "First paragraph...", "isNew": false},
    {"content": "Second paragraph...", "isNew": true},
    ...
  ],
  "newTitle": "Title reflecting all content"
}`;

    const model = await getGenerativeAIModel();
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // Strip markdown code blocks if present
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    logger.info("Merge paragraphs response:", { responseText: responseText.substring(0, 300) });

    const parsed = JSON.parse(responseText);

    if (Array.isArray(parsed.paragraphs) && typeof parsed.newTitle === "string") {
      // Map parsed paragraphs to include sourceStatementId
      const mergedParagraphs: ParagraphForMerge[] = parsed.paragraphs.map(
        (p: { content: string; isNew: boolean }) => ({
          content: p.content,
          // If it's new content, mark it with the source statement ID
          sourceStatementId: p.isNew ? newStatementId : undefined,
        })
      );

      // Preserve sourceStatementId from existing paragraphs where possible
      // by matching content (AI might reorder but content should be similar)
      for (const merged of mergedParagraphs) {
        if (!merged.sourceStatementId) {
          const matchingExisting = existingParagraphs.find(
            ep => ep.content === merged.content || merged.content.includes(ep.content)
          );
          if (matchingExisting?.sourceStatementId) {
            merged.sourceStatementId = matchingExisting.sourceStatementId;
          }
        }
      }

      return {
        paragraphs: mergedParagraphs,
        newTitle: parsed.newTitle,
      };
    }

    // Fallback: just append the new content
    logger.warn("AI merge failed, using fallback append");

    return createFallbackMerge(existingParagraphs, newContent, newStatementId);
  } catch (error) {
    logger.error("Error in mergeAndReorganizeParagraphs:", error);

    return createFallbackMerge(existingParagraphs, newContent, newStatementId);
  }
}

/**
 * Fallback merge when AI fails - simply appends new content
 */
function createFallbackMerge(
  existingParagraphs: ParagraphForMerge[],
  newContent: string,
  newStatementId: string
): MergeParagraphsResult {
  const existingTitle = existingParagraphs[0]?.content || "";
  const isHebrew = /[\u0590-\u05FF]/.test(newContent);

  return {
    paragraphs: [
      ...existingParagraphs,
      {
        content: newContent,
        sourceStatementId: newStatementId,
      },
    ],
    newTitle: existingTitle + (isHebrew ? " ועוד" : " and more"),
  };
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
