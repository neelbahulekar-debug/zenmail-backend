// list-models.js - List all available Gemini models
const GEMINI_API_KEY = "AIzaSyAl47Ic9kIOjeLl2SzL0OmbsvkMrGIps0E";

async function listModels() {
  console.log("🔍 Fetching available Gemini models...\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("❌ Error:", data.error.message);
      return;
    }

    if (data.models) {
      console.log("✅ Available Models:\n");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      data.models.forEach((model, index) => {
        const supportsGenerate = model.supportedGenerationMethods?.includes('generateContent');
        
        if (supportsGenerate) {
          console.log(`\n${index + 1}. ${model.name}`);
          console.log(`   Display Name: ${model.displayName || 'N/A'}`);
          console.log(`   Version: ${model.version || 'N/A'}`);
          console.log(`   Description: ${model.description || 'N/A'}`);
          console.log(`   ✅ Supports: ${model.supportedGenerationMethods?.join(', ')}`);
        }
      });

      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      // Find recommended model
      const flashModels = data.models.filter(m => 
        m.name.includes('flash') && 
        m.supportedGenerationMethods?.includes('generateContent')
      );
      
      if (flashModels.length > 0) {
        console.log("\n💡 RECOMMENDED MODEL FOR YOUR APP:");
        console.log(`   ${flashModels[0].name}`);
        console.log("\n📋 USE THIS IN YOUR CODE:");
        console.log(`   const MODEL_NAME = "${flashModels[0].name.split('/')[1]}";`);
      }
      
    } else {
      console.error("❌ No models found in response");
    }

  } catch (err) {
    console.error("❌ Network Error:", err.message);
  }
}

listModels();
