/** Browser Cloud Functions instance, pinned to the deploy region. */
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { app } from './client';
import { CLIENT_EMULATORS, isClientEmulatorMode } from './clientEmulators';
import { logError } from '../utils/errorHandling';

// Region for all Cloud Functions in this project. Matches functionConfig.region
// in @freedi/shared-types and the deploy targets (me-west1 / Tel Aviv).
const FUNCTIONS_REGION = 'me-west1';

const functions = getFunctions(app, FUNCTIONS_REGION);

if (isClientEmulatorMode()) {
  try {
    connectFunctionsEmulator(functions, CLIENT_EMULATORS.host, CLIENT_EMULATORS.functionsPort);
  } catch (error) {
    logError(error, { operation: 'functionsClient.connectFunctionsEmulator' });
  }
}

export { functions };
