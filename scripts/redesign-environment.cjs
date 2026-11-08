// One isolated emulator configuration for frontend, Sign, gateway, seed and verification.
const config = require('../firebase.redesign.json').emulators;
const projectId = process.env.REDESIGN_PROJECT_ID || 'demo-freedi-redesign';
if (!projectId.startsWith('demo-')) throw new Error('Redesign scripts require a demo project.');
const host = name => `127.0.0.1:${config[name].port}`;
const env = {
 GCLOUD_PROJECT: projectId,
 FIREBASE_CONFIG: JSON.stringify({ projectId }),
 FIRESTORE_EMULATOR_HOST: host('firestore'),
 FIREBASE_AUTH_EMULATOR_HOST: host('auth'),
 FIREBASE_STORAGE_EMULATOR_HOST: host('storage'),
};
for (const [key, value] of Object.entries(env)) {
 if (process.env[key] && process.env[key] !== value)
  throw new Error(`${key} conflicts with firebase.redesign.json. Use the isolated redesign emulator suite.`);
 process.env[key] = value;
}
const appPort = process.env.REDESIGN_APP_PORT || '5189';
const signPort = process.env.REDESIGN_SIGN_PORT || '3012';
const functionsPort = process.env.REDESIGN_FUNCTIONS_PORT || '5309';
module.exports = { projectId, config, env, appPort, signPort, functionsPort };
