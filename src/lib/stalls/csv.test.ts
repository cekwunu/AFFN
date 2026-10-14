import { describe, expect, it } from 'vitest';
import { parseStallCsv, pinFromClick, splitCsvLine } from './csv';

describe('splitCsvLine', () => {
  it('handles quotes, escaped quotes and separators inside quotes', () => {
    expect(splitCsvLine('A1,"Food court, east","3 × 3 m"', ',')).toEqual([
      'A1',
      'Food court, east',
      '3 × 3 m',
    ]);
    expect(splitCsvLine('"He said ""hi""";x', ';')).toEqual(['He said "hi"', 'x']);
  });
});

describe('parseStallCsv', () => {
  it('reads semicolon CSV from Norwegian Excel with a heading and kroner amounts', () => {
    const csv = [
      '﻿nummer;område;størrelse;bredde_cm;dybde_cm;strøm;vann;premium;avgift_kr',
      'C1;Food court;3 × 3 m;300;300;ja;nei;nei;2 500',
      'C2;Market;;;;nei;nei;ja;1500,50',
      '',
    ].join('\r\n');
    expect(parseStallCsv(csv)).toEqual({
      errors: [],
      rows: [
        {
          number: 'C1',
          zone: 'Food court',
          sizeLabel: '3 × 3 m',
          widthCm: 300,
          depthCm: 300,
          hasPower: true,
          hasWater: false,
          isPremium: false,
          feeOre: 250000,
        },
        {
          number: 'C2',
          zone: 'Market',
          sizeLabel: null,
          widthCm: null,
          depthCm: null,
          hasPower: false,
          hasWater: false,
          isPremium: true,
          feeOre: 150050,
        },
      ],
    });
  });

  it('reports each bad line with its line number', () => {
    const csv = [
      'D1,Zone,3x3,300,300,yes,no,no,2500',
      'D2,Zone,3x3,abc,300,yes,no,no,2500',
      'D3,Zone,3x3,300,300,maybe,no,no,2500',
      'D4,Zone,3x3,300,300,yes,no,no,12.345',
      'D1,Zone,3x3,300,300,yes,no,no,2500',
      'D5,Zone',
      ',Zone,3x3,300,300,yes,no,no,2500',
    ].join('\n');
    const { rows, errors } = parseStallCsv(csv);
    expect(rows.map((r) => r.number)).toEqual(['D1']);
    expect(errors).toEqual([
      { line: 2, code: 'number', column: 'width' },
      { line: 3, code: 'boolean', column: 'power' },
      { line: 4, code: 'fee', column: 'fee' },
      { line: 5, code: 'duplicate', column: 'number' },
      { line: 6, code: 'columns' },
      { line: 7, code: 'required', column: 'number' },
    ]);
  });
});

describe('pinFromClick', () => {
  it('converts a click to basis points of the image, clamped to the image', () => {
    const box = { left: 100, top: 50, width: 800, height: 400 };
    expect(pinFromClick({ x: 500, y: 250 }, box)).toEqual({ x: 5000, y: 5000 });
    expect(pinFromClick({ x: 100, y: 50 }, box)).toEqual({ x: 0, y: 0 });
    expect(pinFromClick({ x: 2000, y: -10 }, box)).toEqual({ x: 10000, y: 0 });
  });
});
