import * as functions from "firebase-functions";

export const checkProfanity = functions.https.onCall(
  async (request: functions.https.CallableRequest) => {
    const { text } = request.data as { text: string };

    // 🔐 Replace with functions.config().google.api_key in production
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      console.info("GOOGLE_API_KEY missing (waiting for secret setup)");

      return { score: null, warning: "API key not set" };
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

      if (
        !result.attributeScores ||
        !result.attributeScores.TOXICITY ||
        !result.attributeScores.TOXICITY.summaryScore
      ) {
        throw new Error("Unexpected API response structure");
      }

      const score = result.attributeScores.TOXICITY.summaryScore.value ?? null;

      return { score };
    } catch (err) {
      console.error("Perspective API error:", err);

      return { error: "API call failed" };
    }
  }
);
