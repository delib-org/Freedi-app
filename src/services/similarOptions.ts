import firebaseConfig from "@/controllers/db/configKey";
import { functionConfig } from "delib-npm";

export const similarOptionsEndPoint =
	location.hostname === 'localhost'
		? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/checkForSimilarStatements`
		: import.meta.env.VITE_APP_CHECK_SIMILARITIES_ENDPOINT;