import {
	AGORA_MATERIALS,
	Collections,
	createAgoraMaterialChatId,
	createAgoraSceneMaterialsId,
} from '../index';

describe('agora library materials', () => {
	it('keeps the lesson allowance at 15 questions and the caps coherent', () => {
		expect(AGORA_MATERIALS.QUESTIONS_PER_SESSION).toBe(15);
		expect(AGORA_MATERIALS.MAX_ITEM_CHARS).toBeLessThanOrEqual(AGORA_MATERIALS.MAX_TOTAL_CHARS);
		expect(AGORA_MATERIALS.MAX_ITEMS * 1000).toBeLessThanOrEqual(AGORA_MATERIALS.MAX_TOTAL_CHARS);
	});

	it('names the docs by lesson+scene and session+student', () => {
		expect(createAgoraSceneMaterialsId('pkg', 'scene-1')).toBe('pkg--scene-1');
		expect(createAgoraMaterialChatId('sess', 'uid')).toBe('sess--uid');
		expect(Collections.agoraSceneMaterials).toBe('agoraSceneMaterials');
		expect(Collections.agoraMaterialChats).toBe('agoraMaterialChats');
	});
});
