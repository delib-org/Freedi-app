/**
 * Firebase Function for Document Version AI Processing
 *
 * Processes document paragraphs through Gemini AI to generate proposed changes
 * based on community feedback. Has 540s timeout vs Vercel's 30s limit.
 */

import { Request, Response } from "firebase-functions/v1";
import { getFirestore } from "firebase-admin/firestore";
import {
  Collections,
  DocumentVersion,
  VersionChange,
  VersionStatus,
  Paragraph,
  ChangeType,
  ChangeSource,
} from "delib-npm";

const db = getFirestore();

// AI Configuration
const GEMINI_MODEL = "gemini-3-flash-preview";
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.3;

interface ParagraphAnalysisOutput {
  proposedContent: string;
  reasoning: string;
  confidence: number;
}

/**
 * Extract and parse JSON from AI response
 */
function extractJSON<T>(response: string, fallback?: T): T {
  let cleanedResponse = response.trim();

  // Remove markdown code blocks
  const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleanedResponse = codeBlockMatch[1].trim();
  }

  // Try to find JSON object or array
  const jsonMatch = cleanedResponse.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    cleanedResponse = jsonMatch[1];
  }

  try {
    return JSON.parse(cleanedResponse);
  } catch (parseError) {
    if (fallback !== undefined) {
      return fallback;
    }

    // Try to fix truncation
    let fixedResponse = cleanedResponse;
    const openBraces = (fixedResponse.match(/\{/g) || []).length;
    const closeBraces = (fixedResponse.match(/\}/g) || []).length;
    const openBrackets = (fixedResponse.match(/\[/g) || []).length;
    const closeBrackets = (fixedResponse.match(/\]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      fixedResponse += "]";
    }
    for (let i = 0; i < openBraces - closeBraces; i++) {
      fixedResponse += "}";
    }

    try {
      return JSON.parse(fixedResponse);
    } catch {
      // Try to extract partial content
      const proposedContentMatch = cleanedResponse.match(
        /"proposedContent"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/
      );
      if (proposedContentMatch) {
        return {
          proposedContent: proposedContentMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\n"),
          reasoning: "Response was truncated - partial recovery",
          confidence: 0.7,
        } as T;
      }
      throw parseError;
    }
  }
}

/**
 * Call Gemini API
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          temperature: TEMPERATURE,
          maxOutputTokens: MAX_TOKENS,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gemini API] Error ${response.status}:`, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/**
 * Format feedback sources for the AI prompt
 */
function formatFeedback(sources: ChangeSource[]): string {
  if (sources.length === 0) {
    return "No feedback received for this paragraph.";
  }

  return sources
    .map((source, index) => {
      const type = source.type === "suggestion" ? "Suggestion" : "Comment";
      const support =
        source.supporters > 0 || source.objectors > 0
          ? ` (${source.supporters} supporters, ${source.objectors} objectors)`
          : "";

      return `${index + 1}. [${type}] (Impact: ${source.impact.toFixed(2)}${support})
   "${source.content}"
   - By: ${source.creatorDisplayName}`;
    })
    .join("\n\n");
}

const PARAGRAPH_ANALYSIS_SYSTEM_PROMPT = `You are an expert document editor helping to revise documents based on democratic public feedback.

Your role is to:
1. Carefully analyze the original paragraph and all feedback (suggestions and comments)
2. Understand what changes the community is requesting through their feedback
3. Propose a revised version that incorporates the most impactful and supported feedback
4. Maintain the document's original intent, tone, and professional quality
5. Make targeted, meaningful changes - neither too conservative nor too aggressive

Guidelines:
- PRIORITIZE feedback with higher impact scores (these represent community consensus)
- Preserve the original meaning unless feedback specifically requests changes
- Use clear, professional language appropriate to the document's context
- If feedback is contradictory, favor the higher-impact suggestions
- If no changes are warranted, return the original content unchanged

LANGUAGE REQUIREMENT:
- ALWAYS respond in the SAME LANGUAGE as the original document content
- If the document is in Hebrew, your reasoning and all text must be in Hebrew
- If the document is in English, respond in English
- Match the document's language exactly`;

const PARAGRAPH_ANALYSIS_USER_PROMPT = `
Analyze this paragraph and the public feedback, then propose a revision.

**Original Paragraph:**
{originalContent}

**Public Feedback (sorted by impact score - higher means more community support):**
{feedbackList}

**Paragraph Approval Rate:** {approvalRate}%

Respond in JSON format:
{
  "proposedContent": "Your revised paragraph text (or original if no changes needed)",
  "reasoning": "Detailed explanation including: 1) Which feedback items you incorporated, 2) Why you prioritized certain feedback, 3) Specific changes made and why, 4) Why you rejected any feedback (if applicable)",
  "confidence": 0.85
}

IMPORTANT:
- RESPOND IN THE SAME LANGUAGE AS THE ORIGINAL PARAGRAPH - if it's Hebrew, respond in Hebrew
`;

/**
 * Analyze a single paragraph
 */
async function analyzeParagraph(
  paragraph: Paragraph,
  sources: ChangeSource[],
  approvalRate?: number
): Promise<ParagraphAnalysisOutput> {
  if (sources.length === 0) {
    return {
      proposedContent: paragraph.content || "",
      reasoning: "No significant feedback to address.",
      confidence: 1.0,
    };
  }

  const userPrompt = PARAGRAPH_ANALYSIS_USER_PROMPT.replace(
    "{originalContent}",
    paragraph.content || ""
  )
    .replace("{feedbackList}", formatFeedback(sources))
    .replace(
      "{approvalRate}",
      approvalRate !== undefined ? approvalRate.toFixed(0) : "N/A"
    );

  try {
    const response = await callGemini(
      PARAGRAPH_ANALYSIS_SYSTEM_PROMPT,
      userPrompt
    );

    const parsed = extractJSON<{
      proposedContent?: string;
      reasoning?: string;
      confidence?: number;
    }>(response);

    return {
      proposedContent: parsed.proposedContent || paragraph.content || "",
      reasoning: parsed.reasoning || "AI analysis completed.",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
    };
  } catch (error) {
    console.error(
      `[analyzeParagraph] Error for paragraph ${paragraph.paragraphId}:`,
      error
    );
    return {
      proposedContent: paragraph.content || "",
      reasoning:
        "AI analysis encountered an error. The original content has been preserved.",
      confidence: 0.0,
    };
  }
}

/**
 * HTTP handler for processing version AI
 */
export async function processVersionAI(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { versionId, documentId } = req.body;

    if (!versionId || !documentId) {
      res.status(400).json({ error: "versionId and documentId are required" });
      return;
    }

    console.info(`[processVersionAI] Starting for version ${versionId}`);

    // Get the version
    const versionRef = db.collection(Collections.documentVersions).doc(versionId);
    const versionSnap = await versionRef.get();

    if (!versionSnap.exists) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    const version = versionSnap.data() as DocumentVersion;

    if (version.documentId !== documentId) {
      res.status(400).json({ error: "Version does not belong to this document" });
      return;
    }

    if (version.status !== VersionStatus.draft) {
      res.status(400).json({ error: "Only draft versions can be processed" });
      return;
    }

    // Get changes
    const changesSnapshot = await db
      .collection(Collections.versionChanges)
      .where("versionId", "==", versionId)
      .get();

    const changes = changesSnapshot.docs.map((doc) => doc.data() as VersionChange);

    if (changes.length === 0) {
      res.status(400).json({ error: "No changes found for this version" });
      return;
    }

    const paragraphs: Paragraph[] = version.paragraphs || [];

    if (paragraphs.length === 0) {
      res.status(400).json({ error: "Version has no paragraphs" });
      return;
    }

    // Filter changes needing AI
    const changesNeedingAI = changes.filter(
      (c) => c.changeType !== ChangeType.unchanged && c.sources.length > 0
    );

    console.info(
      `[processVersionAI] Processing ${changesNeedingAI.length} paragraphs with AI`
    );

    // Process all paragraphs in parallel
    const analysisPromises = changesNeedingAI.map(async (change) => {
      const paragraph = paragraphs.find(
        (p) => p.paragraphId === change.paragraphId
      );

      if (!paragraph) return null;

      const result = await analyzeParagraph(paragraph, change.sources);

      return {
        changeId: change.changeId,
        paragraphId: change.paragraphId,
        result,
      };
    });

    const analysisResultsWithNulls = await Promise.all(analysisPromises);
    const analysisResults = analysisResultsWithNulls.filter(
      (r): r is { changeId: string; paragraphId: string; result: ParagraphAnalysisOutput } =>
        r !== null
    );

    // Update changes in database
    const batch = db.batch();

    for (const analysis of analysisResults) {
      const changeRef = db
        .collection(Collections.versionChanges)
        .doc(analysis.changeId);
      batch.update(changeRef, {
        proposedContent: analysis.result.proposedContent,
        aiReasoning: analysis.result.reasoning,
      });
    }

    // Update version paragraphs
    const updatedParagraphs = paragraphs.map((p) => {
      const analysis = analysisResults.find((a) => a.paragraphId === p.paragraphId);
      if (analysis) {
        return { ...p, content: analysis.result.proposedContent };
      }
      return p;
    });

    batch.update(versionRef, {
      paragraphs: updatedParagraphs,
      summary: `Version generated with ${analysisResults.length} AI-processed changes.`,
      aiModel: GEMINI_MODEL,
    });

    await batch.commit();

    console.info(`[processVersionAI] Completed for version ${versionId}`);

    res.json({
      success: true,
      processedChanges: analysisResults.length,
      totalChanges: changes.length,
    });
  } catch (error) {
    console.error("[processVersionAI] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
