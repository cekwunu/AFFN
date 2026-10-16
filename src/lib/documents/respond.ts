import 'server-only';
import { documentBytes, documentFileName, type StoredDocument } from './server';

/** The stored file as a download (PDFs open inline in the browser). */
export async function documentResponse(document: StoredDocument, download = false) {
  const bytes = await documentBytes(document);
  const name = await documentFileName(document);
  const disposition = download || document.content_type === 'text/csv' ? 'attachment' : 'inline';
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type':
        document.content_type === 'text/csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
      'content-disposition': `${disposition}; filename="${name}"`,
      'cache-control': 'private, no-store',
      'x-document-version': String(document.version),
    },
  });
}
