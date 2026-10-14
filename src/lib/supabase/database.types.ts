
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "application_reviews": {
                  Row: {
                    "actor_id": string,"created_at": string,"event_id": string,"event_vendor_id": string,"from_status": Database["public"]['Enums']["application_status"] | null,"id": string,"note": string,"organization_id": string,"to_status": Database["public"]['Enums']["application_status"],"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"event_id": string,"event_vendor_id": string,"from_status"?: Database["public"]['Enums']["application_status"] | null,"id"?: string,"note": string,"organization_id": string,"to_status": Database["public"]['Enums']["application_status"],"vendor_id": string
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"event_id"?: string,"event_vendor_id"?: string,"from_status"?: Database["public"]['Enums']["application_status"] | null,"id"?: string,"note"?: string,"organization_id"?: string,"to_status"?: Database["public"]['Enums']["application_status"],"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_reviews_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "application_reviews_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "application_reviews_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id": string | null,"actor_role": string,"created_at": string,"event_id": string | null,"id": string,"new_data": Json | null,"old_data": Json | null,"organization_id": string | null,"reason": string | null,"row_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id"?: string | null,"actor_role"?: string,"created_at"?: string,"event_id"?: string | null,"id"?: string,"new_data"?: Json | null,"old_data"?: Json | null,"organization_id"?: string | null,"reason"?: string | null,"row_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["audit_action"],"actor_id"?: string | null,"actor_role"?: string,"created_at"?: string,"event_id"?: string | null,"id"?: string,"new_data"?: Json | null,"old_data"?: Json | null,"organization_id"?: string | null,"reason"?: string | null,"row_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "audit_log_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_rules": {
                  Row: {
                    "category_id": string | null,"created_at": string,"created_by": string | null,"effective_from": string,"event_id": string | null,"fixed_ore": number | null,"id": string,"organization_id": string,"rate_bp": number | null,"reason": string,"scope": Database["public"]['Enums']["commission_scope"],"type": Database["public"]['Enums']["commission_type"],"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"event_id"?: string | null,"fixed_ore"?: number | null,"id"?: string,"organization_id": string,"rate_bp"?: number | null,"reason": string,"scope": Database["public"]['Enums']["commission_scope"],"type": Database["public"]['Enums']["commission_type"],"vendor_id"?: string | null
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"event_id"?: string | null,"fixed_ore"?: number | null,"id"?: string,"organization_id"?: string,"rate_bp"?: number | null,"reason"?: string,"scope"?: Database["public"]['Enums']["commission_scope"],"type"?: Database["public"]['Enums']["commission_type"],"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_rules_category_id_organization_id_fkey"
      columns: ["category_id","organization_id"]
isOneToOne: false
      referencedRelation: "product_categories"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "commission_rules_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "commission_rules_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_rules_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"event_admins": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"organization_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"organization_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"organization_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_admins_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"event_vendors": {
                  Row: {
                    "application_notes": string | null,"created_at": string,"decided_at": string | null,"event_id": string,"id": string,"is_paused": boolean,"is_published": boolean,"needs_power": boolean,"needs_water": boolean,"organization_id": string,"psp_account_id": string | null,"psp_account_status": Database["public"]['Enums']["psp_account_status"],"qr_slug": string,"requested_stall_size": string | null,"status": Database["public"]['Enums']["application_status"],"submitted_at": string | null,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_notes"?: string | null,"created_at"?: string,"decided_at"?: string | null,"event_id": string,"id"?: string,"is_paused"?: boolean,"is_published"?: boolean,"needs_power"?: boolean,"needs_water"?: boolean,"organization_id": string,"psp_account_id"?: string | null,"psp_account_status"?: Database["public"]['Enums']["psp_account_status"],"qr_slug"?: string,"requested_stall_size"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"submitted_at"?: string | null,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "application_notes"?: string | null,"created_at"?: string,"decided_at"?: string | null,"event_id"?: string,"id"?: string,"is_paused"?: boolean,"is_published"?: boolean,"needs_power"?: boolean,"needs_water"?: boolean,"organization_id"?: string,"psp_account_id"?: string | null,"psp_account_status"?: Database["public"]['Enums']["psp_account_status"],"qr_slug"?: string,"requested_stall_size"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"submitted_at"?: string | null,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_vendors_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "event_vendors_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "created_at": string,"description": string | null,"ends_at": string | null,"id": string,"name": string,"organization_id": string,"slug": string,"starts_at": string | null,"status": Database["public"]['Enums']["event_status"],"updated_at": string,"venue_address": string | null,"venue_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"name": string,"organization_id": string,"slug": string,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["event_status"],"updated_at"?: string,"venue_address"?: string | null,"venue_name"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"ends_at"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"slug"?: string,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["event_status"],"updated_at"?: string,"venue_address"?: string | null,"venue_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_payments": {
                  Row: {
                    "amount_ore": number,"created_at": string,"event_id": string,"id": string,"organization_id": string,"paid_at": string,"provider": Database["public"]['Enums']["payment_provider"],"provider_payment_id": string | null,"stall_fee_id": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ore": number,"created_at"?: string,"event_id": string,"id"?: string,"organization_id": string,"paid_at"?: string,"provider": Database["public"]['Enums']["payment_provider"],"provider_payment_id"?: string | null,"stall_fee_id": string,"vendor_id": string
                  }
                  Update: {
                    "amount_ore"?: number,"created_at"?: string,"event_id"?: string,"id"?: string,"organization_id"?: string,"paid_at"?: string,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_payment_id"?: string | null,"stall_fee_id"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_payments_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "fee_payments_stall_fee_id_organization_id_fkey"
      columns: ["stall_fee_id","organization_id"]
isOneToOne: false
      referencedRelation: "stall_fees"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "fee_payments_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_notes": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"event_id": string,"event_vendor_id": string,"id": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"event_id": string,"event_vendor_id": string,"id"?: string,"organization_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"event_id"?: string,"event_vendor_id"?: string,"id"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_notes_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "internal_notes_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"invoice_counters": {
                  Row: {
                    "last_number": number,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_number"?: number,"organization_id": string
                  }
                  Update: {
                    "last_number"?: number,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_counters_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "created_at": string,"due_at": string | null,"event_id": string,"id": string,"invoice_number": number,"issued_at": string,"kind": Database["public"]['Enums']["invoice_kind"],"mva_ore": number,"organization_id": string,"pdf_path": string | null,"settled_by_deduction": boolean,"settlement_id": string | null,"stall_fee_id": string | null,"status": Database["public"]['Enums']["invoice_status"],"subtotal_ore": number,"total_ore": number,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"due_at"?: string | null,"event_id": string,"id"?: string,"invoice_number"?: number,"issued_at"?: string,"kind": Database["public"]['Enums']["invoice_kind"],"mva_ore"?: number,"organization_id": string,"pdf_path"?: string | null,"settled_by_deduction"?: boolean,"settlement_id"?: string | null,"stall_fee_id"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_ore": number,"total_ore": number,"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"due_at"?: string | null,"event_id"?: string,"id"?: string,"invoice_number"?: number,"issued_at"?: string,"kind"?: Database["public"]['Enums']["invoice_kind"],"mva_ore"?: number,"organization_id"?: string,"pdf_path"?: string | null,"settled_by_deduction"?: boolean,"settlement_id"?: string | null,"stall_fee_id"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_ore"?: number,"total_ore"?: number,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "invoices_settlement_id_organization_id_fkey"
      columns: ["settlement_id","organization_id"]
isOneToOne: false
      referencedRelation: "settlements"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "invoices_stall_fee_id_organization_id_fkey"
      columns: ["stall_fee_id","organization_id"]
isOneToOne: false
      referencedRelation: "stall_fees"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "invoices_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "consent_text_version": string,"consented_at": string,"created_at": string,"email": string,"event_date": string | null,"event_id": string | null,"guest_count": number | null,"id": string,"kind": Database["public"]['Enums']["lead_kind"],"marketing_opt_in": boolean,"message": string,"name": string,"organization_id": string,"phone": string | null,"status": Database["public"]['Enums']["lead_status"],"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consent_text_version": string,"consented_at"?: string,"created_at"?: string,"email": string,"event_date"?: string | null,"event_id"?: string | null,"guest_count"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["lead_kind"],"marketing_opt_in"?: boolean,"message": string,"name": string,"organization_id": string,"phone"?: string | null,"status"?: Database["public"]['Enums']["lead_status"],"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "consent_text_version"?: string,"consented_at"?: string,"created_at"?: string,"email"?: string,"event_date"?: string | null,"event_id"?: string | null,"guest_count"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["lead_kind"],"marketing_opt_in"?: boolean,"message"?: string,"name"?: string,"organization_id"?: string,"phone"?: string | null,"status"?: Database["public"]['Enums']["lead_status"],"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "leads_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_vendor_org_fkey"
      columns: ["vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "account": Database["public"]['Enums']["ledger_account"],"amount_ore": number,"created_at": string,"created_by": string | null,"description": string | null,"direction": Database["public"]['Enums']["ledger_direction"],"entry_type": Database["public"]['Enums']["ledger_entry_type"],"event_id": string,"id": string,"order_id": string | null,"organization_id": string,"payment_id": string | null,"payout_id": string | null,"refund_id": string | null,"settlement_id": string | null,"transaction_id": string,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account": Database["public"]['Enums']["ledger_account"],"amount_ore": number,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"direction": Database["public"]['Enums']["ledger_direction"],"entry_type": Database["public"]['Enums']["ledger_entry_type"],"event_id": string,"id"?: string,"order_id"?: string | null,"organization_id": string,"payment_id"?: string | null,"payout_id"?: string | null,"refund_id"?: string | null,"settlement_id"?: string | null,"transaction_id": string,"vendor_id"?: string | null
                  }
                  Update: {
                    "account"?: Database["public"]['Enums']["ledger_account"],"amount_ore"?: number,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"direction"?: Database["public"]['Enums']["ledger_direction"],"entry_type"?: Database["public"]['Enums']["ledger_entry_type"],"event_id"?: string,"id"?: string,"order_id"?: string | null,"organization_id"?: string,"payment_id"?: string | null,"payout_id"?: string | null,"refund_id"?: string | null,"settlement_id"?: string | null,"transaction_id"?: string,"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "ledger_entries_order_id_organization_id_fkey"
      columns: ["order_id","organization_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "ledger_entries_payment_id_organization_id_fkey"
      columns: ["payment_id","organization_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "ledger_entries_payout_id_fkey"
      columns: ["payout_id"]
isOneToOne: false
      referencedRelation: "payouts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_refund_id_fkey"
      columns: ["refund_id"]
isOneToOne: false
      referencedRelation: "refunds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_settlement_id_organization_id_fkey"
      columns: ["settlement_id","organization_id"]
isOneToOne: false
      referencedRelation: "settlements"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "ledger_entries_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"role": Database["public"]['Enums']["membership_role"],"sponsor_id": string | null,"user_id": string,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"role": Database["public"]['Enums']["membership_role"],"sponsor_id"?: string | null,"user_id": string,"vendor_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["membership_role"],"sponsor_id"?: string | null,"user_id"?: string,"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_sponsor_id_fkey"
      columns: ["sponsor_id"]
isOneToOne: false
      referencedRelation: "sponsors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"kind": string,"link_path": string | null,"organization_id": string,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"link_path"?: string | null,"organization_id": string,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"link_path"?: string | null,"organization_id"?: string,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"line_total_ore": number,"mva_ore": number,"mva_rate_bp": number,"order_id": string,"organization_id": string,"product_id": string,"product_name": string,"quantity": number,"unit_price_ore": number,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"line_total_ore": number,"mva_ore"?: number,"mva_rate_bp"?: number,"order_id": string,"organization_id": string,"product_id": string,"product_name": string,"quantity": number,"unit_price_ore": number,"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"line_total_ore"?: number,"mva_ore"?: number,"mva_rate_bp"?: number,"order_id"?: string,"organization_id"?: string,"product_id"?: string,"product_name"?: string,"quantity"?: number,"unit_price_ore"?: number,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "order_items_order_id_organization_id_fkey"
      columns: ["order_id","organization_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "order_items_order_id_vendor_id_fkey"
      columns: ["order_id","vendor_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","vendor_id"]
    },{
      foreignKeyName: "order_items_product_id_vendor_id_fkey"
      columns: ["product_id","vendor_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","vendor_id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "accepted_at": string | null,"cancelled_at": string | null,"collected_at": string | null,"commission_fixed_ore": number | null,"commission_mva_ore": number | null,"commission_ore": number | null,"commission_rate_bp": number | null,"commission_rule_id": string | null,"commission_type": Database["public"]['Enums']["commission_type"] | null,"created_at": string,"customer_email": string | null,"customer_name": string | null,"event_id": string,"event_vendor_id": string,"id": string,"locale": string,"mva_ore": number,"order_number": number,"organization_id": string,"paid_at": string | null,"pickup_note": string | null,"platform_fee_ore": number | null,"ready_at": string | null,"service_date": string,"status": Database["public"]['Enums']["order_status"],"total_ore": number,"tracking_token": string,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"collected_at"?: string | null,"commission_fixed_ore"?: number | null,"commission_mva_ore"?: number | null,"commission_ore"?: number | null,"commission_rate_bp"?: number | null,"commission_rule_id"?: string | null,"commission_type"?: Database["public"]['Enums']["commission_type"] | null,"created_at"?: string,"customer_email"?: string | null,"customer_name"?: string | null,"event_id": string,"event_vendor_id": string,"id"?: string,"locale"?: string,"mva_ore"?: number,"order_number"?: number,"organization_id": string,"paid_at"?: string | null,"pickup_note"?: string | null,"platform_fee_ore"?: number | null,"ready_at"?: string | null,"service_date"?: string,"status"?: Database["public"]['Enums']["order_status"],"total_ore": number,"tracking_token"?: string,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"collected_at"?: string | null,"commission_fixed_ore"?: number | null,"commission_mva_ore"?: number | null,"commission_ore"?: number | null,"commission_rate_bp"?: number | null,"commission_rule_id"?: string | null,"commission_type"?: Database["public"]['Enums']["commission_type"] | null,"created_at"?: string,"customer_email"?: string | null,"customer_name"?: string | null,"event_id"?: string,"event_vendor_id"?: string,"id"?: string,"locale"?: string,"mva_ore"?: number,"order_number"?: number,"organization_id"?: string,"paid_at"?: string | null,"pickup_note"?: string | null,"platform_fee_ore"?: number | null,"ready_at"?: string | null,"service_date"?: string,"status"?: Database["public"]['Enums']["order_status"],"total_ore"?: number,"tracking_token"?: string,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_commission_rule_id_fkey"
      columns: ["commission_rule_id"]
isOneToOne: false
      referencedRelation: "commission_rules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "orders_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "orders_event_vendor_id_vendor_id_fkey"
      columns: ["event_vendor_id","vendor_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","vendor_id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"default_locale": string,"id": string,"name": string,"org_number": string | null,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_locale"?: string,"id"?: string,"name": string,"org_number"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_locale"?: string,"id"?: string,"name"?: string,"org_number"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"page_views": {
                  Row: {
                    "device_class": string | null,"event_id": string | null,"id": string,"organization_id": string,"path": string,"vendor_id": string | null,"viewed_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "device_class"?: string | null,"event_id"?: string | null,"id"?: string,"organization_id": string,"path": string,"vendor_id"?: string | null,"viewed_at"?: string
                  }
                  Update: {
                    "device_class"?: string | null,"event_id"?: string | null,"id"?: string,"organization_id"?: string,"path"?: string,"vendor_id"?: string | null,"viewed_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_views_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "page_views_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "page_views_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_ore": number,"created_at": string,"currency": string,"event_id": string,"failure_reason": string | null,"id": string,"idempotency_key": string,"method": Database["public"]['Enums']["payment_method"] | null,"order_id": string,"organization_id": string,"platform_fee_ore": number,"provider": Database["public"]['Enums']["payment_provider"],"provider_payment_id": string | null,"psp_fee_ore": number | null,"status": Database["public"]['Enums']["payment_status"],"succeeded_at": string | null,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ore": number,"created_at"?: string,"currency"?: string,"event_id": string,"failure_reason"?: string | null,"id"?: string,"idempotency_key": string,"method"?: Database["public"]['Enums']["payment_method"] | null,"order_id": string,"organization_id": string,"platform_fee_ore": number,"provider": Database["public"]['Enums']["payment_provider"],"provider_payment_id"?: string | null,"psp_fee_ore"?: number | null,"status"?: Database["public"]['Enums']["payment_status"],"succeeded_at"?: string | null,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "amount_ore"?: number,"created_at"?: string,"currency"?: string,"event_id"?: string,"failure_reason"?: string | null,"id"?: string,"idempotency_key"?: string,"method"?: Database["public"]['Enums']["payment_method"] | null,"order_id"?: string,"organization_id"?: string,"platform_fee_ore"?: number,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_payment_id"?: string | null,"psp_fee_ore"?: number | null,"status"?: Database["public"]['Enums']["payment_status"],"succeeded_at"?: string | null,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "payments_order_id_organization_id_fkey"
      columns: ["order_id","organization_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "payments_order_id_vendor_id_fkey"
      columns: ["order_id","vendor_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","vendor_id"]
    }
                  ]
                },"payouts": {
                  Row: {
                    "amount_ore": number,"attempt": number,"created_at": string,"event_id": string,"failure_reason": string | null,"id": string,"organization_id": string,"paid_at": string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_payout_id": string | null,"settlement_id": string,"settlement_line_id": string,"status": Database["public"]['Enums']["payout_status"],"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ore": number,"attempt"?: number,"created_at"?: string,"event_id": string,"failure_reason"?: string | null,"id"?: string,"organization_id": string,"paid_at"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_payout_id"?: string | null,"settlement_id": string,"settlement_line_id": string,"status"?: Database["public"]['Enums']["payout_status"],"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "amount_ore"?: number,"attempt"?: number,"created_at"?: string,"event_id"?: string,"failure_reason"?: string | null,"id"?: string,"organization_id"?: string,"paid_at"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_payout_id"?: string | null,"settlement_id"?: string,"settlement_line_id"?: string,"status"?: Database["public"]['Enums']["payout_status"],"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payouts_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "payouts_settlement_id_organization_id_fkey"
      columns: ["settlement_id","organization_id"]
isOneToOne: false
      referencedRelation: "settlements"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "payouts_settlement_line_id_organization_id_fkey"
      columns: ["settlement_line_id","organization_id"]
isOneToOne: false
      referencedRelation: "settlement_lines"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "payouts_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_availability": {
                  Row: {
                    "event_id": string,"event_vendor_id": string,"id": string,"is_available": boolean,"organization_id": string,"product_id": string,"sort_order": number,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"event_vendor_id": string,"id"?: string,"is_available"?: boolean,"organization_id": string,"product_id": string,"sort_order"?: number,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "event_id"?: string,"event_vendor_id"?: string,"id"?: string,"is_available"?: boolean,"organization_id"?: string,"product_id"?: string,"sort_order"?: number,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_availability_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "product_availability_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "product_availability_event_vendor_id_vendor_id_fkey"
      columns: ["event_vendor_id","vendor_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","vendor_id"]
    },{
      foreignKeyName: "product_availability_product_id_vendor_id_fkey"
      columns: ["product_id","vendor_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","vendor_id"]
    }
                  ]
                },"product_categories": {
                  Row: {
                    "created_at": string,"id": string,"name_en": string,"name_nb": string,"organization_id": string,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name_en": string,"name_nb": string,"organization_id": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name_en"?: string,"name_nb"?: string,"organization_id"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_categories_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "allergens": (Database["public"]['Enums']["allergen"])[],"archived_at": string | null,"category_id": string | null,"created_at": string,"description": string | null,"dietary_tags": (Database["public"]['Enums']["dietary_tag"])[],"id": string,"image_path": string | null,"mva_rate_bp": number,"name": string,"organization_id": string,"price_ore": number,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergens"?: (Database["public"]['Enums']["allergen"])[],"archived_at"?: string | null,"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"dietary_tags"?: (Database["public"]['Enums']["dietary_tag"])[],"id"?: string,"image_path"?: string | null,"mva_rate_bp"?: number,"name": string,"organization_id": string,"price_ore": number,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "allergens"?: (Database["public"]['Enums']["allergen"])[],"archived_at"?: string | null,"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"dietary_tags"?: (Database["public"]['Enums']["dietary_tag"])[],"id"?: string,"image_path"?: string | null,"mva_rate_bp"?: number,"name"?: string,"organization_id"?: string,"price_ore"?: number,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_organization_id_fkey"
      columns: ["category_id","organization_id"]
isOneToOne: false
      referencedRelation: "product_categories"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "products_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_vendor_org_fkey"
      columns: ["vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"psp_webhook_attempts": {
                  Row: {
                    "attempted_at": string,"error": string | null,"id": string,"organization_id": string | null,"outcome": Database["public"]['Enums']["webhook_outcome"],"webhook_event_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"error"?: string | null,"id"?: string,"organization_id"?: string | null,"outcome": Database["public"]['Enums']["webhook_outcome"],"webhook_event_id": string
                  }
                  Update: {
                    "attempted_at"?: string,"error"?: string | null,"id"?: string,"organization_id"?: string | null,"outcome"?: Database["public"]['Enums']["webhook_outcome"],"webhook_event_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "psp_webhook_attempts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "psp_webhook_attempts_webhook_event_id_fkey"
      columns: ["webhook_event_id"]
isOneToOne: false
      referencedRelation: "psp_webhook_events"
      referencedColumns: ["id"]
    }
                  ]
                },"psp_webhook_events": {
                  Row: {
                    "event_type": string,"id": string,"organization_id": string | null,"payload": NonNullable<Json>,"provider": Database["public"]['Enums']["payment_provider"],"provider_event_id": string,"received_at": string,"signature_valid": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "event_type": string,"id"?: string,"organization_id"?: string | null,"payload": NonNullable<Json>,"provider": Database["public"]['Enums']["payment_provider"],"provider_event_id": string,"received_at"?: string,"signature_valid": boolean
                  }
                  Update: {
                    "event_type"?: string,"id"?: string,"organization_id"?: string | null,"payload"?: NonNullable<Json>,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_event_id"?: string,"received_at"?: string,"signature_valid"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "psp_webhook_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"qr_scans": {
                  Row: {
                    "device_class": string | null,"event_id": string,"id": string,"organization_id": string,"scanned_at": string,"tracked_link_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "device_class"?: string | null,"event_id": string,"id"?: string,"organization_id": string,"scanned_at"?: string,"tracked_link_id": string
                  }
                  Update: {
                    "device_class"?: string | null,"event_id"?: string,"id"?: string,"organization_id"?: string,"scanned_at"?: string,"tracked_link_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qr_scans_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "qr_scans_tracked_link_id_organization_id_fkey"
      columns: ["tracked_link_id","organization_id"]
isOneToOne: false
      referencedRelation: "tracked_links"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"refunds": {
                  Row: {
                    "amount_ore": number,"created_at": string,"event_id": string,"id": string,"order_id": string,"organization_id": string,"payment_id": string,"platform_fee_reversal_ore": number,"provider_refund_id": string | null,"reason": string,"requested_by": string | null,"status": Database["public"]['Enums']["refund_status"],"succeeded_at": string | null,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ore": number,"created_at"?: string,"event_id": string,"id"?: string,"order_id": string,"organization_id": string,"payment_id": string,"platform_fee_reversal_ore"?: number,"provider_refund_id"?: string | null,"reason": string,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["refund_status"],"succeeded_at"?: string | null,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "amount_ore"?: number,"created_at"?: string,"event_id"?: string,"id"?: string,"order_id"?: string,"organization_id"?: string,"payment_id"?: string,"platform_fee_reversal_ore"?: number,"provider_refund_id"?: string | null,"reason"?: string,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["refund_status"],"succeeded_at"?: string | null,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "refunds_order_id_vendor_id_fkey"
      columns: ["order_id","vendor_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","vendor_id"]
    },{
      foreignKeyName: "refunds_payment_id_organization_id_fkey"
      columns: ["payment_id","organization_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"settlement_adjustments": {
                  Row: {
                    "amount_ore": number,"approved_at": string | null,"approved_by": string | null,"created_at": string,"created_by": string,"event_id": string,"id": string,"organization_id": string,"reason": string,"settlement_id": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ore": number,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by": string,"event_id": string,"id"?: string,"organization_id": string,"reason": string,"settlement_id": string,"vendor_id": string
                  }
                  Update: {
                    "amount_ore"?: number,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string,"event_id"?: string,"id"?: string,"organization_id"?: string,"reason"?: string,"settlement_id"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_adjustments_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "settlement_adjustments_settlement_id_organization_id_fkey"
      columns: ["settlement_id","organization_id"]
isOneToOne: false
      referencedRelation: "settlements"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "settlement_adjustments_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"settlement_lines": {
                  Row: {
                    "adjustments_ore": number,"commission_mva_ore": number,"commission_ore": number,"created_at": string,"event_id": string,"event_vendor_id": string,"gross_sales_ore": number,"id": string,"net_payout_ore": number,"organization_id": string,"refunds_ore": number,"settlement_id": string,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustments_ore"?: number,"commission_mva_ore"?: number,"commission_ore"?: number,"created_at"?: string,"event_id": string,"event_vendor_id": string,"gross_sales_ore": number,"id"?: string,"net_payout_ore": number,"organization_id": string,"refunds_ore"?: number,"settlement_id": string,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "adjustments_ore"?: number,"commission_mva_ore"?: number,"commission_ore"?: number,"created_at"?: string,"event_id"?: string,"event_vendor_id"?: string,"gross_sales_ore"?: number,"id"?: string,"net_payout_ore"?: number,"organization_id"?: string,"refunds_ore"?: number,"settlement_id"?: string,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_lines_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "settlement_lines_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "settlement_lines_event_vendor_id_vendor_id_fkey"
      columns: ["event_vendor_id","vendor_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","vendor_id"]
    },{
      foreignKeyName: "settlement_lines_settlement_id_organization_id_fkey"
      columns: ["settlement_id","organization_id"]
isOneToOne: false
      referencedRelation: "settlements"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"settlements": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"created_by": string | null,"event_id": string,"id": string,"notes": string | null,"organization_id": string,"prepared_at": string | null,"prepared_by": string | null,"released_at": string | null,"status": Database["public"]['Enums']["settlement_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_id": string,"id"?: string,"notes"?: string | null,"organization_id": string,"prepared_at"?: string | null,"prepared_by"?: string | null,"released_at"?: string | null,"status"?: Database["public"]['Enums']["settlement_status"],"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_id"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"prepared_at"?: string | null,"prepared_by"?: string | null,"released_at"?: string | null,"status"?: Database["public"]['Enums']["settlement_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlements_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"sponsor_assets": {
                  Row: {
                    "created_at": string,"event_id": string,"file_name": string,"id": string,"kind": Database["public"]['Enums']["asset_kind"],"organization_id": string,"reviewed_at": string | null,"reviewed_by": string | null,"sponsor_id": string,"sponsorship_id": string,"status": Database["public"]['Enums']["review_status"],"storage_path": string,"updated_at": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"file_name": string,"id"?: string,"kind": Database["public"]['Enums']["asset_kind"],"organization_id": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sponsor_id": string,"sponsorship_id": string,"status"?: Database["public"]['Enums']["review_status"],"storage_path": string,"updated_at"?: string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"file_name"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["asset_kind"],"organization_id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sponsor_id"?: string,"sponsorship_id"?: string,"status"?: Database["public"]['Enums']["review_status"],"storage_path"?: string,"updated_at"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_assets_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "sponsor_assets_sponsorship_id_organization_id_fkey"
      columns: ["sponsorship_id","organization_id"]
isOneToOne: false
      referencedRelation: "sponsorships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "sponsor_assets_sponsorship_id_sponsor_id_fkey"
      columns: ["sponsorship_id","sponsor_id"]
isOneToOne: false
      referencedRelation: "sponsorships"
      referencedColumns: ["id","sponsor_id"]
    }
                  ]
                },"sponsor_packages": {
                  Row: {
                    "created_at": string,"deliverables": (string)[],"description": string | null,"event_id": string,"id": string,"is_active": boolean,"max_sponsors": number | null,"name": string,"organization_id": string,"price_ore": number,"tier": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deliverables"?: (string)[],"description"?: string | null,"event_id": string,"id"?: string,"is_active"?: boolean,"max_sponsors"?: number | null,"name": string,"organization_id": string,"price_ore": number,"tier"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deliverables"?: (string)[],"description"?: string | null,"event_id"?: string,"id"?: string,"is_active"?: boolean,"max_sponsors"?: number | null,"name"?: string,"organization_id"?: string,"price_ore"?: number,"tier"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_packages_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"sponsors": {
                  Row: {
                    "contact_email": string | null,"contact_name": string | null,"contact_phone": string | null,"created_at": string,"id": string,"invoice_address": string | null,"invoice_email": string | null,"invoice_reference": string | null,"logo_path": string | null,"name": string,"org_number": string | null,"organization_id": string,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_email"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"invoice_address"?: string | null,"invoice_email"?: string | null,"invoice_reference"?: string | null,"logo_path"?: string | null,"name": string,"org_number"?: string | null,"organization_id": string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "contact_email"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"invoice_address"?: string | null,"invoice_email"?: string | null,"invoice_reference"?: string | null,"logo_path"?: string | null,"name"?: string,"org_number"?: string | null,"organization_id"?: string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsors_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"sponsorships": {
                  Row: {
                    "agreed_price_ore": number | null,"created_at": string,"event_id": string,"id": string,"notes": string | null,"organization_id": string,"package_id": string,"sponsor_id": string,"status": Database["public"]['Enums']["sponsorship_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreed_price_ore"?: number | null,"created_at"?: string,"event_id": string,"id"?: string,"notes"?: string | null,"organization_id": string,"package_id": string,"sponsor_id": string,"status"?: Database["public"]['Enums']["sponsorship_status"],"updated_at"?: string
                  }
                  Update: {
                    "agreed_price_ore"?: number | null,"created_at"?: string,"event_id"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"package_id"?: string,"sponsor_id"?: string,"status"?: Database["public"]['Enums']["sponsorship_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsorships_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "sponsorships_package_id_organization_id_fkey"
      columns: ["package_id","organization_id"]
isOneToOne: false
      referencedRelation: "sponsor_packages"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "sponsorships_sponsor_id_fkey"
      columns: ["sponsor_id"]
isOneToOne: false
      referencedRelation: "sponsors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sponsorships_sponsor_org_fkey"
      columns: ["sponsor_id","organization_id"]
isOneToOne: false
      referencedRelation: "sponsors"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"stall_assignments": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"event_id": string,"event_vendor_id": string,"id": string,"organization_id": string,"released_at": string | null,"stall_id": string,"status": Database["public"]['Enums']["assignment_status"],"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"event_id": string,"event_vendor_id": string,"id"?: string,"organization_id": string,"released_at"?: string | null,"stall_id": string,"status"?: Database["public"]['Enums']["assignment_status"],"vendor_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"event_id"?: string,"event_vendor_id"?: string,"id"?: string,"organization_id"?: string,"released_at"?: string | null,"stall_id"?: string,"status"?: Database["public"]['Enums']["assignment_status"],"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stall_assignments_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "stall_assignments_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "stall_assignments_event_vendor_id_vendor_id_fkey"
      columns: ["event_vendor_id","vendor_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","vendor_id"]
    },{
      foreignKeyName: "stall_assignments_stall_id_organization_id_fkey"
      columns: ["stall_id","organization_id"]
isOneToOne: false
      referencedRelation: "stalls"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "stall_assignments_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"stall_fees": {
                  Row: {
                    "amount_ore": number,"created_at": string,"created_by": string | null,"due_at": string | null,"event_id": string,"event_vendor_id": string,"id": string,"mva_ore": number,"organization_id": string,"paid_at": string | null,"payment_link_url": string | null,"stall_id": string | null,"status": Database["public"]['Enums']["stall_fee_status"],"total_ore": number,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_ore": number,"created_at"?: string,"created_by"?: string | null,"due_at"?: string | null,"event_id": string,"event_vendor_id": string,"id"?: string,"mva_ore"?: number,"organization_id": string,"paid_at"?: string | null,"payment_link_url"?: string | null,"stall_id"?: string | null,"status"?: Database["public"]['Enums']["stall_fee_status"],"total_ore": number,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "amount_ore"?: number,"created_at"?: string,"created_by"?: string | null,"due_at"?: string | null,"event_id"?: string,"event_vendor_id"?: string,"id"?: string,"mva_ore"?: number,"organization_id"?: string,"paid_at"?: string | null,"payment_link_url"?: string | null,"stall_id"?: string | null,"status"?: Database["public"]['Enums']["stall_fee_status"],"total_ore"?: number,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stall_fees_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "stall_fees_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "stall_fees_event_vendor_id_vendor_id_fkey"
      columns: ["event_vendor_id","vendor_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","vendor_id"]
    },{
      foreignKeyName: "stall_fees_stall_id_organization_id_fkey"
      columns: ["stall_id","organization_id"]
isOneToOne: false
      referencedRelation: "stalls"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"stalls": {
                  Row: {
                    "created_at": string,"depth_cm": number | null,"event_id": string,"fee_ore": number,"has_power": boolean,"has_water": boolean,"id": string,"is_premium": boolean,"map_x": number | null,"map_y": number | null,"number": string,"organization_id": string,"size_label": string | null,"updated_at": string,"width_cm": number | null,"zone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"depth_cm"?: number | null,"event_id": string,"fee_ore"?: number,"has_power"?: boolean,"has_water"?: boolean,"id"?: string,"is_premium"?: boolean,"map_x"?: number | null,"map_y"?: number | null,"number": string,"organization_id": string,"size_label"?: string | null,"updated_at"?: string,"width_cm"?: number | null,"zone"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"depth_cm"?: number | null,"event_id"?: string,"fee_ore"?: number,"has_power"?: boolean,"has_water"?: boolean,"id"?: string,"is_premium"?: boolean,"map_x"?: number | null,"map_y"?: number | null,"number"?: string,"organization_id"?: string,"size_label"?: string | null,"updated_at"?: string,"width_cm"?: number | null,"zone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stalls_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"tracked_links": {
                  Row: {
                    "created_at": string,"event_id": string,"event_vendor_id": string | null,"id": string,"kind": Database["public"]['Enums']["link_kind"],"label": string | null,"organization_id": string,"slug": string,"sponsor_id": string | null,"sponsorship_id": string | null,"target_url": string,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"event_vendor_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["link_kind"],"label"?: string | null,"organization_id": string,"slug": string,"sponsor_id"?: string | null,"sponsorship_id"?: string | null,"target_url": string,"vendor_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"event_vendor_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["link_kind"],"label"?: string | null,"organization_id"?: string,"slug"?: string,"sponsor_id"?: string | null,"sponsorship_id"?: string | null,"target_url"?: string,"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracked_links_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "tracked_links_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "tracked_links_event_vendor_id_vendor_id_fkey"
      columns: ["event_vendor_id","vendor_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","vendor_id"]
    },{
      foreignKeyName: "tracked_links_sponsor_id_fkey"
      columns: ["sponsor_id"]
isOneToOne: false
      referencedRelation: "sponsors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tracked_links_sponsorship_id_organization_id_fkey"
      columns: ["sponsorship_id","organization_id"]
isOneToOne: false
      referencedRelation: "sponsorships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "tracked_links_sponsorship_id_sponsor_id_fkey"
      columns: ["sponsorship_id","sponsor_id"]
isOneToOne: false
      referencedRelation: "sponsorships"
      referencedColumns: ["id","sponsor_id"]
    },{
      foreignKeyName: "tracked_links_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_agreements": {
                  Row: {
                    "accepted_at": string,"accepted_by": string,"commission_terms": string,"event_id": string,"event_vendor_id": string,"id": string,"organization_id": string,"settlement_terms": string,"stall_fee_terms": string,"terms_version": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"accepted_by": string,"commission_terms": string,"event_id": string,"event_vendor_id": string,"id"?: string,"organization_id": string,"settlement_terms": string,"stall_fee_terms": string,"terms_version": string,"vendor_id": string
                  }
                  Update: {
                    "accepted_at"?: string,"accepted_by"?: string,"commission_terms"?: string,"event_id"?: string,"event_vendor_id"?: string,"id"?: string,"organization_id"?: string,"settlement_terms"?: string,"stall_fee_terms"?: string,"terms_version"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_agreements_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "vendor_agreements_event_vendor_id_organization_id_fkey"
      columns: ["event_vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "event_vendors"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "vendor_agreements_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_contacts": {
                  Row: {
                    "contact_email": string,"contact_name": string,"contact_phone": string | null,"created_at": string,"organization_id": string,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_email": string,"contact_name": string,"contact_phone"?: string | null,"created_at"?: string,"organization_id": string,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "contact_email"?: string,"contact_name"?: string,"contact_phone"?: string | null,"created_at"?: string,"organization_id"?: string,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_contacts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_contacts_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: true
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_contacts_vendor_org_fkey"
      columns: ["vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"vendor_documents": {
                  Row: {
                    "created_at": string,"document_type": Database["public"]['Enums']["document_type"],"expires_on": string | null,"file_name": string,"id": string,"organization_id": string,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["review_status"],"storage_path": string,"updated_at": string,"uploaded_by": string | null,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_type": Database["public"]['Enums']["document_type"],"expires_on"?: string | null,"file_name": string,"id"?: string,"organization_id": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["review_status"],"storage_path": string,"updated_at"?: string,"uploaded_by"?: string | null,"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"document_type"?: Database["public"]['Enums']["document_type"],"expires_on"?: string | null,"file_name"?: string,"id"?: string,"organization_id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["review_status"],"storage_path"?: string,"updated_at"?: string,"uploaded_by"?: string | null,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_documents_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_documents_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_documents_vendor_org_fkey"
      columns: ["vendor_id","organization_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"vendors": {
                  Row: {
                    "brreg_status": string | null,"brreg_verified_at": string | null,"business_form": string | null,"category": string | null,"cover_image_path": string | null,"created_at": string,"cuisine_country": string | null,"description": string | null,"display_name": string,"facebook_url": string | null,"id": string,"instagram_handle": string | null,"legal_name": string,"logo_path": string | null,"mva_registered": boolean,"offers_catering": boolean,"org_number": string,"organization_id": string,"profile_published": boolean,"public_email": string | null,"public_phone": string | null,"slug": string,"story": string | null,"tiktok_handle": string | null,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brreg_status"?: string | null,"brreg_verified_at"?: string | null,"business_form"?: string | null,"category"?: string | null,"cover_image_path"?: string | null,"created_at"?: string,"cuisine_country"?: string | null,"description"?: string | null,"display_name": string,"facebook_url"?: string | null,"id"?: string,"instagram_handle"?: string | null,"legal_name": string,"logo_path"?: string | null,"mva_registered"?: boolean,"offers_catering"?: boolean,"org_number": string,"organization_id": string,"profile_published"?: boolean,"public_email"?: string | null,"public_phone"?: string | null,"slug": string,"story"?: string | null,"tiktok_handle"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "brreg_status"?: string | null,"brreg_verified_at"?: string | null,"business_form"?: string | null,"category"?: string | null,"cover_image_path"?: string | null,"created_at"?: string,"cuisine_country"?: string | null,"description"?: string | null,"display_name"?: string,"facebook_url"?: string | null,"id"?: string,"instagram_handle"?: string | null,"legal_name"?: string,"logo_path"?: string | null,"mva_registered"?: boolean,"offers_catering"?: boolean,"org_number"?: string,"organization_id"?: string,"profile_published"?: boolean,"public_email"?: string | null,"public_phone"?: string | null,"slug"?: string,"story"?: string | null,"tiktok_handle"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendors_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "allergen": "gluten"|"crustaceans"|"eggs"|"fish"|"peanuts"|"soybeans"|"milk"|"nuts"|"celery"|"mustard"|"sesame"|"sulphites"|"lupin"|"molluscs","application_status": "draft"|"submitted"|"under_review"|"more_info_requested"|"approved"|"rejected"|"waitlisted"|"withdrawn","asset_kind": "logo"|"banner"|"video"|"other","assignment_status": "active"|"released","audit_action": "insert"|"update"|"delete","commission_scope": "organization"|"event"|"category"|"vendor","commission_type": "percentage"|"fixed"|"hybrid","dietary_tag": "vegetarian"|"vegan"|"halal"|"gluten_free"|"dairy_free"|"spicy","document_type": "mattilsynet_registration"|"insurance"|"other","event_status": "draft"|"published"|"closed"|"archived","invoice_kind": "commission"|"stall_fee","invoice_status": "issued"|"paid"|"credited","lead_kind": "contact"|"catering"|"quote","lead_status": "new"|"contacted"|"closed","ledger_account": "psp_clearing"|"vendor_payable"|"vendor_receivable"|"commission_revenue"|"mva_payable"|"psp_fee_expense","ledger_direction": "debit"|"credit","ledger_entry_type": "sale"|"commission"|"commission_mva"|"psp_fee"|"refund"|"refund_commission_reversal"|"payout"|"adjustment"|"dispute","link_kind": "qr"|"link","membership_role": "org_admin"|"event_admin"|"vendor"|"sponsor","order_status": "pending_payment"|"new"|"accepted"|"preparing"|"ready"|"collected"|"cancelled","payment_method": "vipps"|"card"|"apple_pay"|"google_pay","payment_provider": "mock"|"stripe"|"swedbank","payment_status": "pending"|"succeeded"|"failed"|"cancelled","payout_status": "pending"|"in_transit"|"paid"|"failed","psp_account_status": "not_started"|"pending"|"eligible"|"restricted","refund_status": "pending"|"succeeded"|"failed","review_status": "pending"|"accepted"|"rejected","settlement_status": "draft"|"prepared"|"approved"|"releasing"|"completed"|"completed_with_failures"|"cancelled","sponsorship_status": "inquiry"|"confirmed"|"invoiced"|"paid"|"cancelled","stall_fee_status": "open"|"invoiced"|"paid"|"cancelled","webhook_outcome": "processed"|"ignored"|"failed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "allergen": ["gluten", "crustaceans", "eggs", "fish", "peanuts", "soybeans", "milk", "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs"],"application_status": ["draft", "submitted", "under_review", "more_info_requested", "approved", "rejected", "waitlisted", "withdrawn"],"asset_kind": ["logo", "banner", "video", "other"],"assignment_status": ["active", "released"],"audit_action": ["insert", "update", "delete"],"commission_scope": ["organization", "event", "category", "vendor"],"commission_type": ["percentage", "fixed", "hybrid"],"dietary_tag": ["vegetarian", "vegan", "halal", "gluten_free", "dairy_free", "spicy"],"document_type": ["mattilsynet_registration", "insurance", "other"],"event_status": ["draft", "published", "closed", "archived"],"invoice_kind": ["commission", "stall_fee"],"invoice_status": ["issued", "paid", "credited"],"lead_kind": ["contact", "catering", "quote"],"lead_status": ["new", "contacted", "closed"],"ledger_account": ["psp_clearing", "vendor_payable", "vendor_receivable", "commission_revenue", "mva_payable", "psp_fee_expense"],"ledger_direction": ["debit", "credit"],"ledger_entry_type": ["sale", "commission", "commission_mva", "psp_fee", "refund", "refund_commission_reversal", "payout", "adjustment", "dispute"],"link_kind": ["qr", "link"],"membership_role": ["org_admin", "event_admin", "vendor", "sponsor"],"order_status": ["pending_payment", "new", "accepted", "preparing", "ready", "collected", "cancelled"],"payment_method": ["vipps", "card", "apple_pay", "google_pay"],"payment_provider": ["mock", "stripe", "swedbank"],"payment_status": ["pending", "succeeded", "failed", "cancelled"],"payout_status": ["pending", "in_transit", "paid", "failed"],"psp_account_status": ["not_started", "pending", "eligible", "restricted"],"refund_status": ["pending", "succeeded", "failed"],"review_status": ["pending", "accepted", "rejected"],"settlement_status": ["draft", "prepared", "approved", "releasing", "completed", "completed_with_failures", "cancelled"],"sponsorship_status": ["inquiry", "confirmed", "invoiced", "paid", "cancelled"],"stall_fee_status": ["open", "invoiced", "paid", "cancelled"],"webhook_outcome": ["processed", "ignored", "failed"]
          }
        }
} as const
