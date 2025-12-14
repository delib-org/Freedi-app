import * as functions from "firebase-functions";
import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_API_KEY missing (waiting for secret setup)");
    throw new Error("Missing GOOGLE_API_KEY");
  }

  return new GoogleGenerativeAI(apiKey);
}

// Gemini-based profanity detection
async function containsBadLanguage(text: string): Promise<boolean> {
  try {
    const model = getGenAI().getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
      Detect if the following text contains any offensive, hateful, or inappropriate language. 
      Return only true or false. Text: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const output = (await result.response.text()).trim().toLowerCase();

    console.error("🧠 Gemini response:", output); // helpful debug

    return output.includes("true");
  } catch (error) {
    console.error("Gemini API error:", error);

    return false; // fail-safe: allow text if Gemini fails
  }
}

// Firebase Callable Function using Gemini
export const checkProfanity = functions.https.onCall(
  async (request: functions.https.CallableRequest) => {
    const { text } = request.data as { text: string };

    try {
      const isBad = await containsBadLanguage(text);

      return { score: isBad ? 1 : 0 }; // mimic Perspective API style
    } catch (error) {
      console.error("Profanity check failed:", error);

      return { score: null, error: "AI call failed" };
    }
  }
);
