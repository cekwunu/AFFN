import { describe, expect, it } from 'vitest';
import { BOM, money, text, time, toCsv } from './csv';

describe('CSV for Norwegian Excel', () => {
  it('writes øre as kroner with a decimal comma', () => {
    expect(money(123_450)).toBe('1234,50');
    expect(money(5)).toBe('0,05');
    expect(money(-1_205)).toBe('-12,05');
    expect(money(0)).toBe('0,00');
    expect(money(null)).toBe('');
    expect(() => money(1.5)).toThrow(RangeError);
  });

  it('writes times in Oslo, summer and winter', () => {
    expect(time('2027-06-12T08:30:00Z')).toBe('2027-06-12 10:30:00');
    expect(time('2027-01-15T23:05:09Z')).toBe('2027-01-16 00:05:09');
    expect(time(null)).toBe('');
  });

  it('quotes separators, quotes and line breaks, and neutralises formulas', () => {
    expect(text('Mama Afrika Kjøkken')).toBe('Mama Afrika Kjøkken');
    expect(text('a;b')).toBe('"a;b"');
    expect(text('sier "hei"')).toBe('"sier ""hei"""');
    expect(text('linje\nto')).toBe('"linje\nto"');
    expect(text('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(text('-1')).toBe("'-1");
  });

  it('builds a file with BOM, semicolons and CRLF that parses back', () => {
    const csv = toCsv(['Leverandør', 'Beløp'], [[text('Jollof; House'), money(41_500)]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}Leverandør;Beløp\r\n"Jollof; House";415,00\r\n`);
  });
});
