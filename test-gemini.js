// test-gemini.js - Testing with Gemini 2.5 Flash
const GEMINI_API_KEY = "AIzaSyAl47Ic9kIOjeLl2SzL0OmbsvkMrGIps0E"; 

async function testGeminiAPI() {
  console.log("🧪 Testing Gemini 2.5 Flash API...\n");
  const prompt = "Write a short professional email reply saying you'll attend the meeting.";
  
  // Using Gemini 2.5 Flash (latest model)
  const API_VERSION = "v1beta"; 
  const MODEL_NAME = "gemini-2.5-flash"; 
  const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        }
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`❌ API Error (${response.status}):`, data.error?.message || "Unknown Error");
      
      if (response.status === 404) {
        console.log("\n💡 TIP: gemini-2.5-flash might not be available yet.");
        console.log("     Try: node list-models.js to see available models");
        console.log("     Or use: gemini-2.0-flash-exp or gemini-1.5-flash");
      }
      return;
    }
    
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const reply = data.candidates[0].content.parts[0].text;
      console.log("✅ SUCCESS! Generated reply:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(reply.trim());
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`\n✅ Using: Gemini 2.5 Flash`);
      console.log("✅ Your Gemini API is working perfectly!");
    } else {
      console.error("❌ Unexpected response format. Check if safety filters blocked the response.");
      console.log("\nFull response:", JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("❌ Network or Execution Error:", err.message);
  }
}

testGeminiAPI();