'use client';

import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ListFilter,
  Search,
  SearchX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '../badge';
import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { EmptyState } from '../empty-state';
import { Input } from '../input';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../table';
import { ariaSort, facetFilter, toggleFacetValue } from './helpers';

export interface DataTableFacet {
  columnId: string;
  title: string;
  options: { value: string; label: string }[];
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Accessible name of the table, shown as its caption. */
  caption: string;
  /** Column searched by the text filter. */
  searchColumn?: string;
  searchLabel?: string;
  facets?: DataTableFacet[];
  pageSize?: number;
  emptyAction?: ReactNode;
}

export function DataTable<TData>({
  columns,
  data,
  caption,
  searchColumn,
  searchLabel,
  facets = [],
  pageSize = 8,
  emptyAction,
}: DataTableProps<TData>) {
  const t = useTranslations('Components.dataTable');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // TanStack Table v8 is not React Compiler-safe; the compiler skips memoising this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    filterFns: { facet: facetFilter },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize } },
  });

  const searchCol = searchColumn ? table.getColumn(searchColumn) : undefined;
  const filtered = table.getFilteredRowModel().rows.length;
  const isFiltered = columnFilters.length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {searchCol && (
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label={searchLabel ?? t('search')}
              placeholder={searchLabel ?? t('search')}
              value={(searchCol.getFilterValue() as string) ?? ''}
              onChange={(event) => searchCol.setFilterValue(event.target.value)}
              className="pl-9"
            />
          </div>
        )}
        {facets.map((facet) => {
          const column = table.getColumn(facet.columnId);
          return column ? <FacetFilter key={facet.columnId} column={column} facet={facet} /> : null;
        })}
        {isFiltered && (
          <Button variant="ghost" onClick={() => table.resetColumnFilters()}>
            {t('reset')}
          </Button>
        )}
        <p className="ml-auto text-body-sm text-muted-foreground" aria-live="polite">
          {t('results', { count: filtered })}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getCanSort() ? ariaSort(header.column.getIsSorted()) : undefined
                    }
                    className={cn(header.column.columnDef.meta?.align === 'right' && 'text-right')}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <SortButton
                        column={header.column}
                        align={header.column.columnDef.meta?.align}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </SortButton>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.columnDef.meta?.align === 'right' && 'text-right tabular-nums',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-4">
                  <EmptyState
                    icon={<SearchX />}
                    title={t('emptyTitle')}
                    description={t('emptyDescription')}
                    action={
                      emptyAction ??
                      (isFiltered ? (
                        <Button variant="outline" onClick={() => table.resetColumnFilters()}>
                          {t('reset')}
                        </Button>
                      ) : undefined)
                    }
                    className="border-0"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <nav aria-label={t('pagination')} className="flex items-center justify-end gap-2">
          <span className="mr-2 text-body-sm text-muted-foreground">
            {t('page', {
              page: table.getState().pagination.pageIndex + 1,
              total: table.getPageCount(),
            })}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('previous')}
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('next')}
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight />
          </Button>
        </nav>
      )}
    </div>
  );
}

function SortButton<TData>({
  column,
  align,
  children,
}: {
  column: Column<TData, unknown>;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        '-mx-2 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 tracking-wide uppercase hover:bg-accent hover:text-foreground',
        sorted && 'text-foreground',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {children}
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function FacetFilter<TData>({
  column,
  facet,
}: {
  column: Column<TData, unknown>;
  facet: DataTableFacet;
}) {
  const t = useTranslations('Components.dataTable');
  const selected = (column.getFilterValue() as string[] | undefined) ?? [];
  const counts = column.getFacetedUniqueValues();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <ListFilter />
          {facet.title}
          {selected.length > 0 && (
            <Badge variant="secondary">
              {selected.length}
              <span className="sr-only"> {t('selectedCount')}</span>
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{facet.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {facet.options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => column.setFilterValue(toggleFacetValue(selected, option.value))}
          >
            <span className="flex-1">{option.label}</span>
            <span className="ml-4 text-caption text-muted-foreground tabular-nums">
              {counts.get(option.value) ?? 0}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
