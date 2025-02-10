import { functionConfig } from '@/types/firebase/configFunctions';

export const findSimilarStatements = async (
	statementId: string,
	userInput: string
) => {
	const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
	const prodEndPoint =
		'https://checkforsimilarstatements-qeesi7aziq-uc.a.run.app';

	// const devEndPoint =
	// 	'https://checkforsimilarstatements-oeqnq63ina-uc.a.run.app';
	const localEndPoint = `http://localhost:5001/${projectId}/${functionConfig.region}/checkForSimilarStatements`;
	const url = () => {
		if (location.hostname !== 'localhost') {
			return prodEndPoint;
		} else {
			return localEndPoint;
		}
	};

	const body = { statementId, userInput };

	try {
		const res = await fetch(url(), {
			method: 'POST',
			body: JSON.stringify(body),
		});

		return await res.json();
	} catch (error) {
		return console.error(error);
	}
};
