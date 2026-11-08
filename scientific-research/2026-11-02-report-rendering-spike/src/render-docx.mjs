// Usage: node src/render-docx.mjs <fixture.json> <out.docx>
// Real RTL: w:bidi on paragraphs, w:bidiVisual on tables, w:rtl + w:cs fonts on runs,
// w:lang w:bidi, section-level w:bidi, w:rtl on footnote text and footer.
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
	AlignmentType, Document, Footer, FootnoteReferenceRun, HeadingLevel, Packer, PageNumber,
	Paragraph, Table, TableCell, TableRow, TextRun, WidthType, ShadingType, VerticalAlign,
} from 'docx';

const [, , fixturePath, outPath] = process.argv;
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'));
const LANG = { he: 'he-IL', ar: 'ar-SA', fa: 'fa-IR' }[fx.lang];
// Arial ships with Word (Win + Mac) and has Hebrew, Arabic and Persian letters.
// Word does not embed fonts, so a named font that the reader lacks is silently replaced.
const FONT = { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial', eastAsia: 'Arial' };

const run = (text, o = {}) => new TextRun({
	text,
	font: FONT,
	rightToLeft: true,
	language: { value: 'en-US', bidirectional: LANG },
	size: o.size ?? 22,
	sizeComplexScript: o.size ?? 22,
	bold: o.bold,
	boldComplexScript: o.bold,
	color: o.color,
});
const para = (children, o = {}) => new Paragraph({ bidirectional: true, children, spacing: { after: 120, line: 300 }, ...o });

const footnotes = {};
const children = [
	para([run(fx.title, { size: 40, bold: true })], { heading: HeadingLevel.TITLE, spacing: { after: 120 } }),
	para([run(fx.subtitle, { size: 24, color: '555555' })], { spacing: { after: 360 } }),
];

fx.sections.forEach((s, i) => {
	const id = i + 1;
	footnotes[id] = { children: [para([run(s.footnote, { size: 18 })])] };
	children.push(para([run(s.heading, { size: 30, bold: true })], { heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 240, after: 120 } }));
	s.paragraphs.forEach((p, k) => {
		const kids = [run(p)];
		if (k === 0) kids.push(new FootnoteReferenceRun(id));
		children.push(para(kids));
	});
	children.push(para([run(s.table.caption, { size: 20, bold: true })], { keepNext: true }));
	const colW = [4200, 1200, 1200, 1200, 1200]; // dxa, sums to 9000
	const cell = (t, w, head) => new TableCell({
		width: { size: w, type: WidthType.DXA },
		verticalAlign: VerticalAlign.CENTER,
		shading: head ? { type: ShadingType.CLEAR, fill: 'DCE6F7', color: 'auto' } : undefined,
		margins: { top: 60, bottom: 60, left: 100, right: 100 },
		children: [para([run(t, { size: 20, bold: head })], { spacing: { after: 0 }, alignment: head || colW.indexOf(w) > 0 ? AlignmentType.CENTER : undefined })],
	});
	children.push(new Table({
		visuallyRightToLeft: true, // w:bidiVisual: first column on the right
		width: { size: 9000, type: WidthType.DXA },
		columnWidths: colW,
		rows: [
			new TableRow({ tableHeader: true, cantSplit: true, children: s.table.headers.map((h, c) => cell(h, colW[c], true)) }),
			...s.table.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, c) => cell(t, colW[c], false)) })),
		],
	}));
	children.push(para([run('')]));
});

const doc = new Document({
	creator: 'report-rendering-spike',
	title: fx.title,
	styles: {
		default: { document: { run: { font: FONT, rightToLeft: true, size: 22, sizeComplexScript: 22, language: { value: 'en-US', bidirectional: LANG } } } },
	},
	footnotes,
	sections: [{
		properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
		footers: {
			default: new Footer({
				children: [para([
					run(`${fx.page} `, { size: 18 }),
					new TextRun({ children: [PageNumber.CURRENT], font: FONT, rightToLeft: true, size: 18, sizeComplexScript: 18 }),
					run(` ${fx.of} `, { size: 18 }),
					new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, rightToLeft: true, size: 18, sizeComplexScript: 18 }),
				], { alignment: AlignmentType.CENTER })],
			}),
		},
		children,
	}],
});

// docx 9 has no option for section-level w:bidi or paragraph defaults, so patch the XML.
// Without w:bidi in sectPr Word treats the page as LTR (page-number side, gutter, new-paragraph defaults).
const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
let xml = await zip.file('word/document.xml').async('string');
xml = xml.replace(/<w:docGrid/g, '<w:bidi/><w:docGrid');
zip.file('word/document.xml', xml);
let styles = await zip.file('word/styles.xml').async('string');
styles = styles.replace('<w:pPrDefault/>', '<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault>');
zip.file('word/styles.xml', styles);
writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.info('wrote', outPath);
