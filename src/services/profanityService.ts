export const checkProfanity = async (text: string): Promise<boolean> => {
  try {
    const response = await fetch("/checkProfanity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const { score } = await response.json();

    return score !== null && score >= 0.7;
  } catch (error) {
    console.error("Profanity check error:", error);

    return false;
  }
};
