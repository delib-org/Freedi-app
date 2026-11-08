declare module 'pdf-parse/lib/pdf-parse.js' {
	interface PdfParseResult {
		numpages: number;
		numrender: number;
		text: string;
	}

	export default function pdfParse(data: Buffer): Promise<PdfParseResult>;
}
