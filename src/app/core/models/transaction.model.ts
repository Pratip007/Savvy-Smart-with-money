export type TransactionSource = 'manual' | 'bank' | 'gmail';
export type TransactionType = 'income' | 'expense';
export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  item: string;
  amount: number;
  note: string;
  source: TransactionSource;
}
