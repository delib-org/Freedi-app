import { AGORA_MATERIALS } from '@freedi/shared-types';
import type { AgoraMaterialChat, AgoraMaterialItem } from '@freedi/shared-types';
import {
	clampText,
	htmlTitle,
	htmlToText,
	isMaterialStoragePath,
	isPrivateAddress,
	normalizeText,
	parseDownloadUrl,
	parseFetchableUrl,
	previewOf,
	remainingChars,
} from '../materialsText';
import {
	emptyChat,
	historyFor,
	questionsLeft,
	recordAnswer,
	refundQuestion,
	reserveQuestion,
} from '../materialsQuota';
import { buildChatMessages, buildGroundingSystemPrompt, parseAnswer } from '../materialsPrompt';

const LIMIT = AGORA_MATERIALS.QUESTIONS_PER_SESSION;

function item(overrides: Partial<AgoraMaterialItem> = {}): AgoraMaterialItem {
	return {
		materialId: 'm1',
		kind: 'text',
		title: 'The harbour',
		text: 'The harbour opened in 1912.',
		charCount: 27,
		addedAt: 1,
		...overrides,
	};
}

function reserve(chat: AgoraMaterialChat | undefined, id: string, sceneId = 's1') {
	return reserveQuestion(chat, {
		sessionId: 'sess',
		userId: 'u1',
		sceneId,
		question: `question ${id}`,
		messageId: id,
		now: 1000,
	});
}

describe('materialsText', () => {
	it('turns HTML into readable text and drops scripts, styles and chrome', () => {
		const html = `<html><head><title>Old &amp; new</title><style>p{color:red}</style></head>
			<body><nav>Home | About</nav><script>alert(1)</script>
			<h1>Heading</h1><p>First&nbsp;paragraph &quot;quoted&quot;.</p><ul><li>one</li><li>two</li></ul>
			<footer>copyright</footer></body></html>`;
		const text = htmlToText(html);
		expect(text).toContain('Heading');
		expect(text).toContain('First paragraph "quoted".');
		expect(text).toContain('• one');
		expect(text).not.toContain('alert');
		expect(text).not.toContain('color:red');
		expect(text).not.toContain('Home | About');
		expect(text).not.toContain('copyright');
		expect(htmlTitle(html)).toBe('Old & new');
	});

	it('prefers the article region when the page has one', () => {
		const long = 'Real content sentence. '.repeat(30);
		const text = htmlToText(`<body><div>sidebar junk</div><article>${long}</article></body>`);
		expect(text).toContain('Real content sentence.');
		expect(text).not.toContain('sidebar junk');
	});

	it('decodes numeric entities and Hebrew survives untouched', () => {
		expect(htmlToText('<p>&#1513;&#1500;&#1493;&#1501; &#x41;</p>')).toBe('שלום A');
		expect(htmlToText('<p>הנמל נפתח בשנת 1912</p>')).toBe('הנמל נפתח בשנת 1912');
	});

	it('normalizes whitespace but keeps paragraph breaks', () => {
		expect(normalizeText('a   b\r\n\r\n\r\n\r\nc\t\td ')).toBe('a b\n\nc d');
	});

	it('clamps on a word boundary and reports truncation', () => {
		const clamped = clampText('alpha beta gamma delta epsilon', 24);
		expect(clamped.truncated).toBe(true);
		expect(clamped.text.length).toBeLessThanOrEqual(24);
		expect(clamped.text.endsWith('delta')).toBe(true);
		expect(clampText('short', 20)).toEqual({ text: 'short', truncated: false });
	});

	it('knows how much room a scene has left', () => {
		expect(remainingChars(0)).toBe(AGORA_MATERIALS.MAX_TOTAL_CHARS);
		expect(remainingChars(AGORA_MATERIALS.MAX_TOTAL_CHARS + 5)).toBe(0);
		expect(previewOf('a  b\n c', 100)).toBe('a b c');
		expect(previewOf('x'.repeat(50), 10)).toBe('xxxxxxxxxx…');
	});

	it('blocks private and loopback addresses', () => {
		for (const bad of [
			'127.0.0.1',
			'10.1.2.3',
			'192.168.0.9',
			'172.20.0.1',
			'169.254.169.254',
			'::1',
			'fd00::1',
			'::ffff:10.0.0.1',
		]) {
			expect(isPrivateAddress(bad)).toBe(true);
		}
		for (const ok of ['8.8.8.8', '93.184.216.34', '2606:4700::1111']) {
			expect(isPrivateAddress(ok)).toBe(false);
		}
	});

	it('accepts only real http(s) links', () => {
		expect(parseFetchableUrl('https://example.com/a')?.hostname).toBe('example.com');
		expect(parseFetchableUrl('example.com/page')?.protocol).toBe('https:');
		for (const bad of [
			'',
			'file:///etc/passwd',
			'ftp://example.com',
			'http://localhost:3000',
			'http://user:pw@example.com',
			'http://intranet',
			'javascript:alert(1)',
		]) {
			expect(parseFetchableUrl(bad)).toBeNull();
		}
	});

	it('only trusts storage paths inside the lesson materials folder', () => {
		expect(isMaterialStoragePath('pkg', 'agora/pkg/materials/a.pdf')).toBe(true);
		expect(isMaterialStoragePath('pkg', 'agora/other/materials/a.pdf')).toBe(false);
		expect(isMaterialStoragePath('pkg', 'agora/pkg/materials/../x.pdf')).toBe(false);
		expect(isMaterialStoragePath('pkg', 'agora/pkg/video.mp4')).toBe(false);
		const url =
			'https://firebasestorage.googleapis.com/v0/b/proj.appspot.com/o/agora%2Fpkg%2Fmaterials%2Fa.pdf?alt=media&token=t';
		expect(parseDownloadUrl(url)).toEqual({
			bucket: 'proj.appspot.com',
			path: 'agora/pkg/materials/a.pdf',
		});
		expect(parseDownloadUrl('https://evil.example/path')).toBeNull();
	});
});

describe('materialsQuota', () => {
	it('starts a chat and charges the first question', () => {
		const result = reserve(undefined, 'a');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.chat.used).toBe(1);
		expect(result.chat.messages).toHaveLength(1);
		expect(questionsLeft(result.chat.used)).toBe(LIMIT - 1);
	});

	it('refuses the question after the limit, whatever the scene', () => {
		let chat: AgoraMaterialChat | undefined;
		for (let index = 0; index < LIMIT; index++) {
			const result = reserve(chat, `q${index}`, index % 2 ? 's1' : 's2');
			expect(result.ok).toBe(true);
			if (result.ok) chat = result.chat;
		}
		const over = reserve(chat, 'extra');
		expect(over).toEqual({ ok: false, reason: 'limit', used: LIMIT });
		expect(questionsLeft(LIMIT)).toBe(0);
		expect(questionsLeft(LIMIT + 3)).toBe(0);
	});

	it('gives the question back when the model failed', () => {
		const reserved = reserve(undefined, 'a');
		if (!reserved.ok) throw new Error('unreachable');
		const refunded = refundQuestion(reserved.chat, 'a', 2000);
		expect(refunded.used).toBe(0);
		expect(refunded.messages).toHaveLength(0);
		// Refunding twice never goes below zero
		expect(refundQuestion(refunded, 'a', 3000).used).toBe(0);
	});

	it('records the answer without charging again, and flags "not in the materials"', () => {
		const reserved = reserve(undefined, 'a');
		if (!reserved.ok) throw new Error('unreachable');
		const done = recordAnswer(reserved.chat, {
			id: 'b',
			sceneId: 's1',
			text: 'No.',
			notInMaterials: true,
			now: 5,
		});
		expect(done.used).toBe(1);
		expect(done.messages[1]).toMatchObject({ role: 'ai', notInMaterials: true });
	});

	it("shows the model only this scene's recent turns, never the current question", () => {
		let chat = emptyChat('sess', 'u1', 1);
		for (let index = 0; index < 6; index++) {
			const reserved = reserve(chat, `q${index}`, 's1');
			if (!reserved.ok) throw new Error('unreachable');
			chat = recordAnswer(reserved.chat, {
				id: `a${index}`,
				sceneId: 's1',
				text: `answer ${index}`,
				notInMaterials: false,
				now: 2,
			});
		}
		const other = reserve(chat, 'other', 's2');
		if (!other.ok) throw new Error('unreachable');
		const current = reserve(other.chat, 'now', 's1');
		if (!current.ok) throw new Error('unreachable');
		const history = historyFor(current.chat, 's1', 'now');
		expect(history).toHaveLength(AGORA_MATERIALS.HISTORY_PAIRS * 2);
		expect(history.every((message) => message.sceneId === 's1' && message.id !== 'now')).toBe(true);
	});
});

describe('materialsPrompt', () => {
	const input = {
		sceneTitle: 'The harbour',
		items: [
			item(),
			item({ materialId: 'm2', kind: 'link', title: 'Wiki', text: 'Ships docked daily.' }),
		],
		language: 'he',
	};

	it('numbers the materials and grounds the model in them alone', () => {
		const prompt = buildGroundingSystemPrompt(input);
		expect(prompt).toContain('<<<MATERIAL 1: The harbour (text)>>>');
		expect(prompt).toContain('<<<MATERIAL 2: Wiki (link)>>>');
		expect(prompt).toContain('Answer ONLY from the materials');
		expect(prompt).toContain('say clearly that the materials do not say');
		expect(prompt).toContain('NEVER write their work');
		expect(prompt).toContain('decline politely');
		expect(prompt).toContain('untrusted data');
		expect(prompt).toContain('in Hebrew');
	});

	it('answers in the UI language and falls back to English', () => {
		expect(buildGroundingSystemPrompt({ ...input, language: 'nl' })).toContain('in Dutch');
		expect(buildGroundingSystemPrompt({ ...input, language: 'xx' })).toContain('in English');
	});

	it('puts history between the system prompt and the new question, and caps the question', () => {
		const messages = buildChatMessages(
			input,
			[
				{ id: '1', sceneId: 's1', role: 'student', text: 'when?', at: 1 },
				{ id: '2', sceneId: 's1', role: 'ai', text: '1912', at: 2 },
			],
			'x'.repeat(AGORA_MATERIALS.MAX_QUESTION_CHARS + 50),
		);
		expect(messages.map((message) => message.role)).toEqual([
			'system',
			'user',
			'assistant',
			'user',
		]);
		expect(messages[3].content).toHaveLength(AGORA_MATERIALS.MAX_QUESTION_CHARS);
	});

	it('reads the model JSON, a plain reply, and rejects empties and broken JSON', () => {
		expect(parseAnswer('{"answer":"In 1912.","found":true}')).toEqual({
			answer: 'In 1912.',
			found: true,
		});
		expect(parseAnswer('```json\n{"answer":"Not stated.","found":false}\n```')).toEqual({
			answer: 'Not stated.',
			found: false,
		});
		expect(parseAnswer('Just text')).toEqual({ answer: 'Just text', found: true });
		expect(parseAnswer('')).toBeNull();
		expect(parseAnswer('{"answer":')).toBeNull();
	});
});
