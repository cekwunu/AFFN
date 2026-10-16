# CSV exports (TRX-03)

Admins download these at **Admin → Exports** (`/admin/exports`). Each export covers one festival
(event) and a date range. Dates are calendar days in Norway time, and both days are included.

The underlying URL is `/api/admin/exports?kind=<kind>&event=<event id>&from=YYYY-MM-DD&to=YYYY-MM-DD&locale=nb|en`.
Only Organization Admins and Event Admins of the event's organization can use it. Rows are read with
the user's own access rights, so a person only exports what they are allowed to see.

## File format

The files are made to open correctly when you double-click them in Excel with Norwegian regional
settings:

| What      | How                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Encoding  | UTF-8 with a byte-order mark (BOM), so æ, ø and å display correctly                                                                                                |
| Separator | Semicolon `;`                                                                                                                                                      |
| Line ends | CRLF                                                                                                                                                               |
| Amounts   | Kroner with a decimal comma and no thousands separator: `1234,50`, `-45,00`. Money is stored as whole øre, so amounts are exact                                    |
| Times     | Norway time (Europe/Oslo, summer time included) as `2027-06-12 10:30:00`. Excel reads this as a date and time                                                      |
| Text      | Quoted with `"` when it contains `;`, `"` or a line break. Text starting with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet never runs it as a formula |
| Headers   | In the chosen language (`locale=nb`, the default, or `en`)                                                                                                         |
| File name | `affn-<kind>-<event slug>-<from>-<to>.csv`                                                                                                                         |

Signs: in the transactions export, money coming in (payments) is positive. Money going out
(refunds and payouts) is negative.

To open the file in Excel with other regional settings (for example English), use
**Data → From Text/CSV**, then choose _65001: Unicode (UTF-8)_, delimiter _Semicolon_, and locale
_Norwegian (Bokmål)_.

## `transactions`: payments, refunds and payouts

There is one row per transaction, filtered on the time it happened (payment or refund succeeded, payout paid; otherwise
when it was created). Sorted by time.

| Column (nb / en)                                               | Content                                                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Tidspunkt / Time                                               | When it happened                                                                                                                                |
| Type                                                           | Betaling / Refusjon / Utbetaling (Payment / Refund / Payout)                                                                                    |
| Status                                                         | Provider status code: `pending`, `succeeded`, `failed`, `cancelled` (payments and refunds); `pending`, `in_transit`, `paid`, `failed` (payouts) |
| Leverandør / Vendor                                            | Vendor name                                                                                                                                     |
| Org.nr. / Org. no.                                             | Vendor's organization number                                                                                                                    |
| Ordre / Order                                                  | Order code, for example `B·A1-007` (empty for payouts)                                                                                          |
| Referanse hos betalingsleverandør / Payment provider reference | The provider's id for the payment, refund or payout. Use this to match the provider's own report                                                |
| Betalingsmåte / Payment method                                 | `vipps`, `card`, `apple_pay`, `google_pay` (empty for payouts)                                                                                  |
| Beløp / Amount                                                 | Amount, kr. Negative for refunds and payouts                                                                                                    |
| Plattformgebyr / Platform fee                                  | AFFN commission incl. mva on the payment. Negative on a refund (the part given back), 0 for payouts                                             |
| Betalingsgebyr / Payment fee                                   | The fee the payment provider charged on the payment (AFFN's cost). Empty for refunds and payouts                                                |
| Id                                                             | Our internal id                                                                                                                                 |

## `ledger`: general ledger lines

There is one row per ledger line (double entry: each voucher's debits equal its credits). Rows are
filtered on posting time and sorted by time, then voucher, with debits first.

| Column (nb / en)    | Content                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tidspunkt / Time    | Posting time                                                                                                                 |
| Bilag / Voucher     | Voucher id. All lines of one posting share it                                                                                |
| Type                | `sale`, `commission`, `commission_mva`, `psp_fee`, `refund`, `refund_commission_reversal`, `dispute`, `adjustment`, `payout` |
| Konto / Account     | `psp_clearing`, `vendor_payable`, `vendor_receivable`, `commission_revenue`, `mva_payable`, `psp_fee_expense`, `adjustments` |
| Debet / Debit       | Amount if the line is a debit, otherwise empty                                                                               |
| Kredit / Credit     | Amount if the line is a credit, otherwise empty                                                                              |
| Leverandør / Vendor | Vendor name, if the line belongs to a vendor                                                                                 |
| Org.nr. / Org. no.  | Vendor's organization number                                                                                                 |
| Tekst / Text        | Description                                                                                                                  |
| Id                  | Ledger line id                                                                                                               |

The sum of the Debit column equals the sum of the Credit column for any whole set of vouchers.

## `settlements`: settlement lines per vendor

There is one row per vendor in each settlement batch whose cut-off falls in the range. Cancelled
batches are left out.

| Column (nb / en)                        | Content                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oppgjør / Settlement                    | Settlement batch id                                                                                                                                   |
| Status                                  | Utkast, Klar for godkjenning, Godkjent, Utbetales, Fullført, Delvis feilet (Draft, Ready for approval, Approved, Paying, Completed, Partially failed) |
| Til og med / Up to                      | Batch cut-off: ledger lines up to this time are included                                                                                              |
| Godkjent / Approved                     | When the second admin approved it                                                                                                                     |
| Leverandør / Vendor                     | Vendor name                                                                                                                                           |
| Org.nr. / Org. no.                      | Vendor's organization number                                                                                                                          |
| Brutto salg / Gross sales               | Sales in the period                                                                                                                                   |
| Refusjoner / Refunds                    | The vendor's share of refunds and lost disputes                                                                                                       |
| Provisjon / Commission                  | Commission excluding mva                                                                                                                              |
| Mva på provisjon / Mva on commission    | 25 % mva on the commission                                                                                                                            |
| Justeringer / Adjustments               | Approved manual adjustments (+ credit, − debit)                                                                                                       |
| Til utbetaling / Net payout             | Gross − refunds − commission − mva + adjustments                                                                                                      |
| Utbetalt / Paid out                     | Amount actually paid out so far                                                                                                                       |
| Utbetalingsreferanse / Payout reference | The provider's payout id(s), space-separated                                                                                                          |

## `invoices`: invoices issued

There is one row per AFFN invoice issued in the range, sorted by invoice number: commission and
stall fee invoices to vendors, and sponsorship invoices to sponsors. They share one gapless number
series per organization.

| Column (nb / en)                           | Content                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Fakturanr. / Invoice no.                   | Invoice number                                                           |
| Type                                       | Provisjon / Standleie / Sponsorat (Commission / Stall fee / Sponsorship) |
| Utstedt / Issued                           | Issue time                                                               |
| Forfall / Due                              | Due time                                                                 |
| Kunde / Customer                           | Vendor or sponsor name                                                   |
| Org.nr. / Org. no.                         | Customer's organization number                                           |
| Netto / Net                                | Amount excluding mva                                                     |
| Mva                                        | Mva                                                                      |
| Totalt / Total                             | Amount including mva                                                     |
| Status                                     | Utstedt / Betalt / Kreditert (Issued / Paid / Credited)                  |
| Trukket i oppgjør / Deducted in settlement | Ja / Nei (Yes / No): paid by deduction from the vendor's settlement      |
