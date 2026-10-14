'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Banknote,
  Copy,
  Archive,
  HelpCircle,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Receipt,
  ShoppingBag,
  SlidersHorizontal,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Stepper } from '@/components/ui/stepper';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Locale } from '@/i18n/routing';
import { formatTimeOslo } from '@/lib/format';
import { formatOre, ore, type Ore } from '@/lib/money';
import { Demo } from './section';

type Status = 'approved' | 'submitted' | 'underReview' | 'waitlisted' | 'rejected';
const STATUS_VARIANT = {
  approved: 'success',
  submitted: 'info',
  underReview: 'warning',
  waitlisted: 'secondary',
  rejected: 'danger',
} as const;

interface VendorRow {
  name: string;
  country: string;
  status: Status;
  sales: Ore;
  orders: number;
}

const VENDORS: VendorRow[] = [
  {
    name: 'Mama Afrika Kjøkken',
    country: 'NG',
    status: 'approved',
    sales: ore(4_826_500),
    orders: 412,
  },
  {
    name: 'Jollof House Oslo',
    country: 'GH',
    status: 'approved',
    sales: ore(3_910_000),
    orders: 356,
  },
  { name: 'Addis Injera', country: 'ET', status: 'underReview', sales: ore(0), orders: 0 },
  { name: 'Suya Spot', country: 'NG', status: 'approved', sales: ore(2_204_550), orders: 231 },
  { name: 'Cape Malay Bites', country: 'ZA', status: 'submitted', sales: ore(0), orders: 0 },
  { name: 'Nyama Choma Bergen', country: 'KE', status: 'waitlisted', sales: ore(0), orders: 0 },
  { name: 'Zanzibar Spice', country: 'TZ', status: 'approved', sales: ore(1_587_000), orders: 164 },
  {
    name: 'Thiéboudienne & Co',
    country: 'SN',
    status: 'approved',
    sales: ore(1_120_250),
    orders: 98,
  },
  { name: 'Kampala Rolex', country: 'UG', status: 'rejected', sales: ore(0), orders: 0 },
  { name: 'Asmara Café', country: 'ER', status: 'approved', sales: ore(967_500), orders: 121 },
  { name: 'Lagos Grill', country: 'NG', status: 'submitted', sales: ore(0), orders: 0 },
];

function ButtonsDemo() {
  const t = useTranslations('Design.components');
  return (
    <Demo title={t('buttons')} className="grid gap-8">
      <div className="grid gap-3">
        <p className="text-caption font-semibold text-muted-foreground uppercase">
          {t('variants')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('primary')}</Button>
          <Button variant="secondary">{t('secondary')}</Button>
          <Button variant="outline">{t('outline')}</Button>
          <Button variant="ghost">{t('ghost')}</Button>
          <Button variant="danger">{t('danger')}</Button>
          <Button variant="link">{t('link')}</Button>
        </div>
      </div>
      <div className="grid gap-3">
        <p className="text-caption font-semibold text-muted-foreground uppercase">{t('sizes')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{t('small')}</Button>
          <Button size="md">{t('medium')}</Button>
          <Button size="lg">{t('large')}</Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" aria-label={t('iconButton')}>
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('iconButton')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="grid gap-3">
        <p className="text-caption font-semibold text-muted-foreground uppercase">{t('states')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>{t('disabled')}</Button>
          <Button loading>{t('loading')}</Button>
          <Button variant="outline" disabled>
            {t('disabled')}
          </Button>
        </div>
      </div>
    </Demo>
  );
}

function FormsDemo() {
  const t = useTranslations('Design.components');
  return (
    <Demo title={t('forms')} className="grid gap-6 md:grid-cols-2">
      <Field label={t('businessName')} required>
        <Input placeholder={t('businessNamePlaceholder')} autoComplete="organization" />
      </Field>
      <Field label={t('orgNumber')} error={t('orgNumberError')}>
        <Input defaultValue="98765432" inputMode="numeric" />
      </Field>
      <Field label={t('email')} hint={t('emailHint')}>
        <Input type="email" autoComplete="email" />
      </Field>
      <Field label={t('category')}>
        {(control) => (
          <Select>
            <SelectTrigger {...control}>
              <SelectValue placeholder={t('categoryPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {(['food', 'drinks', 'dessert', 'crafts'] as const).map((category) => (
                <SelectItem key={category} value={category}>
                  {t(`categories.${category}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={t('description')} className="md:col-span-2">
        <Textarea placeholder={t('descriptionPlaceholder')} />
      </Field>
      <Field label={t('businessName')}>
        <Input disabled defaultValue="Mama Afrika Kjøkken" />
      </Field>
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-body-sm font-medium">{t('needs')}</legend>
        <div className="flex items-center gap-3">
          <Checkbox id="need-power" defaultChecked />
          <Label htmlFor="need-power">{t('power')}</Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="need-water" />
          <Label htmlFor="need-water">{t('water')}</Label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-body-sm font-medium">{t('size')}</legend>
        <RadioGroup defaultValue="small">
          <div className="flex items-center gap-3">
            <RadioGroupItem id="size-small" value="small" />
            <Label htmlFor="size-small">{t('sizeSmall')}</Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem id="size-large" value="large" />
            <Label htmlFor="size-large">{t('sizeLarge')}</Label>
          </div>
        </RadioGroup>
      </fieldset>
      <div className="flex items-center gap-3">
        <Switch id="accepting" defaultChecked />
        <Label htmlFor="accepting">{t('accepting')}</Label>
      </div>
    </Demo>
  );
}

function BadgesCardsDemo() {
  const t = useTranslations('Design.components');
  return (
    <>
      <Demo title={t('badges')} className="flex flex-wrap gap-2">
        <Badge>{t('statuses.draft')}</Badge>
        <Badge variant="info">{t('statuses.submitted')}</Badge>
        <Badge variant="warning">{t('statuses.underReview')}</Badge>
        <Badge variant="success">{t('statuses.approved')}</Badge>
        <Badge variant="danger">{t('statuses.rejected')}</Badge>
        <Badge variant="secondary">{t('statuses.waitlisted')}</Badge>
        <Badge variant="outline">{t('statuses.moreInfo')}</Badge>
        <Badge variant="primary">{t('statuses.new')}</Badge>
      </Demo>
      <Demo title={t('cards')} className="grid gap-6 bg-background md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('cardTitle')}</CardTitle>
            <CardDescription>{t('cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-body-sm">{t('cardBody')}</p>
          </CardContent>
          <CardFooter>
            <Button>{t('cardAction')}</Button>
            <Badge variant="info" className="ml-auto">
              {t('statuses.submitted')}
            </Badge>
          </CardFooter>
        </Card>
        <StatCard
          label={t('statSales')}
          value={formatOre(ore(4_826_500))}
          delta={{ label: t('statSalesDelta'), trend: 'up' }}
          caption={t('statCaption')}
          icon={<Banknote />}
        />
      </Demo>
    </>
  );
}

function TableTabsDemo() {
  const t = useTranslations('Design.components');
  const locale = useLocale() as Locale;
  const rows = [
    { id: 'A-041', time: '2027-06-12T16:42:00Z', status: 'new', amount: ore(24_500) },
    { id: 'A-040', time: '2027-06-12T16:39:00Z', status: 'paid', amount: ore(18_000) },
    { id: 'A-039', time: '2027-06-12T16:31:00Z', status: 'paid', amount: ore(42_750) },
  ] as const;
  return (
    <>
      <Demo title={t('table')} className="p-0">
        <Table>
          <TableCaption className="mb-4">{t('tableCaption')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t('order')}</TableHead>
              <TableHead>{t('time')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead className="text-right">{t('amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.id}</TableCell>
                <TableCell>{formatTimeOslo(row.time, locale)}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 'new' ? 'primary' : 'success'}>
                    {t(`statuses.${row.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatOre(row.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Demo>
      <Demo title={t('tabs')}>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
            <TabsTrigger value="products">{t('tabProducts')}</TabsTrigger>
            <TabsTrigger value="settlement">{t('tabSettlement')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <p className="text-body-sm">{t('tabOverviewBody')}</p>
          </TabsContent>
          <TabsContent value="products">
            <p className="text-body-sm">{t('tabProductsBody')}</p>
          </TabsContent>
          <TabsContent value="settlement">
            <p className="text-body-sm">{t('tabSettlementBody')}</p>
          </TabsContent>
        </Tabs>
      </Demo>
    </>
  );
}

function OverlaysDemo() {
  const t = useTranslations('Design.components');
  return (
    <Demo title={t('overlays')} className="flex flex-wrap items-center gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">{t('openDialog')}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('cancel')}</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button>{t('approve')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontal /> {t('openSheet')}
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('sheetTitle')}</SheetTitle>
            <SheetDescription>{t('sheetDescription')}</SheetDescription>
          </SheetHeader>
          <SheetBody className="grid content-start gap-4">
            {(['approved', 'submitted', 'underReview'] as const).map((status) => (
              <div key={status} className="flex items-center gap-3">
                <Checkbox id={`sheet-${status}`} />
                <Label htmlFor={`sheet-${status}`}>{t(`statuses.${status}`)}</Label>
              </div>
            ))}
          </SheetBody>
          <SheetFooter>
            <Button>{t('apply')}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Button
        variant="outline"
        onClick={() =>
          toast.success(t('toastTitle'), {
            description: t('toastDescription'),
            action: { label: t('undo'), onClick: () => undefined },
          })
        }
      >
        {t('showToast')}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <MoreHorizontal /> {t('openMenu')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>
            <Pencil aria-hidden="true" /> {t('menuEdit')}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy aria-hidden="true" /> {t('menuDuplicate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="danger">
            <Archive aria-hidden="true" /> {t('menuArchive')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost">
            <HelpCircle /> {t('tooltipTrigger')}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('tooltipText')}</TooltipContent>
      </Tooltip>
    </Demo>
  );
}

function FeedbackDemo() {
  const t = useTranslations('Design.components');
  return (
    <>
      <Demo title={t('skeleton')}>
        <div role="status" aria-busy="true" aria-label={t('loadingLabel')} className="grid gap-3">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </Demo>
      <Demo title={t('emptyState')} className="p-0">
        <EmptyState
          icon={<Package />}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button>
              <Plus /> {t('emptyAction')}
            </Button>
          }
          headingLevel="h4"
          className="border-0"
        />
      </Demo>
      <Demo title={t('fileUpload')}>
        <FileUpload
          label={t('fileLabel')}
          description={t('fileDescription')}
          accept={['application/pdf', 'image/jpeg', 'image/png']}
          acceptLabel="PDF, JPG, PNG"
          maxSizeBytes={10_000_000}
          maxFiles={3}
        />
      </Demo>
      <Demo title={t('stepper')}>
        <Stepper
          label={t('stepperLabel')}
          current={2}
          steps={[
            { label: t('steps.business'), description: t('steps.businessDesc') },
            { label: t('steps.contact'), description: t('steps.contactDesc') },
            { label: t('steps.documents'), description: t('steps.documentsDesc') },
            { label: t('steps.agreement'), description: t('steps.agreementDesc') },
          ]}
        />
      </Demo>
    </>
  );
}

function StatsDemo() {
  const t = useTranslations('Design.components');
  return (
    <Demo title={t('stats')} className="grid gap-4 bg-background sm:grid-cols-3">
      <StatCard
        label={t('statSales')}
        value={formatOre(ore(14_615_800))}
        delta={{ label: t('statSalesDelta'), trend: 'up' }}
        caption={t('statCaption')}
        icon={<Banknote />}
      />
      <StatCard
        label={t('statOrders')}
        value="1 382"
        delta={{ label: t('statOrdersDelta'), trend: 'down' }}
        icon={<Receipt />}
      />
      <StatCard
        label={t('statAverage')}
        value={formatOre(ore(10_576))}
        delta={{ label: t('statAverageDelta'), trend: 'flat' }}
        icon={<ShoppingBag />}
      />
    </Demo>
  );
}

function DataTableDemo() {
  const t = useTranslations('Design.components');
  const locale = useLocale();
  const columns = useMemo<ColumnDef<VendorRow, unknown>[]>(() => {
    const regions = new Intl.DisplayNames([locale === 'nb' ? 'nb-NO' : 'en-GB'], {
      type: 'region',
    });
    return [
      {
        accessorKey: 'name',
        header: t('vendor'),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'country',
        header: t('country'),
        cell: ({ row }) => regions.of(row.original.country),
        sortingFn: (a, b) =>
          (regions.of(a.original.country) ?? '').localeCompare(
            regions.of(b.original.country) ?? '',
            locale,
          ),
      },
      {
        accessorKey: 'status',
        header: t('status'),
        filterFn: 'facet',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {t(`statuses.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'orders',
        header: t('orders'),
        meta: { align: 'right' },
        cell: ({ row }) =>
          new Intl.NumberFormat(locale === 'nb' ? 'nb-NO' : 'en-GB').format(row.original.orders),
      },
      {
        accessorKey: 'sales',
        header: t('sales'),
        meta: { align: 'right' },
        cell: ({ row }) => formatOre(row.original.sales),
      },
    ];
  }, [locale, t]);

  return (
    <Demo title={t('dataTable')} className="bg-background">
      <DataTable
        columns={columns}
        data={VENDORS}
        caption={t('vendorsCaption')}
        searchColumn="name"
        searchLabel={t('searchVendors')}
        facets={[
          {
            columnId: 'status',
            title: t('status'),
            options: (
              ['approved', 'submitted', 'underReview', 'waitlisted', 'rejected'] as const
            ).map((status) => ({ value: status, label: t(`statuses.${status}`) })),
          },
        ]}
        pageSize={6}
      />
    </Demo>
  );
}

export function ComponentDemos() {
  return (
    <div className="grid gap-12">
      <ButtonsDemo />
      <FormsDemo />
      <BadgesCardsDemo />
      <TableTabsDemo />
      <OverlaysDemo />
      <FeedbackDemo />
      <StatsDemo />
      <DataTableDemo />
    </div>
  );
}
