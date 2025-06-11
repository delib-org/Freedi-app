import { functions } from "@/controllers/db/config";
import { httpsCallable } from "firebase/functions";

export const checkProfanity = async (text: string): Promise<boolean> => {
  try {
    const fn = httpsCallable(functions, "checkProfanity");
    const result = await fn({ text });

    console.info("Raw result from callable function:", result);

    const { score } = result.data as { score: number | null };

    console.info("AI-based score:", score);

    return score === null || score < 0.85;
  } catch (error) {
    console.error("Profanity check error:", error);

    return true;
  }
};
