import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import {
	Collections,
	type AgoraScene,
	type AgoraTopicPackage,
	type AgoraYoutubeVideo,
} from '@freedi/shared-types';
import { db } from '@/firebase';

/**
 * The teacher's Agora lessons (topic packages), read and written with the same
 * rules the Agora lesson editor uses: anyone signed in can read, only the
 * creator can write. Studio edits one thing here — each scene's YouTube list.
 */
export async function listMyLessons(userId: string): Promise<AgoraTopicPackage[]> {
	const snap = await getDocs(
		query(collection(db, Collections.agoraTopicPackages), where('creatorId', '==', userId)),
	);

	return snap.docs
		.map((entry) => entry.data() as AgoraTopicPackage)
		.sort((a, b) => b.lastUpdate - a.lastUpdate);
}

export async function getLesson(topicPackageId: string): Promise<AgoraTopicPackage | null> {
	const snap = await getDoc(doc(db, Collections.agoraTopicPackages, topicPackageId));

	return snap.exists() ? (snap.data() as AgoraTopicPackage) : null;
}

/** Replace one scene's YouTube list, leaving every other scene and field alone */
export function withSceneVideos(
	scenes: readonly AgoraScene[],
	sceneId: string,
	youtubeVideos: AgoraYoutubeVideo[],
): AgoraScene[] {
	return scenes.map((scene) => (scene.sceneId === sceneId ? { ...scene, youtubeVideos } : scene));
}

/** Save the scenes only — the editor never rewrites fields it does not show */
export async function saveLessonScenes(
	topicPackageId: string,
	scenes: AgoraScene[],
): Promise<void> {
	await updateDoc(doc(db, Collections.agoraTopicPackages, topicPackageId), {
		scenes,
		lastUpdate: Date.now(),
	});
}
