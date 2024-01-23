const axios = require("axios");

class ApiHandler {
  constructor() {
    this.endpointUrl = "https://api.together.xyz/inference";
    this.apiKey = process.env.TOGETHER_API_KEY;
    this.userConversations = new Map(); // Map to store conversation history for each user
    this.systemPrompt = ""; // Include your system prompt
  }

  async makeRequest(userId, userInput) {
    // Retrieve or initialize conversation history for this user
    const userHistory = this.userConversations.get(userId) || `[INST] <<SYS>>${this.systemPrompt}<</SYS>>\n\n`;

    // Ensure userInput is not empty or undefined
    if (!userInput || userInput.trim() === "") {
      throw new Error("User input is empty or undefined.");
    }

    const prompt = userHistory + `${userInput}[/INST]`;

    try {
      const response = await axios.post(
        this.endpointUrl,
        {
          model: "togethercomputer/StripedHyena-Nous-7B",
          prompt: prompt,
          max_tokens: 250,
          temperature: 0.8,
          top_k: 80,
          top_p: 0.5,
          repetition_penalty: 1.1,
          stop: ["</s>"],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response || !response.data || !response.data.output || !response.data.output.choices || !response.data.output.choices.length) {
        throw new Error("Invalid or empty response structure from API");
      }

      let modelReply = response.data.output.choices[0].text.trim();

      // Check if modelReply is empty before updating the conversation history
      if (modelReply === "") {
        throw new Error("Received an empty string as response from the model.");
      }

      // Update the conversation history for this user
      this.userConversations.set(userId, userHistory + modelReply + "[/s][INST]");

      return modelReply;
    } catch (error) {
      console.error("Error making API request:", error);
      throw error; // Re-throw the error to be caught by calling function
    }
  }
}

module.exports = ApiHandler;