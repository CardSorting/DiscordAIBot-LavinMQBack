const { Pinecone } = require('@pinecone-database/pinecone');

class PineconeManager {
    constructor(apiKey, environment, indexName, userDimension = 62, botDimension = 62) {
        try {
            this.pinecone = new Pinecone({ apiKey, environment });
            this.indexName = indexName;
            this.userDimension = userDimension;
            this.botDimension = botDimension;

            this.ensureIndexInitialization();
        } catch (error) {
            console.error('PineconeManager Constructor Error:', error.message || error);
        }
    }

    async ensureIndexInitialization() {
        try {
            const indexStatus = await this.pinecone.describeIndex(this.indexName);
            if (indexStatus.status && indexStatus.status.ready) {
                console.log(`Index ${this.indexName} already exists and is ready.`);
            } else {
                console.log(`Index ${this.indexName} not ready, attempting to create.`);
                await this.createIndex();
            }
        } catch (error) {
            console.error(`Error in ensureIndexInitialization for ${this.indexName}:`, error.message || error);
            await this.createIndex();
        }
    }

    async createIndex() {
        try {
            await this.pinecone.createIndex({
                name: this.indexName,
                dimension: this.userDimension, // Assuming same dimension for user and bot
                waitUntilReady: true,
            });
            console.log(`Index ${this.indexName} created successfully.`);
        } catch (error) {
            console.error(`Error creating index (${this.indexName}):`, error.message || error);
        }
    }

    async upsertUserMessage(id, userMessage) {
        try {
            const index = this.pinecone.index(this.indexName);
            const numericalUserMessage = this.convertStateToNumericalArray(userMessage, this.userDimension);
            await index.upsert([{ id: `${id}_user`, values: numericalUserMessage }]);
        } catch (error) {
            console.error(`Error upserting user message for ${id}:`, error.message || error);
        }
    }

    async upsertBotResponse(id, botResponse) {
        try {
            const index = this.pinecone.index(this.indexName);
            const numericalBotResponse = this.convertStateToNumericalArray(botResponse, this.botDimension);
            await index.upsert([{ id: `${id}_bot`, values: numericalBotResponse }]);
        } catch (error) {
            console.error(`Error upserting bot response for ${id}:`, error.message || error);
        }
    }

    async getUserConversationState(id) {
        try {
            const index = this.pinecone.index(this.indexName);
            const userResponse = await index.query({ topK: 1, id: `${id}_user` });

            if (userResponse.matches && userResponse.matches.length > 0) {
                return this.convertNumericalArrayToState(userResponse.matches[0].values);
            }
            return '';
        } catch (error) {
            console.error(`Error retrieving user conversation state for ${id}:`, error.message || error);
            return '';
        }
    }

    convertStateToNumericalArray(state, dimension) {
        let array = state.split('').map(char => char.charCodeAt(0));
        if (array.length < dimension) {
            array = [...array, ...new Array(dimension - array.length).fill(0)];
        } else {
            array = array.slice(0, dimension);
        }
        return array;
    }

    convertNumericalArrayToState(array) {
        return String.fromCharCode(...array).trim();
    }

    // Additional methods (deleteIndex, checkIndexHealth, etc.) as needed
}

module.exports = PineconeManager;