'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { kronerToOre } from '@/lib/money';
import { parseStallCsv } from '@/lib/stalls/csv';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

export interface StallState {
  ok?: string;
  at?: number;
  count?: number;
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const flag = (formData: FormData, name: string) => formData.get(name) === 'on';
const optionalInt = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^\d+$/.test(value) || Number(value) <= 0) {
      ctx.addIssue({ code: 'custom', message: 'number' });
      return z.NEVER;
    }
    return Number(value);
  });

const stallSchema = z.object({
  number: z.string().trim().min(1, 'required').max(20),
  zone: z.string().trim().max(60),
  sizeLabel: z.string().trim().max(40),
  widthCm: optionalInt,
  depthCm: optionalInt,
  fee: z.string().transform((value, ctx) => {
    try {
      const amount = kronerToOre(value.trim() || '0');
      if (amount < 0) throw new RangeError('negative');
      return amount;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'fee' });
      return z.NEVER;
    }
  }),
});

async function eventOrThrow() {
  const event = await currentApplicationEvent();
  if (!event) throw new Error('No current event');
  return event;
}

/** Create or edit a stall (STL-01). RLS: event staff of the event. */
export async function saveStall(_: StallState, formData: FormData): Promise<StallState> {
  const values = Object.fromEntries(
    ['id', 'number', 'zone', 'sizeLabel', 'widthCm', 'depthCm', 'fee'].map((k) => [
      k,
      String(formData.get(k) ?? ''),
    ]),
  );
  const parsed = stallSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }
  const event = await eventOrThrow();
  const row = {
    number: parsed.data.number,
    zone: parsed.data.zone || null,
    size_label: parsed.data.sizeLabel || null,
    width_cm: parsed.data.widthCm,
    depth_cm: parsed.data.depthCm,
    has_power: flag(formData, 'hasPower'),
    has_water: flag(formData, 'hasWater'),
    is_premium: flag(formData, 'isPremium'),
    fee_ore: parsed.data.fee,
  };
  const supabase = await createClient();
  const { error } = values.id
    ? await supabase.from('stalls').update(row).eq('id', values.id).eq('event_id', event.id)
    : await supabase
        .from('stalls')
        .insert({ ...row, organization_id: event.organization_id, event_id: event.id });
  if (error) {
    if (error.code === '23505') return { errors: { number: 'duplicate' }, values };
    if (error.code === '42501') return { error: 'forbidden', values };
    throw error;
  }
  revalidatePath('/', 'layout');
  return { ok: 'saved', at: Date.now() };
}

/** Bulk import from CSV (STL-01); all rows or none. */
export async function importStalls(_: StallState, formData: FormData): Promise<StallState> {
  const csv = String(formData.get('csv') ?? '');
  const { rows, errors } = parseStallCsv(csv);
  if (errors.length > 0) return { error: 'conflict', values: { csv } };
  if (rows.length === 0) return { error: 'empty', values: { csv } };
  const event = await eventOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.from('stalls').insert(
    rows.map((r) => ({
      organization_id: event.organization_id,
      event_id: event.id,
      number: r.number,
      zone: r.zone,
      size_label: r.sizeLabel,
      width_cm: r.widthCm,
      depth_cm: r.depthCm,
      has_power: r.hasPower,
      has_water: r.hasWater,
      is_premium: r.isPremium,
      fee_ore: r.feeOre,
    })),
  );
  if (error) {
    if (error.code === '23505') return { error: 'duplicate', values: { csv } };
    if (error.code === '42501') return { error: 'forbidden', values: { csv } };
    throw error;
  }
  revalidatePath('/', 'layout');
  return { ok: 'imported', count: rows.length, at: Date.now() };
}

/** Assign, move or release a vendor's stall (STL-02); audited in the database. */
export async function assignStall(_: StallState, formData: FormData): Promise<StallState> {
  const eventVendorId = String(formData.get('eventVendorId') ?? '');
  const stallId = String(formData.get('stallId') ?? '') || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_stall', {
    p_event_vendor_id: eventVendorId,
    p_stall_id: stallId as string,
  });
  if (error) {
    if (error.code === '23505') return { error: 'taken' };
    if (error.code === '42501') return { error: 'forbidden' };
    return { error: 'conflict' };
  }
  revalidatePath('/', 'layout');
  return { ok: stallId ? 'assigned' : 'released', at: Date.now() };
}

/** Pin position on the venue image, in basis points (STL-03). */
export async function setPin(stallId: string, x: number, y: number): Promise<boolean> {
  const valid = (v: number) => Number.isInteger(v) && v >= 0 && v <= 10_000;
  if (!valid(x) || !valid(y)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stalls')
    .update({ map_x: x, map_y: y })
    .eq('id', stallId)
    .select('id');
  if (error) return false;
  revalidatePath('/', 'layout');
  return (data ?? []).length === 1;
}

/** Venue image uploaded to event-media/{event_id}/… (STL-03). */
export async function setVenueMap(path: string): Promise<boolean> {
  const event = await eventOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_venue_map', { p_event_id: event.id, p_path: path });
  if (error) return false;
  revalidatePath('/', 'layout');
  return true;
}
