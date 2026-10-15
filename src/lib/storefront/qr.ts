import 'server-only';
import { PDFDocument, StandardFonts, rgb as pdfColour, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import { EMAIL_COLOURS as PRINT } from '@/lib/email/theme';
import { publicEnv } from '@/lib/env';
import { localizePath } from '@/i18n/paths';

/** The vendor's public page for one event (QR-01). Bokmål is the default, unprefixed locale. */
export function storefrontUrl(eventSlug: string, vendorSlug: string): string {
  return new URL(
    localizePath(`/e/${eventSlug}/${vendorSlug}`, 'nb'),
    publicEnv.NEXT_PUBLIC_SITE_URL,
  ).toString();
}

// Printed colours: the same token-mirrored palette the emails use (kept in sync by its test).
const fromHex = (hex: string) =>
  pdfColour(
    ...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]),
  );

/** QR code as a PNG, large enough to print sharply. */
export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 1200,
    color: { dark: PRINT.ink, light: PRINT.card },
  });
}

/** Text the standard PDF fonts can draw (Latin-1); anything else becomes "?". */
function printable(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    return [...text]
      .map((char) => {
        try {
          font.encodeText(char);
          return char;
        } catch {
          return '?';
        }
      })
      .join('');
  }
}

/** Splits text into lines that fit `width` at `size`. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Print-ready A5 table sign (QR-01): vendor name, logo, the QR code, "Skann for å bestille ·
 * Scan to order" and the address, for guests whose camera does not read QR codes.
 */
export async function qrTableSign(input: {
  url: string;
  vendorName: string;
  eventName: string;
  logo: { bytes: Uint8Array; type: 'png' | 'jpg' } | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.vendorName} – QR`);
  pdf.setCreator('AFF Marketplace');
  const page = pdf.addPage([419.53, 595.28]); // A5 portrait
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = fromHex(PRINT.ink);
  const accent = fromHex(PRINT.primary);
  const muted = fromHex(PRINT.muted);
  const centered = (text: string, y: number, size: number, font: PDFFont, color = ink) => {
    const safe = printable(font, text);
    page.drawText(safe, {
      x: (width - font.widthOfTextAtSize(safe, size)) / 2,
      y,
      size,
      font,
      color,
    });
  };

  let y = height - 52;
  centered(input.eventName.toUpperCase(), y, 11, bold, accent);
  y -= 26;
  if (input.logo) {
    const image =
      input.logo.type === 'png'
        ? await pdf.embedPng(input.logo.bytes)
        : await pdf.embedJpg(input.logo.bytes);
    const size = 64;
    page.drawImage(image, { x: (width - size) / 2, y: y - size, width: size, height: size });
    y -= size + 16;
  }
  for (const line of wrap(bold, printable(bold, input.vendorName), 26, width - 64).slice(0, 2)) {
    y -= 26;
    centered(line, y, 26, bold);
    y -= 6;
  }

  const qrSize = 250;
  const qr = await pdf.embedPng(await qrPng(input.url));
  y -= qrSize + 18;
  page.drawImage(qr, { x: (width - qrSize) / 2, y, width: qrSize, height: qrSize });

  y -= 34;
  centered('Skann for å bestille', y, 22, bold);
  y -= 22;
  centered('Scan to order', y, 15, regular, muted);
  y -= 24;
  centered(input.url.replace(/^https?:\/\//, ''), y, 9, regular, muted);
  centered('AFF Marketplace', 28, 9, bold, accent);
  return pdf.save();
}
