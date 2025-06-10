import { useState } from "react";
import { checkProfanity } from "@/services/profanityService";

export const useProfanityCheck = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateText = async (text: string): Promise<boolean> => {
    setIsChecking(true);
    setError(null);

    const isClean = await checkProfanity(text);

    if (!isClean) {
      setError("This text contains inappropriate language.");
    }

    setIsChecking(false);

    return isClean;
  };

  return {
    validateText,
    isChecking,
    error,
  };
};
