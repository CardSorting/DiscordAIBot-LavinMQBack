const logger = require('./logger');
const queueHandler = require('./LavinMQWorkerQueueHandler');
const ApiHandler = require('./ApiHandler');
const PineconeManager = require('./PineconeManager');

class Worker {
  constructor() {
    this.validateEnvironmentVariables();
    this.apiHandler = new ApiHandler();
    this.pineconeManager = new PineconeManager(
      process.env.PINECONE_API_KEY,
      process.env.PINECONE_ENVIRONMENT,
      process.env.PINECONE_INDEX_NAME
    );
    this.initializeQueueHandler();
  }

  validateEnvironmentVariables() {
    const requiredEnvVars = ['PINECONE_API_KEY', 'PINECONE_ENVIRONMENT', 'PINECONE_INDEX_NAME'];
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }
  }

  async initializeQueueHandler() {
    try {
      await queueHandler.initialize();
      queueHandler.consumeImageGenerationTasks(this.executeTask.bind(this));
      logger.info('LavinMQWorkerQueueHandler initialized successfully.');
    } catch (error) {
      logger.error(`Failed to initialize LavinMQWorkerQueueHandler: ${error.message}`);
      this.gracefulShutdown(1);
    }
  }

  async executeTask(msg) {
    if (!msg || !msg.content) {
      logger.warn("Invalid message format from the queue.");
      return;
    }

    try {
      const jobData = JSON.parse(msg.content.toString());
      if (!jobData.userId || !jobData.query) {
        logger.error('Job data missing userId or query.');
        return;
      }

      // Processing the job.
      const response = await this.processTask(jobData);

      // Enhanced empty response handling
      if (!response) {
        logger.error(`The response is either null or the returned promise is unresolved.`);
        return;
      } else if (response.trim() === '') {
        logger.error(`The response is empty or whitespace. JobData: userId=${jobData.userId}, query=${jobData.query}`);
        return;
      }

      await queueHandler.sendJobResult({ userId: jobData.userId, response });

    } catch (error) {
      logger.error(`Error processing message: ${error.message}`);
    }
  }

  async processTask(jobData) {
      // Retrieve user state before making the request
      const userState = await this.pineconeManager.getUserConversationState(jobData.userId);

      // Make API request and immediately check for invalid response
      let response = await this.apiHandler.makeRequest(jobData.userId, jobData.query, userState);
      if (typeof response !== 'string') {
          logger.error(`API response is of type ${typeof response}, expected a string for userId=${jobData.userId}`);
          return 'Error: Invalid API response type.';
      }

      response = response.trim();
      if (response === '') {
          logger.error(`Received an empty string as response for userId=${jobData.userId}, query=${jobData.query}`);
          return 'Error: Empty reply from the conversation partner.';
      }
      // If response is valid string, continue with updating the user state
      await this.pineconeManager.upsertUserMessage(jobData.userId, jobData.query);
      await this.pineconeManager.upsertBotResponse(jobData.userId, response);
      return response;
  }

  gracefulShutdown(exitCode = 0) {
    logger.info('Initiating graceful shutdown...');
    queueHandler.close().then(() => process.exit(exitCode)).catch(err => {
      logger.error(`Error during graceful shutdown: ${err.message}`);
      process.exit(1);
    });
  }
}

async function initializeWorker() {
  try {
    global.workerInstance = new Worker();
  } catch (error) {
    logger.error(`Failed to initialize worker: ${error.message}`);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${reason}`);
  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info('Received SIGTERM. Shutting down gracefully.');
  if (global.workerInstance) {
    global.workerInstance.gracefulShutdown();
  }
});

initializeWorker();