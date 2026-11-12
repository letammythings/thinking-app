import { buildApp } from "./app.js";
import { config, ensureDataDirs } from "./config.js";
import { bootstrap, openDatabase } from "./db/index.js";
import { startJobs } from "./jobs/retention.js";

ensureDataDirs();
const db = openDatabase();
await bootstrap(db);
const app = await buildApp(db);
startJobs(db);
await app.listen({ host: config.host, port: config.port });
app.log.info(`Thinking listening on ${config.publicUrl}`);
