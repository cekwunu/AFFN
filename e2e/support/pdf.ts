/** All text of a PDF (pdf.js), whitespace and non-breaking spaces collapsed to single spaces. */
export async function pdfText(bytes: Uint8Array | Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) if ('str' in item) parts.push(item.str);
  }
  return parts.join(' ').replace(/[\s\u00a0\u202f]+/g, ' ');
}
