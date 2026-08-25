/**
 * Structured error logging for Studio.
 *
 * The main app's `@/utils/errorHandling` is not available here, so this is the
 * one sanctioned way to report a caught error: always with an `operation`
 * (module.function) and whatever ids help debugging. Never `console.error(err)`.
 */
export interface LogErrorContext {
	/** `module.function`, e.g. `orgFunctions.inviteOrgMember`. */
	operation: string;
	userId?: string;
	statementId?: string;
	organizationId?: string;
	metadata?: Record<string, unknown>;
}

export function logError(error: unknown, context: LogErrorContext): void {
	const message = error instanceof Error ? error.message : String(error);
	const code =
		typeof error === 'object' && error !== null && 'code' in error
			? String((error as { code: unknown }).code)
			: undefined;

	console.error(`[Studio] ${context.operation}: ${message}`, {
		...context,
		...(code && { code }),
		error,
	});
}
