import { createMessageServer } from './src/server.js';
process.stdout.write('\x1b]2;log-wizard-ui\x1b\x5c');
createMessageServer();
export * from '../log-wizard-ui/src/server.js';
