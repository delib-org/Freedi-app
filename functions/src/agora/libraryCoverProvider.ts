import { callLLM, getOpenAI, WORKER_MODEL } from '../config/openai-chat';
import { COVER_IMAGE, CoverSource, sceneBriefPrompt } from './libraryCover';

/**
 * The three things the cover pipeline asks of a provider, behind one seam so
 * tests (and the emulator, which has no network) can stub it, and the image
 * model can be swapped without touching the callable.
 */
export interface CoverProvider {
	/** One English sentence describing the picture */
	writeBrief: (source: CoverSource) => Promise<string>;
	/** True when the prompt must not be painted */
	flagged: (prompt: string) => Promise<boolean>;
	/** The picture, as webp bytes */
	paint: (prompt: string) => Promise<Buffer>;
}

const MODERATION_MODEL = 'omni-moderation-latest';
const BRIEF_MAX_TOKENS = 200;

export const openAiCoverProvider: CoverProvider = {
	async writeBrief(source) {
		const { system, user } = sceneBriefPrompt(source);

		return (
			await callLLM({
				model: WORKER_MODEL,
				system,
				user,
				maxTokens: BRIEF_MAX_TOKENS,
				temperature: 0.7,
				reasoningEffort: 'none',
			})
		).trim();
	},

	async flagged(prompt) {
		const result = await getOpenAI().moderations.create({ model: MODERATION_MODEL, input: prompt });

		return result.results.some((entry) => entry.flagged);
	},

	async paint(prompt) {
		const response = await getOpenAI().images.generate({
			model: COVER_IMAGE.MODEL,
			prompt,
			n: 1,
			size: COVER_IMAGE.SIZE,
			quality: COVER_IMAGE.QUALITY,
			output_format: 'webp',
			output_compression: 82,
		});
		const encoded = response.data?.[0]?.b64_json;
		if (!encoded) throw new Error('The image model returned no picture');

		return Buffer.from(encoded, 'base64');
	},
};

// A 240x160 sunrise swatch. Only the emulator, with AGORA_COVER_STUB=1 and no network, ever paints this.
const STUB_WEBP =
	'UklGRr4CAABXRUJQVlA4ILICAAAwFgCdASrwAKAAPsFgrFAnpSQio78IAPAYCWVu4XPBOEYI78y7WAawDHFN5KyKGEGUDwA0gTKu8ADUyZv+ObiP65iRNfMpqp8UHL0ol3XmHWpKHTaWZpYiLff9l8zunqmEq4KpnxhzU33L5m/Wgdl9AdPk3FkyrsX2ndEDFPcImj114Zn25KqtvmLnLsOMc9YG78VbwQze1PBG+wt/VMGq4CMVfFF6GNfpPeuEQyrIk5UDEBsO03PzIAAA/vob/9qcEqFn8Q9F5dpkHdyZWt51UHKsPfwzqoOVYe/hoTSCfJwiG1FNyUuBV6zgCr1nAFZCBDmeDAAJ0Yj23LUGiyQ0NP/e2ycJF3Rf2aboStv787ZYBfyfSC7Ta652ndK8Fnsd6OvwEjyf92syGmH7fHUegGcWJX9TT+BqzpUKMjZWnzm1YZzfa4BOwQBhXDhLiQSLDDHKNdGi0DEe256fyP2a2WX+58URu5kAAJaWycU9rUMS4doBaKy/XicPSvmg1gAPC8gLuw5Y0S7tnpNIAZJyFnzcCdeOVxFHps/7T8SSebFJnVUCBYZOWG3n8buAlwM+Z0p0QnBwHHAdH8gFSlucUobDw7wVp/gUwx8oQC5Odpv9QAAZqZtmWrWz8MRSiZePPjZNLc4RslS0gL2nUm80X/WO4dUU5GpszHnF+1Bn2s8lPrPk4AuTrfnVB15hPhxBuGczb4Uf7W8XZqywYWbT89YL9yczYXlk8NWfEddHVWxJ7esoquJ2idTywu0pB6MVyQfXa5/MSiZ/RF9Z8R4ZrjijxdyGkUc0awv0pkSesyztC2Cih0TNbPuv7+qPNzuLqwe2GzUMNSHGvQNOIuIhPnh5gYSh3wQRBA4MgnZH5jkWK1IJmAgY3QDveQMTfiSS5nRtWj9TXlWxl/CM8v2AAAA=';

export const stubCoverProvider: CoverProvider = {
	writeBrief: async (source) => `A calm illustration of ${source.title}`,
	flagged: async () => false,
	paint: async () => Buffer.from(STUB_WEBP, 'base64'),
};
