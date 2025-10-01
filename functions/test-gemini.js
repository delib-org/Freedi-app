const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function testGeminiAPI() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("Missing GOOGLE_API_KEY environment variable");
    return;
  }

  console.log("Testing Gemini API with key:", apiKey.substring(0, 10) + "...");

  const genAI = new GoogleGenerativeAI(apiKey);

  // Try different model names
  const modelsToTest = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-exp",
    "models/gemini-2.5-flash",
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash",
    "models/gemini-2.0-flash-exp"
  ];

  for (const modelName of modelsToTest) {
    console.log(`\nTesting model: ${modelName}`);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Hello");
      console.log(`✅ ${modelName} works!`);
      console.log("Response:", result.response.text().substring(0, 50) + "...");
      break; // Stop at first working model
    } catch (error) {
      console.log(`❌ ${modelName} failed:`, error.message);
    }
  }
}

testGeminiAPI().catch(console.error);