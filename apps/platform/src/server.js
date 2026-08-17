import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp(config);

app.listen({ host: config.host, port: config.port }).then(() => {
  console.log(`SEPT-ILP platform listening on http://${config.host}:${config.port}`);
  console.log(`  content: ${config.contentDir}`);
  console.log(`  data:    ${config.dataDir}`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
