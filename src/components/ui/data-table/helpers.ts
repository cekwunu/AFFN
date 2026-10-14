import type { FilterFn, SortDirection } from '@tanstack/react-table';

/** Column filter for faceted filters: keeps rows whose value is one of the selected values. */
export const facetFilter: FilterFn<unknown> = (row, columnId, selected: unknown) => {
  if (!Array.isArray(selected) || selected.length === 0) return true;
  return selected.includes(String(row.getValue(columnId)));
};
facetFilter.autoRemove = (value: unknown) => !Array.isArray(value) || value.length === 0;

/** Maps TanStack sort state to the th aria-sort attribute. */
export function ariaSort(sorted: false | SortDirection): 'ascending' | 'descending' | 'none' {
  if (sorted === 'asc') return 'ascending';
  if (sorted === 'desc') return 'descending';
  return 'none';
}

/** Adds or removes a value from a facet selection. */
export function toggleFacetValue(selected: readonly string[] | undefined, value: string): string[] {
  const current = selected ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}
