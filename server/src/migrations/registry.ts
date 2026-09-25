// Every schema change from 1.7.2 on goes here, appended at the end, never
// inserted, edited or removed once shipped. See runner.ts for the rules.
//
//   {
//       id: 'core/0001-short-description',
//       statements: [
//           'ALTER TABLE ... ',
//       ],
//   },
//
// Each migration runs once, inside a transaction, so it does not need to be
// idempotent (no IF NOT EXISTS required), and a failure leaves nothing behind.
// Ids are namespaced: 'core/' for this repository. A downstream build that
// carries its own migrations uses its own namespace and its own list.

import type { Migration } from './runner';

export const coreMigrations: readonly Migration[] = [
    {
        // Recurring budget items move from "every month on debit_day" to a real
        // schedule: a start date, a frequency (daily to yearly), an interval and
        // an optional end. Items can also be income. Existing items become
        // monthly schedules that behave exactly as before, and every month
        // already marked as paid keeps its mark.
        id: 'core/0001-budget-recurrence',
        statements: [
            'ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS is_expense BOOLEAN NOT NULL DEFAULT true',
            'ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS start_date DATE',
            "ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS recurrence_frequency VARCHAR(16) NOT NULL DEFAULT 'monthly'",
            'ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER NOT NULL DEFAULT 1',
            'ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS recurrence_until DATE',
            // Start in the earlier of the month the item was created and the
            // first month anyone marked it paid, on its debit day, clamped to
            // the month's last day (the 31st in April is the 30th).
            `UPDATE recurring_expenses re
             SET start_date = (
                 SELECT (b.m + (LEAST(re.debit_day,
                                      EXTRACT(DAY FROM (b.m + interval '1 month' - interval '1 day'))::int) - 1))::date
                 FROM (
                     SELECT date_trunc('month', LEAST(
                         COALESCE(re.created_at, now()),
                         COALESCE(
                             (SELECT min(make_date(l.year, l.month, 1))::timestamp
                              FROM recurring_expense_logs l
                              WHERE l.recurring_expense_id = re.id),
                             COALESCE(re.created_at, now())
                         )
                     ))::date AS m
                 ) b
             )
             WHERE start_date IS NULL`,
            'ALTER TABLE recurring_expenses ALTER COLUMN start_date SET NOT NULL',
            'CREATE INDEX IF NOT EXISTS idx_recurring_expenses_start_date ON recurring_expenses(start_date)',
            // Paid marks were one per month; a weekly item needs one per
            // occurrence. Existing marks land on the month's debit day, clamped
            // the same way, which is exactly where the new schedule puts them.
            'ALTER TABLE recurring_expense_logs ADD COLUMN IF NOT EXISTS occurrence_date DATE',
            `UPDATE recurring_expense_logs rel
             SET occurrence_date = make_date(rel.year, rel.month, 1) + (
                 LEAST(re.debit_day,
                       EXTRACT(DAY FROM (make_date(rel.year, rel.month, 1) + interval '1 month' - interval '1 day'))::int) - 1
             )
             FROM recurring_expenses re
             WHERE re.id = rel.recurring_expense_id
               AND rel.occurrence_date IS NULL`,
            'ALTER TABLE recurring_expense_logs ALTER COLUMN occurrence_date SET NOT NULL',
            'ALTER TABLE recurring_expense_logs DROP CONSTRAINT IF EXISTS recurring_expense_logs_recurring_expense_id_month_year_key',
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_expense_logs_occurrence ON recurring_expense_logs(recurring_expense_id, occurrence_date)',
        ],
    },
    {
        // A calendar event can carry a budget item (one-off or recurring), kept
        // in step with the event's date and recurrence. Deleting the budget item
        // removes its event; deleting the event only unlinks, so money records
        // are only ever deleted from the Budget page.
        id: 'core/0002-calendar-budget-link',
        statements: [
            'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS linked_budget_entry_id UUID REFERENCES budget_entries(id) ON DELETE SET NULL',
            'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS linked_recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL',
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_linked_budget_entry ON appointments(linked_budget_entry_id) WHERE linked_budget_entry_id IS NOT NULL',
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_linked_recurring_expense ON appointments(linked_recurring_expense_id) WHERE linked_recurring_expense_id IS NOT NULL',
        ],
    },
];
