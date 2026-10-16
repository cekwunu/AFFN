/**
 * Tests only: all text of a PDF read back with pdf.js (a dev dependency), whitespace and
 * non-breaking spaces collapsed, so field checklists can look for printed values.
 */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) if ('str' in item) parts.push(item.str);
  }
  return normaliseText(parts.join(' '));
}

export const normaliseText = (s: string) => s.replace(/[\s  ]+/g, ' ');
