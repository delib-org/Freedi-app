export const functionConfig = {
	region: 'me-west1',
	timeoutSeconds: 300,
	invoker: 'public' as const, // Allow unauthenticated access for HTTP functions
	// OPENAI_API_KEY is delivered via functions/.env (written by `npm run env:prod`)
	// and read with process.env — it is NOT a Google Secret Manager secret, so it
	// must not be listed here (a non-existent secret binding would fail deploys).
	secrets: [] as string[],
};
