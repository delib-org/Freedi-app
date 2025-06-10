import { functions } from "@/controllers/db/config";
import { httpsCallable } from "firebase/functions";

export const checkProfanity = async (text: string): Promise<boolean> => {
  try {
    const fn = httpsCallable(functions, "checkProfanity");
    const result = await fn({ text });

    const { score } = result.data as { score: number | null };

    return score !== null && score >= 0.7;
  } catch (error) {
    console.error("Profanity check error:", error);

    return false;
  }
};
