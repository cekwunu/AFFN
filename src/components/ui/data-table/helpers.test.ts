import type { Row } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { ariaSort, facetFilter, toggleFacetValue } from './helpers';

const row = (status: string) => ({ getValue: () => status }) as unknown as Row<unknown>;

describe('facetFilter', () => {
  it('keeps every row when nothing is selected', () => {
    expect(facetFilter(row('approved'), 'status', [], () => {})).toBe(true);
    expect(facetFilter(row('approved'), 'status', undefined, () => {})).toBe(true);
  });

  it('keeps only rows whose value is selected', () => {
    expect(facetFilter(row('approved'), 'status', ['approved', 'waitlisted'], () => {})).toBe(true);
    expect(facetFilter(row('rejected'), 'status', ['approved'], () => {})).toBe(false);
  });

  it('removes the filter when the selection is empty', () => {
    expect(facetFilter.autoRemove?.([])).toBe(true);
    expect(facetFilter.autoRemove?.(['approved'])).toBe(false);
  });
});

describe('ariaSort', () => {
  it('maps sort state to aria-sort', () => {
    expect(ariaSort('asc')).toBe('ascending');
    expect(ariaSort('desc')).toBe('descending');
    expect(ariaSort(false)).toBe('none');
  });
});

describe('toggleFacetValue', () => {
  it('adds and removes values', () => {
    expect(toggleFacetValue(undefined, 'a')).toEqual(['a']);
    expect(toggleFacetValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});
