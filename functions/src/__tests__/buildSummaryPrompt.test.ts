import { Statement } from '@freedi/shared-types';
import { getParagraphsText } from '../helpers';
import { buildSummaryPrompt } from '../fn_summarizeDiscussion';

interface LegacySolution {
	title: string;
	description?: string;
	consensus: number;
	averageEvaluation: number;
	numberOfEvaluators: number;
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', he: 'Hebrew' };

// Verbatim copy of buildSummaryPrompt as it was on dev before the divided
// option was added. The default output must stay identical to it.
function legacyBuildSummaryPrompt(
	question: Statement,
	solutions: LegacySolution[],
	totalParticipants: number,
	adminPrompt?: string,
	language: string = 'en',
): string {
	const languageName = LANGUAGE_NAMES[language] || 'English';

	// Format solutions with their content and metrics
	const solutionsText = solutions
		.map(
			(s, i) => `
### Agreement ${i + 1}: ${s.title}
${s.description ? `**Details**: ${s.description}` : ''}
- Consensus Score: ${s.consensus.toFixed(2)} | ${s.numberOfEvaluators} voters
`,
		)
		.join('\n');

	// Determine agreement strength descriptions
	const topSolution = solutions[0];
	const agreementStrength =
		topSolution.consensus > 0.5 ? 'strong' : topSolution.consensus > 0.2 ? 'moderate' : 'emerging';

	return `You are writing an informative summary of a group decision for people who want to understand what was agreed upon.

## The Question Discussed
"${question.statement}"
${getParagraphsText(question.paragraphs) ? `Context: ${getParagraphsText(question.paragraphs)}` : ''}

## What the Group Agreed On
${totalParticipants} participants evaluated the proposals. The following ${solutions.length} solution(s) achieved consensus:
${solutionsText}

${adminPrompt ? `## Special Focus Requested\n${adminPrompt}\n` : ''}

## Your Task
Write a clear, informative summary in ${languageName} that helps readers understand:

1. **What was the question/challenge?** - Briefly explain what the group was trying to decide
2. **What did they agree on?** - Clearly state each agreed solution in plain language. The reader should understand exactly what was decided.
3. **How strong is the agreement?** - This discussion shows ${agreementStrength} consensus (top score: ${topSolution.consensus.toFixed(2)})
4. **Key takeaways** - What should someone know about this decision?

**CRITICAL FORMATTING RULES - YOU MUST FOLLOW THESE**:
- Use proper markdown headers for ALL section titles:
  - Use "## " (with space) for main sections (e.g., "## The Discussion Question", "## What Was Agreed")
  - Use "### " (with space) for subsections (e.g., "### Key Agreements", "### Conclusions")
- Do NOT use **bold text** for section titles - use ## or ### headers instead
- Example of CORRECT formatting:
  ## The Discussion Question
  The group discussed...

  ## What Was Agreed
  ### Personal Updates
  - Agreement 1
  - Agreement 2

  ## Key Takeaways
  The main conclusions...

- Example of WRONG formatting (do NOT do this):
  **The Discussion Question**
  **What Was Agreed**

**Writing Style**:
- Write for someone who wasn't part of the discussion - they should fully understand the decisions
- Focus on the SUBSTANCE of what was agreed, not the process
- Use clear, accessible language - avoid jargon
- Be specific about what the group decided to do/believe/support
${
	solutions.length > 10
		? `- Since there are ${solutions.length} agreements, organize them by theme/category using ## and ### headers
- For each category, summarize the key agreements briefly
- Aim for 400-600 words to cover all major decisions`
		: `- Keep it concise (150-300 words) but ensure all key agreements are clearly explained`
}
- Use bullet points (- ) for listing multiple agreements under each section
- If solutions have descriptions, incorporate that detail into your explanation
- **IMPORTANT: Complete the entire summary - do not stop mid-sentence or mid-section**

Return ONLY the markdown summary text with proper ## and ### headers. Do not wrap in code blocks or JSON.`;
}

const question = { statementId: 'q', statement: 'What should we do?' } as unknown as Statement;
const solutions: LegacySolution[] = [
	{
		title: 'Plant trees',
		description: 'In parks',
		consensus: 0.6,
		averageEvaluation: 0.5,
		numberOfEvaluators: 12,
	},
	{ title: 'Ban cars', consensus: 0.3, averageEvaluation: 0.2, numberOfEvaluators: 9 },
];
const divided = {
	statementId: 'd',
	statement: 'Tax cars',
	evaluation: { numberOfEvaluators: 10, numberOfProEvaluators: 4, numberOfConEvaluators: 4 },
} as unknown as Statement;

describe('buildSummaryPrompt', () => {
	it('is identical to the old prompt when there are no divided options', () => {
		const expected = legacyBuildSummaryPrompt(question, solutions, 20, 'Be brief', 'en');

		expect(buildSummaryPrompt(question, solutions, 20, 'Be brief', 'en')).toBe(expected);
		expect(buildSummaryPrompt(question, solutions, 20, 'Be brief', 'en', [])).toBe(expected);
	});

	it('adds the divided section only when there are divided options', () => {
		const withDivided = buildSummaryPrompt(question, solutions, 20, undefined, 'en', [divided]);
		const without = buildSummaryPrompt(question, solutions, 20, undefined, 'en');

		expect(without).not.toContain('Where the Group Is Divided');
		expect(withDivided).toContain('## Where the Group Is Divided');
		expect(withDivided).toContain('**Tax cars** (4 for, 4 against, 10 voters)');
	});
});
