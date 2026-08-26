export type TransactionSource = 'manual' | 'bank' | 'gmail';
export type TransactionType = 'income' | 'expense';
export interface Transaction {
  id: string;
  date: string;
  time?: string;       // "HH:MM" 24-hour
  type: TransactionType;
  category: string;
  item: string;
  amount: number;
  note: string;
  source: TransactionSource;
}
