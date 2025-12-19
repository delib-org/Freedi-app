import { GenerativeModel, GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { logger } from "firebase-functions";
import { GEMINI_MODEL } from "../config/gemini";
import { Statement, StatementEvaluation } from "@freedi/shared-types";
import { getParagraphsText } from "../helpers";

/**
 * Statement with evaluation data for integration
 */
export interface StatementWithEvaluation {
	statementId: string;
	statement: string;
	paragraphsText?: string;
	numberOfEvaluators: number;
	consensus: number;
	sumEvaluations: number;
}

/**
 * Result of finding similar statements for integration
 */
export interface SimilarForIntegrationResult {
	sourceStatement: StatementWithEvaluation;
	similarStatements: StatementWithEvaluation[];
}

/**
 * Result of generating an integrated suggestion
 */
export interface IntegratedSuggestionResult {
	title: string;
	description: string;
}

/**
 * A cached singleton instance of the GenerativeModel.
 */
let _integrationModel: GenerativeModel | null = null;

/**
 * Get the GoogleGenerativeAI instance
 */
function getGenAI(): GoogleGenerativeAI {
	const apiKey = process.env.GEMINI_API_KEY;

	if (!apiKey) {
		throw new Error("Missing GEMINI_API_KEY environment variable");
	}

	return new GoogleGenerativeAI(apiKey);
}

/**
 * Initializes and retrieves the Generative AI model for integration tasks.
 */
async function getIntegrationModel(): Promise<GenerativeModel> {
	if (_integrationModel) {
		return _integrationModel;
	}

	logger.info("Initializing GenerativeModel for integration...");

	try {
		const genAI = getGenAI();

		const modelConfig = {
			model: GEMINI_MODEL,
			generationConfig: {
				responseMimeType: "application/json",
				temperature: 0.4, // Slightly higher for creative merging
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

		_integrationModel = genAI.getGenerativeModel(modelConfig);

		return _integrationModel;
	} catch (error) {
		logger.error("Error initializing integration model", error);
		throw error;
	}
}

/**
 * Combined result type for finding similar and generating suggestion
 */
interface FindAndGenerateResult {
	similarStatements: StatementWithEvaluation[];
	suggestedTitle?: string;
	suggestedDescription?: string;
}

/**
 * OPTIMIZED: Single AI call to find similar statements AND generate merged suggestion
 * This combines what was previously two separate API calls for better performance
 */
export async function findSimilarAndGenerateSuggestion(
	targetStatement: Statement,
	allStatements: Statement[],
	questionContext: string
): Promise<FindAndGenerateResult> {
	// Filter out the target statement and hidden statements
	const otherStatements = allStatements.filter(
		(s) => s.statementId !== targetStatement.statementId && !s.hide
	);

	if (otherStatements.length === 0) {
		logger.info("No other statements to compare against");
		return { similarStatements: [] };
	}

	// Format statements compactly for AI
	const statementsForAI = otherStatements.map((s) => ({
		id: s.statementId,
		t: s.statement, // title
		d: getParagraphsText(s.paragraphs), // paragraphs text
		e: (s.evaluation as { numberOfEvaluators?: number })?.numberOfEvaluators || s.totalEvaluators || 0, // evaluators
	}));

	// Detect language for output
	const isHebrew = /[\u0590-\u05FF]/.test(targetStatement.statement);
	const isArabic = /[\u0600-\u06FF]/.test(targetStatement.statement);
	const langHint = isHebrew ? "Output in Hebrew." : isArabic ? "Output in Arabic." : "";

	// Single optimized prompt for both tasks
	const prompt = `Find similar suggestions to merge and generate a merged version.

TARGET: "${targetStatement.statement}"${getParagraphsText(targetStatement.paragraphs) ? ` - ${getParagraphsText(targetStatement.paragraphs)}` : ""}
CONTEXT: "${questionContext}"

CANDIDATES (id, title, desc, evaluators):
${statementsForAI.map((s) => `${s.id}|${s.t}|${s.d}|${s.e}`).join("\n")}

TASK:
1. Find IDs with 60%+ semantic similarity to TARGET
2. If found, generate merged title (<100 chars) and description (10-50 words) combining TARGET + similar ones. Weight by evaluator count. ${langHint}

JSON: {"similarIds":["id1"...],"mergedTitle":"...","mergedDesc":"..."}
If none similar: {"similarIds":[],"mergedTitle":"","mergedDesc":""}`;

	try {
		const model = await getIntegrationModel();
		const result = await model.generateContent(prompt);
		let responseText = result.response.text();

		// Strip markdown code blocks if present
		responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

		logger.info("AI integration response:", { len: responseText.length });

		const parsed = JSON.parse(responseText);

		// Map IDs to statement objects
		const similarStatements: StatementWithEvaluation[] = [];
		if (Array.isArray(parsed.similarIds)) {
			for (const id of parsed.similarIds) {
				const statement = otherStatements.find((s) => s.statementId === id);
				if (statement) {
					similarStatements.push(mapStatementToWithEvaluation(statement));
				}
			}
		}

		logger.info(`Found ${similarStatements.length} similar statements`);

		return {
			similarStatements,
			suggestedTitle: parsed.mergedTitle || undefined,
			suggestedDescription: parsed.mergedDesc || undefined,
		};
	} catch (error) {
		logger.error("Error in findSimilarAndGenerateSuggestion:", error);
		return { similarStatements: [] };
	}
}

/**
 * Find statements similar to the target statement for integration
 * @deprecated Use findSimilarAndGenerateSuggestion for better performance
 */
export async function findSimilarToStatement(
	targetStatement: Statement,
	allStatements: Statement[],
	questionContext: string
): Promise<StatementWithEvaluation[]> {
	const result = await findSimilarAndGenerateSuggestion(targetStatement, allStatements, questionContext);
	return result.similarStatements;
}

/**
 * Generate an integrated suggestion from multiple statements
 * Weights the content based on evaluation data (more support = more influence)
 * @param statements - Statements to integrate
 * @param questionContext - The parent question for context
 * @returns Generated title and description
 */
export async function generateIntegratedSuggestion(
	statements: StatementWithEvaluation[],
	questionContext: string
): Promise<IntegratedSuggestionResult> {
	if (statements.length === 0) {
		throw new Error("No statements provided for integration");
	}

	if (statements.length === 1) {
		// Just return the single statement
		return {
			title: statements[0].statement,
			description: statements[0].paragraphsText || "",
		};
	}

	// Calculate total weight for normalization
	const totalEvaluators = statements.reduce((sum, s) => sum + s.numberOfEvaluators, 0);

	// Detect language from the statements
	const sampleText = statements[0].statement;
	const isHebrew = /[\u0590-\u05FF]/.test(sampleText);
	const isArabic = /[\u0600-\u06FF]/.test(sampleText);
	const languageInstruction = isHebrew
		? "Write the output in Hebrew."
		: isArabic
			? "Write the output in Arabic."
			: "Write the output in the same language as the input suggestions.";

	// Format statements with their weights
	const statementsWithWeights = statements.map((s) => {
		const weight = totalEvaluators > 0
			? Math.round((s.numberOfEvaluators / totalEvaluators) * 100)
			: Math.round(100 / statements.length);
		return {
			title: s.statement,
			description: s.paragraphsText || "",
			evaluators: s.numberOfEvaluators,
			consensus: s.consensus,
			weight: weight,
		};
	});

	const prompt = `You are helping merge similar suggestions into a single comprehensive suggestion.

CONTEXT/QUESTION: "${questionContext}"

SUGGESTIONS TO MERGE (with their relative importance based on community support):
${statementsWithWeights
		.map(
			(s, i) =>
				`${i + 1}. Title: "${s.title}"
   ${s.description ? `Description: "${s.description}"` : "No description"}
   Support: ${s.evaluators} evaluators, ${s.consensus.toFixed(2)} consensus score
   Weight: ${s.weight}% (give this much attention to this suggestion's content)`
		)
		.join("\n\n")}

TASK: Create a single merged suggestion that:
1. Combines the key ideas from all suggestions
2. Gives more weight/attention to suggestions with higher support (higher weight %)
3. Preserves the essence of what the community found valuable
4. Is clear, concise, and well-articulated
5. Would be acceptable to supporters of all the original suggestions

${languageInstruction}

Return JSON format:
{
  "title": "Merged suggestion title (do NOT truncate - preserve the full meaning)",
  "description": "Merged description that captures the combined ideas"
}`;

	try {
		const model = await getIntegrationModel();
		const result = await model.generateContent(prompt);
		let responseText = result.response.text();

		// Strip markdown code blocks if present
		responseText = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

		logger.info("AI integration result:", { responseText: responseText.substring(0, 300) });

		const parsed = JSON.parse(responseText);

		if (parsed.title && typeof parsed.title === "string") {
			return {
				title: parsed.title,
				description: parsed.description || "",
			};
		}

		// Fallback: combine titles
		logger.warn("AI returned invalid format, using fallback");
		return createFallbackIntegratedSuggestion(statements);
	} catch (error) {
		logger.error("Error generating integrated suggestion:", error);
		return createFallbackIntegratedSuggestion(statements);
	}
}

/**
 * Creates a fallback integrated suggestion when AI fails
 */
function createFallbackIntegratedSuggestion(
	statements: StatementWithEvaluation[]
): IntegratedSuggestionResult {
	// Sort by evaluators to get the most supported one first
	const sorted = [...statements].sort((a, b) => b.numberOfEvaluators - a.numberOfEvaluators);

	// Use the most supported statement as the base
	const primary = sorted[0];

	// If only one statement, return it directly
	if (statements.length === 1) {
		return {
			title: primary.statement,
			description: primary.paragraphsText || "",
		};
	}

	// Create a combined title from the top suggestions
	const isHebrew = /[\u0590-\u05FF]/.test(primary.statement);
	const combinedPrefix = isHebrew ? "שילוב: " : "Combined: ";

	return {
		title: primary.statement.length > 80
			? primary.statement.substring(0, 77) + "..."
			: primary.statement,
		description: `${combinedPrefix}${sorted.slice(0, 3).map((s) => s.statement).join(" + ")}`,
	};
}

/**
 * Maps a Statement to StatementWithEvaluation
 */
export function mapStatementToWithEvaluation(statement: Statement): StatementWithEvaluation {
	const evaluation = statement.evaluation as StatementEvaluation | undefined;

	return {
		statementId: statement.statementId,
		statement: statement.statement,
		paragraphsText: getParagraphsText(statement.paragraphs),
		numberOfEvaluators: evaluation?.numberOfEvaluators || statement.totalEvaluators || 0,
		consensus: evaluation?.agreement ?? statement.consensus ?? 0,
		sumEvaluations: evaluation?.sumEvaluations || 0,
	};
}
