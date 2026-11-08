import {
	db,
	doc,
	getDoc,
	functions,
	httpsCallable,
	storage,
	storageRef,
	uploadBytesResumable,
	getDownloadURL,
} from './firebase';
import { parse } from 'valibot';
import {
	AgoraMaterialChatSchema,
	AgoraSceneMaterialsSchema,
	Collections,
	createAgoraMaterialChatId,
	createAgoraSceneMaterialsId,
} from '@freedi/shared-types';
import type {
	AgoraMaterialChat,
	AgoraSceneMaterials,
	AskMaterialsRequest,
	AskMaterialsResponse,
	SceneMaterialsRequest,
	SceneMaterialsResponse,
} from '@freedi/shared-types';
import { pdfObjectName } from './flows/materialsFlow';

/** The materials doc of one scene, or null when the teacher attached none */
export async function fetchSceneMaterials(
	topicPackageId: string,
	sceneId: string,
): Promise<AgoraSceneMaterials | null> {
	const snapshot = await getDoc(
		doc(db, Collections.agoraSceneMaterials, createAgoraSceneMaterialsId(topicPackageId, sceneId)),
	);

	return snapshot.exists() ? parse(AgoraSceneMaterialsSchema, snapshot.data()) : null;
}

/** This student's saved conversation for the session, or null before the first question */
export async function fetchMyMaterialChat(
	sessionId: string,
	uid: string,
): Promise<AgoraMaterialChat | null> {
	const snapshot = await getDoc(
		doc(db, Collections.agoraMaterialChats, createAgoraMaterialChatId(sessionId, uid)),
	);

	return snapshot.exists() ? parse(AgoraMaterialChatSchema, snapshot.data()) : null;
}

export async function manageSceneMaterials(
	request: SceneMaterialsRequest,
): Promise<SceneMaterialsResponse> {
	const call = httpsCallable<SceneMaterialsRequest, SceneMaterialsResponse>(
		functions,
		'agoraSceneMaterials',
	);
	const result = await call(request);

	return result.data;
}

export async function askMaterials(request: AskMaterialsRequest): Promise<AskMaterialsResponse> {
	const call = httpsCallable<AskMaterialsRequest, AskMaterialsResponse>(
		functions,
		'agoraAskMaterials',
	);
	const result = await call(request);

	return result.data;
}

export interface UploadedPdf {
	storagePath: string;
	fileUrl: string;
}

/** Put a teacher's PDF in the lesson's materials folder; the callable reads it back */
export function uploadMaterialPdf(
	topicPackageId: string,
	file: File,
	onProgress: (percent: number) => void,
): Promise<UploadedPdf> {
	const storagePath = `agora/${topicPackageId}/${pdfObjectName(file.name, Date.now())}`;
	const task = uploadBytesResumable(storageRef(storage, storagePath), file, {
		contentType: 'application/pdf',
	});

	return new Promise<UploadedPdf>((resolve, reject) => {
		task.on(
			'state_changed',
			(snapshot) => {
				onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
			},
			reject,
			() => {
				getDownloadURL(task.snapshot.ref)
					.then((fileUrl) => resolve({ storagePath, fileUrl }))
					.catch(reject);
			},
		);
	});
}
