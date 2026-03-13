export const functionConfig = {
	region: 'me-west1',
	timeoutSeconds: 300,
	invoker: 'public' as const, // Allow unauthenticated access for HTTP functions
	secrets: ['GEMINI_API_KEY'],
};
