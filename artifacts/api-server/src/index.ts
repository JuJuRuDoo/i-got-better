import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";
import { resetStaleServers } from "./lib/serverProcess.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runMigrations()
  .then(async () => {
    logger.info("Database migrations complete");
    await resetStaleServers();
    logger.info("Stale server states reset");
    app.listen(port, (err: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to run database migrations");
    process.exit(1);
  });
