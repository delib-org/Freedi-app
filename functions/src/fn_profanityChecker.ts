import * as functions from "firebase-functions";

export const checkProfanity = functions.https.onCall(
  async (request: functions.https.CallableRequest) => {
    const { text } = request.data as { text: string };

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
      console.error("🧠 PERSPECTIVE RAW RESULT:", JSON.stringify(result));
      const score = result?.attributeScores?.TOXICITY?.summaryScore?.value;

      if (typeof score !== "number") {
        console.error(
          "⚠️ Invalid or missing TOXICITY score. Full response:",
          JSON.stringify(result)
        );

        return { score: null, error: "Unexpected API response structure" };
      }

      return { score };
    } catch (error) {
      console.error("Perspective API error:", error);

      return { score: null, error: "API call failed" };
    }
  }
);
