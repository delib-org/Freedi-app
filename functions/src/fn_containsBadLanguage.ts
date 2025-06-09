import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_API_KEY");

  return new GoogleGenerativeAI(apiKey);
}

export async function containsBadLanguage(text: string): Promise<boolean> {
  try {
    const model = getGenAI().getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Detect if the following text contains any offensive, hateful, or inappropriate language. 
      Return only true or false. Text: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const output = (await result.response.text()).trim().toLowerCase();

    return output.includes("true");
  } catch (error) {
    console.error("Error detecting bad language", error);

    return false; // fail-safe: allow text if error occurs
  }
}
export async function getToxicityScore(text: string): Promise<number | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.info("GOOGLE_API_KEY missing");

    return null;
  }

  try {
    const response = await fetch(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: { text },
          languages: ["en"],
          requestedAttributes: { TOXICITY: {} },
        }),
      }
    );

    const result = await response.json();

    return result?.attributeScores?.TOXICITY?.summaryScore?.value ?? null;
  } catch (err) {
    console.error("Perspective API error:", err);

    return null;
  }
}
