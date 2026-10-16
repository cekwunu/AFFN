/**
 * A small A4 layout kit for AFFN documents (SET-04, QR-05): the design system's typography
 * (Inter for text, Fraunces for titles, embedded and subset) and print colours, with the blocks
 * invoices, statements and receipts need. A document is a plain model (see DocumentModel);
 * rendering is deterministic for the same model, so an unchanged document hashes the same.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb as pdfColour, type PDFFont, type PDFPage } from 'pdf-lib';
import { EMAIL_COLOURS } from '@/lib/email/theme';

export type Align = 'left' | 'right';

export type Block =
  /** Seller and buyer side by side ("Fra" / "Til"). */
  | { type: 'parties'; parties: { title: string; lines: string[] }[] }
  /** Label–value pairs, e.g. invoice number, dates, period. */
  | { type: 'facts'; rows: [string, string][] }
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string; tone?: 'muted' | 'strong' }
  /** A table; `totals` rows are printed under it, right-aligned, the last one emphasised. */
  | {
      type: 'table';
      columns: { label: string; align?: Align; width: number }[];
      rows: string[][];
      totals?: [string, string][];
    };

export type DocumentModel = {
  /** Shown top left in the brand colour, e.g. the issuer's name. */
  brand: string;
  title: string;
  /** Top right, under the title line: e.g. invoice number and date. */
  meta: [string, string][];
  blocks: Block[];
  /** Footer line on every page (issuer details). */
  footer: string;
  /** "Side {page} av {pages}" with the placeholders filled in per page. */
  pageLabel: (page: number, pages: number) => string;
  /** PDF metadata. */
  info: { title: string; subject: string; language: string; date: Date };
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const FOOTER = 40;

const colour = (hex: string) =>
  pdfColour(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
const INK = colour(EMAIL_COLOURS.ink);
const MUTED = colour(EMAIL_COLOURS.muted);
const LINE = colour(EMAIL_COLOURS.line);
const BRAND = colour(EMAIL_COLOURS.primary);

const FONT_DIR = path.join(process.cwd(), 'src/lib/pdf/fonts');
let fontBytes: Promise<[Buffer, Buffer, Buffer]> | null = null;
const loadFonts = () =>
  (fontBytes ??= Promise.all([
    readFile(path.join(FONT_DIR, 'Inter-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'Inter-SemiBold.ttf')),
    readFile(path.join(FONT_DIR, 'Fraunces-SemiBold.ttf')),
  ]));

type Fonts = { regular: PDFFont; strong: PDFFont; display: PDFFont };

/** Splits text into lines that fit the width (words longer than a line are cut). */
export function wrapText(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/[ \t]+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

class Layout {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(
    private pdf: PDFDocument,
    private fonts: Fonts,
    private model: DocumentModel,
  ) {
    this.newPage();
  }

  get width() {
    return A4[0] - MARGIN * 2;
  }

  newPage() {
    this.page = this.pdf.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - MARGIN;
    if (this.pages.length > 1) {
      this.text(this.model.title, MARGIN, this.y - 10, 10, this.fonts.strong, MUTED);
      this.y -= 32;
    }
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + FOOTER) this.newPage();
  }

  text(text: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
    this.page.drawText(text, { x, y, size, font, color });
  }

  right(text: string, xRight: number, y: number, size: number, font: PDFFont, color = INK) {
    this.text(text, xRight - font.widthOfTextAtSize(text, size), y, size, font, color);
  }

  rule(y: number, thickness = 0.75, color = LINE) {
    this.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness,
      color,
    });
  }

  header() {
    const { regular, strong, display } = this.fonts;
    this.text(this.model.brand, MARGIN, this.y - 12, 12, strong, BRAND);
    this.y -= 52;
    for (const line of wrapText(display, this.model.title, 24, this.width * 0.6)) {
      this.text(line, MARGIN, this.y, 24, display);
      this.y -= 30;
    }
    // Meta (number, dates) top right, aligned with the brand line.
    let metaY = A4[1] - MARGIN - 12;
    for (const [label, value] of this.model.meta) {
      this.right(
        label,
        A4[0] - MARGIN - strong.widthOfTextAtSize(value, 10) - 8,
        metaY,
        10,
        regular,
        MUTED,
      );
      this.right(value, A4[0] - MARGIN, metaY, 10, strong);
      metaY -= 15;
    }
    this.y = Math.min(this.y, metaY) - 8;
    this.rule(this.y);
    this.y -= 24;
  }

  block(block: Block) {
    const { regular, strong, display } = this.fonts;
    switch (block.type) {
      case 'heading': {
        this.ensure(40);
        this.y -= 6;
        this.text(block.text, MARGIN, this.y, 14, display);
        this.y -= 22;
        return;
      }
      case 'paragraph': {
        const font = block.tone === 'strong' ? strong : regular;
        const lines = wrapText(font, block.text, 10, this.width);
        this.ensure(lines.length * 14 + 8);
        for (const line of lines) {
          this.text(line, MARGIN, this.y, 10, font, block.tone === 'muted' ? MUTED : INK);
          this.y -= 14;
        }
        this.y -= 8;
        return;
      }
      case 'parties': {
        const columnWidth = this.width / block.parties.length;
        const wrapped = block.parties.map((p) =>
          p.lines.flatMap((l) => wrapText(regular, l, 10, columnWidth - 16)),
        );
        const height = 18 + Math.max(...wrapped.map((l) => l.length)) * 14;
        this.ensure(height + 16);
        block.parties.forEach((party, i) => {
          const x = MARGIN + i * columnWidth;
          this.text(party.title.toUpperCase(), x, this.y, 8, strong, MUTED);
          wrapped[i]!.forEach((line, j) =>
            this.text(line, x, this.y - 16 - j * 14, 10, j === 0 ? strong : regular),
          );
        });
        this.y -= height + 16;
        return;
      }
      case 'facts': {
        const labelWidth = Math.max(...block.rows.map(([l]) => regular.widthOfTextAtSize(l, 10)));
        for (const [label, value] of block.rows) {
          const lines = wrapText(strong, value, 10, this.width - labelWidth - 16);
          this.ensure(lines.length * 14 + 2);
          this.text(label, MARGIN, this.y, 10, regular, MUTED);
          lines.forEach((line, j) =>
            this.text(line, MARGIN + labelWidth + 16, this.y - j * 14, 10, strong),
          );
          this.y -= lines.length * 14 + 2;
        }
        this.y -= 14;
        return;
      }
      case 'table': {
        const total = block.columns.reduce((s, c) => s + c.width, 0);
        const xs: { x: number; w: number; align: Align }[] = [];
        let x = MARGIN;
        for (const c of block.columns) {
          const w = (c.width / total) * this.width;
          xs.push({ x, w, align: c.align ?? 'left' });
          x += w;
        }
        const drawCells = (cells: string[], font: PDFFont, size: number, color = INK) => {
          const wrapped = cells.map((cell, i) => wrapText(font, cell, size, xs[i]!.w - 8));
          const lines = Math.max(...wrapped.map((w) => w.length));
          this.ensure(lines * 13 + 10);
          wrapped.forEach((cellLines, i) => {
            const col = xs[i]!;
            cellLines.forEach((line, j) => {
              const y = this.y - j * 13;
              if (col.align === 'right') this.right(line, col.x + col.w, y, size, font, color);
              else this.text(line, col.x, y, size, font, color);
            });
          });
          this.y -= lines * 13 + 6;
        };
        const head = () => {
          drawCells(
            block.columns.map((c) => c.label),
            strong,
            8.5,
            MUTED,
          );
          this.rule(this.y + 2);
          this.y -= 10;
        };
        this.ensure(60);
        head();
        for (const row of block.rows) {
          const lines = Math.max(
            ...row.map((cell, i) => wrapText(regular, cell, 9.5, xs[i]!.w - 8).length),
          );
          if (this.y - (lines * 13 + 12) < MARGIN + FOOTER) {
            // Continue on a new page, with the column headings repeated.
            this.newPage();
            head();
          }
          drawCells(row, regular, 9.5);
          this.rule(this.y + 7, 0.4);
          this.y -= 6;
        }
        if (block.totals?.length) {
          this.y -= 4;
          block.totals.forEach(([label, value], i) => {
            const last = i === block.totals!.length - 1;
            const size = last ? 12 : 10;
            const font = last ? strong : regular;
            this.ensure(size + 10);
            if (last) {
              this.page.drawLine({
                start: { x: MARGIN + this.width * 0.5, y: this.y + size + 2 },
                end: { x: A4[0] - MARGIN, y: this.y + size + 2 },
                thickness: 1,
                color: INK,
              });
              this.y -= 4;
            }
            this.right(label, A4[0] - MARGIN - 130, this.y, size, font, last ? INK : MUTED);
            this.right(value, A4[0] - MARGIN, this.y, size, font);
            this.y -= size + 8;
          });
        }
        this.y -= 12;
        return;
      }
    }
  }

  footers() {
    const { regular } = this.fonts;
    this.pages.forEach((page, i) => {
      const label = this.model.pageLabel(i + 1, this.pages.length);
      page.drawLine({
        start: { x: MARGIN, y: MARGIN + 18 },
        end: { x: A4[0] - MARGIN, y: MARGIN + 18 },
        thickness: 0.5,
        color: LINE,
      });
      const lines = wrapText(
        regular,
        this.model.footer,
        8,
        this.width - regular.widthOfTextAtSize(label, 8) - 24,
      );
      lines.slice(0, 2).forEach((line, j) =>
        page.drawText(line, {
          x: MARGIN,
          y: MARGIN + 6 - j * 10,
          size: 8,
          font: regular,
          color: MUTED,
        }),
      );
      page.drawText(label, {
        x: A4[0] - MARGIN - regular.widthOfTextAtSize(label, 8),
        y: MARGIN + 6,
        size: 8,
        font: regular,
        color: MUTED,
      });
    });
  }
}

/** Renders a document model to PDF bytes. */
export async function renderPdf(model: DocumentModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(fontkit);
  const [regularBytes, strongBytes, displayBytes] = await loadFonts();
  // Inter is embedded whole: pdf-lib's subsetter drops its glyphs. Fraunces subsets cleanly.
  const fonts: Fonts = {
    regular: await pdf.embedFont(regularBytes, { subset: false }),
    strong: await pdf.embedFont(strongBytes, { subset: false }),
    display: await pdf.embedFont(displayBytes, { subset: true }),
  };
  pdf.setTitle(model.info.title);
  pdf.setSubject(model.info.subject);
  pdf.setLanguage(model.info.language);
  pdf.setAuthor(model.brand);
  pdf.setCreator('AFF Marketplace');
  pdf.setProducer('AFF Marketplace');
  pdf.setCreationDate(model.info.date);
  pdf.setModificationDate(model.info.date);

  const layout = new Layout(pdf, fonts, model);
  layout.header();
  for (const block of model.blocks) layout.block(block);
  layout.footers();
  return pdf.save({ useObjectStreams: false });
}
