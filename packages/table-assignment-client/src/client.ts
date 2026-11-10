import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import type {
	TablesCancelRegistrationRequest,
	TablesCancelRegistrationResponse,
	TablesComputePreviewRequest,
	TablesComputePreviewResponse,
	TablesCreateSessionRequest,
	TablesCreateSessionResponse,
	TablesFixDetailsRequest,
	TablesFixDetailsResponse,
	TablesJoinTableRequest,
	TablesJoinTableResponse,
	TablesPublishRunRequest,
	TablesPublishRunResponse,
	TablesRegisterRequest,
	TablesRegisterResponse,
	TablesRemoveParticipantRequest,
	TablesRemoveParticipantResponse,
	TablesSavePreferencesRequest,
	TablesSavePreferencesResponse,
	TablesSaveSettingsRequest,
	TablesSaveSettingsResponse,
	TablesSaveTopicsRequest,
	TablesSaveTopicsResponse,
	TablesSetStatusRequest,
	TablesSetStatusResponse,
} from '@freedi/shared-types';

/** Callable names, exactly as deployed (region me-west1, App Check). */
export const TABLES_CALLABLES = {
	createSession: 'tablesCreateSession',
	saveTopics: 'tablesSaveTopics',
	saveSettings: 'tablesSaveSettings',
	setStatus: 'tablesSetStatus',
	register: 'tablesRegister',
	savePreferences: 'tablesSavePreferences',
	joinTable: 'tablesJoinTable',
	computePreview: 'tablesComputePreview',
	publishRun: 'tablesPublishRun',
	cancelRegistration: 'tablesCancelRegistration',
	removeParticipant: 'tablesRemoveParticipant',
	fixDetails: 'tablesFixDetails',
} as const;

export interface TablesClient {
	createSession(request: TablesCreateSessionRequest): Promise<TablesCreateSessionResponse>;
	saveTopics(request: TablesSaveTopicsRequest): Promise<TablesSaveTopicsResponse>;
	saveSettings(request: TablesSaveSettingsRequest): Promise<TablesSaveSettingsResponse>;
	setStatus(request: TablesSetStatusRequest): Promise<TablesSetStatusResponse>;
	register(request: TablesRegisterRequest): Promise<TablesRegisterResponse>;
	savePreferences(request: TablesSavePreferencesRequest): Promise<TablesSavePreferencesResponse>;
	joinTable(request: TablesJoinTableRequest): Promise<TablesJoinTableResponse>;
	computePreview(request: TablesComputePreviewRequest): Promise<TablesComputePreviewResponse>;
	publishRun(request: TablesPublishRunRequest): Promise<TablesPublishRunResponse>;
	cancelRegistration(
		request: TablesCancelRegistrationRequest,
	): Promise<TablesCancelRegistrationResponse>;
	removeParticipant(
		request: TablesRemoveParticipantRequest,
	): Promise<TablesRemoveParticipantResponse>;
	fixDetails(request: TablesFixDetailsRequest): Promise<TablesFixDetailsResponse>;
}

/**
 * Typed wrappers over the Tables callables. Pass a `Functions` instance
 * already pinned to me-west1 (`getFunctions(app, 'me-west1')`); errors are
 * rethrown untouched so the caller's UI decides how to show them.
 */
export function createTablesClient(functions: Functions): TablesClient {
	async function call<Req, Res>(name: string, request: Req): Promise<Res> {
		const result = await httpsCallable<Req, Res>(functions, name)(request);

		return result.data;
	}

	return {
		createSession: (request) => call(TABLES_CALLABLES.createSession, request),
		saveTopics: (request) => call(TABLES_CALLABLES.saveTopics, request),
		saveSettings: (request) => call(TABLES_CALLABLES.saveSettings, request),
		setStatus: (request) => call(TABLES_CALLABLES.setStatus, request),
		register: (request) => call(TABLES_CALLABLES.register, request),
		savePreferences: (request) => call(TABLES_CALLABLES.savePreferences, request),
		joinTable: (request) => call(TABLES_CALLABLES.joinTable, request),
		computePreview: (request) => call(TABLES_CALLABLES.computePreview, request),
		publishRun: (request) => call(TABLES_CALLABLES.publishRun, request),
		cancelRegistration: (request) => call(TABLES_CALLABLES.cancelRegistration, request),
		removeParticipant: (request) => call(TABLES_CALLABLES.removeParticipant, request),
		fixDetails: (request) => call(TABLES_CALLABLES.fixDetails, request),
	};
}
