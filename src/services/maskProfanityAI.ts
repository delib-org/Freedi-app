import { functions } from "@/controllers/db/config";
import { httpsCallable } from "firebase/functions";

const checkProfanity = httpsCallable(functions, "checkProfanity");

export async function maskProfanityAI(text: string): Promise<string> {
  if (!text) return "";

  const words = text.split(/\s+/); // Split by whitespace

  const cleanedWords = await Promise.all(
    words.map(async (word) => {
      try {
        const result = await checkProfanity({ text: word });
        const { score } = result.data as { score: number | null };

        // If score is 1, Gemini said it's bad → mask it
        return score === 1 ? "*".repeat(word.length) : word;
      } catch (err) {
        console.error("Profanity mask failed:", err);

        return word; // fail-safe: show original word
      }
    })
  );

  return cleanedWords.join(" ");
}
