import { format, parse } from 'date-fns';

export function formatDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function parseDateOnly(value: string): Date {
  return parse(value, 'yyyy-MM-dd', new Date());
}

export function formatYearMonth(date: Date): string {
  return format(date, 'yyyy-MM');
}
