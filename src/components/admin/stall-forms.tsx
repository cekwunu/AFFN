'use client';

import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';
import {
  useActionState,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from 'react';
import { useFormStatus } from 'react-dom';
import type { StallState } from '@/app/[locale]/(admin)/admin/stalls/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import { parseStallCsv, pinFromClick } from '@/lib/stalls/csv';
import { createClient } from '@/lib/supabase/client';

type Action = (state: StallState, formData: FormData) => Promise<StallState>;
type Messages = Record<string, string>;

function Submit({
  label,
  working,
  variant = 'primary',
}: {
  label: string;
  working: string;
  variant?: 'primary' | 'outline';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={buttonVariants({ variant })}
    >
      {pending ? working : label}
    </button>
  );
}

function Status({ state, messages }: { state: StallState; messages: Messages }) {
  if (state.error) {
    return (
      <p role="alert" className="text-body-sm font-medium text-danger">
        {messages[state.error] ?? messages.unknown}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-body-sm text-success-subtle-foreground">
        {(messages[state.ok] ?? '').replace('{count}', String(state.count ?? ''))}
      </p>
    );
  }
  return null;
}

export interface StallValues {
  id?: string;
  number: string;
  zone: string;
  sizeLabel: string;
  widthCm: string;
  depthCm: string;
  fee: string;
  hasPower: boolean;
  hasWater: boolean;
  isPremium: boolean;
}

/** Create or edit one stall (STL-01). */
export function StallForm({
  action,
  initial,
  labels,
  messages,
}: {
  action: Action;
  initial?: StallValues;
  labels: Record<string, string>;
  messages: Messages;
}) {
  const [state, formAction] = useActionState(action, {});
  const id = useId();
  const v = { ...initial, ...state.values } as Partial<StallValues> & Record<string, unknown>;
  const errors = state.errors ?? {};
  const text = (
    name: keyof StallValues,
    label: string,
    opts: { inputMode?: 'numeric' | 'decimal'; required?: boolean } = {},
  ) => (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-${name}`} className="text-body-sm font-medium">
        {label}
      </label>
      <input
        id={`${id}-${name}`}
        name={name}
        defaultValue={String(v[name] ?? '')}
        inputMode={opts.inputMode}
        required={opts.required}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
        className={clsx(fieldControlClasses, 'h-10 px-3')}
      />
      {errors[name] && (
        <p id={`${id}-${name}-error`} className="text-caption font-medium text-danger">
          {messages[errors[name]!] ?? messages.unknown}
        </p>
      )}
    </div>
  );
  const check = (name: 'hasPower' | 'hasWater' | 'isPremium', label: string) => (
    <label className="flex min-h-10 items-center gap-2 text-body-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={!!initial?.[name]}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
  return (
    <form key={state.at ?? 'form'} action={formAction} noValidate className="grid gap-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {text('number', labels.number!, { required: true })}
        {text('zone', labels.zone!)}
        {text('sizeLabel', labels.size!)}
        {text('widthCm', labels.width!, { inputMode: 'numeric' })}
        {text('depthCm', labels.depth!, { inputMode: 'numeric' })}
        {text('fee', labels.fee!, { inputMode: 'decimal' })}
      </div>
      <div className="flex flex-wrap gap-x-6">
        {check('hasPower', labels.power!)}
        {check('hasWater', labels.water!)}
        {check('isPremium', labels.premium!)}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Submit label={labels.save!} working={labels.saving!} />
        <Status state={state} messages={messages} />
      </div>
    </form>
  );
}

/** CSV bulk import with a preview and line-level errors (STL-01). */
export function CsvImport({
  action,
  labels,
  messages,
}: {
  action: Action;
  labels: Record<string, string>;
  messages: Messages;
}) {
  const [state, formAction] = useActionState(action, {});
  const [csv, setCsv] = useState(state.values?.csv ?? '');
  const id = useId();
  const parsed = useMemo(() => (csv.trim() ? parseStallCsv(csv) : null), [csv]);
  const fmt = (template: string, values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

  return (
    <form key={state.at ?? 'form'} action={formAction} className="grid gap-4">
      <p id={`${id}-hint`} className="text-body-sm text-muted-foreground">
        {labels.hint}
      </p>
      <label htmlFor={`${id}-csv`} className="text-body-sm font-medium">
        {labels.csv}
      </label>
      <textarea
        id={`${id}-csv`}
        name="csv"
        rows={6}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        aria-describedby={`${id}-hint`}
        className={clsx(fieldControlClasses, 'min-h-32 px-3 py-2 font-mono text-body-sm')}
      />
      <label className="grid gap-1.5 text-body-sm font-medium">
        {labels.file}
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
          className="text-body-sm"
        />
      </label>
      {parsed && (
        <div aria-live="polite" className="grid gap-2">
          {parsed.errors.length > 0 ? (
            <ul className="grid gap-1 text-body-sm text-danger">
              {parsed.errors.map((e) => (
                <li key={e.line}>
                  {fmt(labels.rowError!, { line: e.line, message: messages[e.code] ?? e.code })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm">
              {fmt(labels.previewTitle!, { count: parsed.rows.length })}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {parsed && parsed.errors.length === 0 && parsed.rows.length > 0 && (
          <Submit
            label={fmt(labels.import!, { count: parsed.rows.length })}
            working={labels.importing!}
          />
        )}
        <Status state={state} messages={messages} />
      </div>
    </form>
  );
}

export interface StallOption {
  id: string;
  number: string;
  zone: string | null;
  hasPower: boolean;
  hasWater: boolean;
}

/** Assign or move a vendor's stall, flagging conflicts with the vendor's needs (STL-02). */
export function AssignForm({
  action,
  eventVendorId,
  currentStallId,
  needsPower,
  needsWater,
  stalls,
  labels,
  messages,
}: {
  action: Action;
  eventVendorId: string;
  currentStallId: string | null;
  needsPower: boolean;
  needsWater: boolean;
  stalls: StallOption[];
  labels: Record<string, string>;
  messages: Messages;
}) {
  const [state, formAction] = useActionState(action, {});
  const [selected, setSelected] = useState(currentStallId ?? '');
  const id = useId();
  const stall = stalls.find((s) => s.id === selected);
  const conflicts = stall
    ? [
        needsPower && !stall.hasPower && labels.conflictPower,
        needsWater && !stall.hasWater && labels.conflictWater,
      ].filter(Boolean)
    : [];
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="eventVendorId" value={eventVendorId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-40 flex-1 gap-1">
          <label htmlFor={`${id}-stall`} className="text-caption font-medium text-muted-foreground">
            {labels.label}
          </label>
          <select
            id={`${id}-stall`}
            name="stallId"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-describedby={conflicts.length ? `${id}-conflict` : undefined}
            className={clsx(fieldControlClasses, 'h-10 px-3')}
          >
            <option value="">{labels.choose}</option>
            {stalls.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number}
                {s.zone ? ` · ${s.zone}` : ''}
                {(needsPower && !s.hasPower) || (needsWater && !s.hasWater) ? ' ⚠' : ''}
              </option>
            ))}
          </select>
        </div>
        <Submit
          label={currentStallId ? labels.reassign! : labels.assign!}
          working={labels.working!}
        />
        {currentStallId && (
          <button
            type="submit"
            name="stallId"
            value=""
            className={buttonVariants({ variant: 'ghost' })}
          >
            {labels.release}
          </button>
        )}
      </div>
      {conflicts.length > 0 && (
        <p id={`${id}-conflict`} className="text-caption font-semibold text-danger">
          {conflicts.join(' · ')}
        </p>
      )}
      <Status state={state} messages={messages} />
    </form>
  );
}

export interface PinStall {
  id: string;
  number: string;
  x: number | null;
  y: number | null;
}

/** Venue image upload and stall pins (STL-03). Clicking places the selected stall. */
export function LayoutEditor({
  eventId,
  mapUrl,
  stalls,
  setVenueMap,
  setPin,
  labels,
}: {
  eventId: string;
  mapUrl: string | null;
  stalls: PinStall[];
  setVenueMap: (path: string) => Promise<boolean>;
  setPin: (stallId: string, x: number, y: number) => Promise<boolean>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const id = useId();
  const imageRef = useRef<HTMLImageElement>(null);
  const [selected, setSelected] = useState(stalls[0]?.id ?? '');
  const current = stalls.find((s) => s.id === selected);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const position =
    draft ?? (current?.x != null && current.y != null ? { x: current.x, y: current.y } : null);
  const [status, setStatus] = useState('');
  const [pending, startTransition] = useTransition();

  const upload = (file: File) =>
    startTransition(async () => {
      setStatus(labels.uploading!);
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `${eventId}/venue-${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient()
        .storage.from('event-media')
        .upload(path, file, { contentType: file.type });
      const ok = !error && (await setVenueMap(path));
      setStatus(ok ? labels.uploaded! : labels.uploadError!);
      router.refresh();
    });

  const place = (event: MouseEvent<HTMLImageElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setDraft(pinFromClick({ x: event.clientX, y: event.clientY }, box));
  };
  const save = () =>
    startTransition(async () => {
      if (!current || !position) return;
      const ok = await setPin(current.id, position.x, position.y);
      setStatus(ok ? labels.saved! : labels.unknown!);
      setDraft(null);
      router.refresh();
    });

  return (
    <div className="grid gap-6">
      <label className="grid w-fit gap-1.5 text-body-sm font-medium">
        {mapUrl ? labels.replace : labels.upload}
        <span className="text-caption font-normal text-muted-foreground">{labels.uploadHint}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          className="text-body-sm"
        />
      </label>
      <p role="status" className="text-body-sm text-muted-foreground">
        {status}
      </p>
      {!mapUrl ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          {labels.noMap}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="relative w-full overflow-hidden rounded-xl border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded map; clicks are a pointer shortcut, the x/y fields are the keyboard way */}
            <img
              ref={imageRef}
              src={mapUrl}
              alt={labels.mapAlt}
              onClick={place}
              className="block w-full cursor-crosshair select-none"
            />
            {stalls
              .filter((s) => s.x != null && s.y != null && s.id !== selected)
              .map((s) => (
                <span
                  key={s.id}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-card bg-secondary px-1.5 text-caption font-semibold text-secondary-foreground"
                  style={{ left: `${s.x! / 100}%`, top: `${s.y! / 100}%` }}
                >
                  {s.number}
                </span>
              ))}
            {current && position && (
              <span
                data-testid="selected-pin"
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground shadow-md"
                style={{ left: `${position.x / 100}%`, top: `${position.y / 100}%` }}
              >
                {current.number}
              </span>
            )}
          </div>
          <div className="grid content-start gap-4">
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-stall`} className="text-body-sm font-medium">
                {labels.select}
              </label>
              <select
                id={`${id}-stall`}
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setDraft(null);
                }}
                className={clsx(fieldControlClasses, 'h-10 px-3')}
              >
                {stalls.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.number} ({s.x != null ? labels.placed : labels.notPlaced})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-caption text-muted-foreground">{labels.placeHint}</p>
            <div className="grid grid-cols-2 gap-3">
              {(['x', 'y'] as const).map((axis) => (
                <div key={axis} className="grid gap-1.5">
                  <label htmlFor={`${id}-${axis}`} className="text-body-sm font-medium">
                    {labels[axis]}
                  </label>
                  <input
                    id={`${id}-${axis}`}
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={position ? position[axis] / 100 : ''}
                    onChange={(e) => {
                      const value = Math.round(
                        Math.min(100, Math.max(0, Number(e.target.value))) * 100,
                      );
                      setDraft({ x: position?.x ?? 5000, y: position?.y ?? 5000, [axis]: value });
                    }}
                    className={clsx(fieldControlClasses, 'h-10 px-3')}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={!position || pending}
              className={buttonVariants()}
            >
              {labels.savePin}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
