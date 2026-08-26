import { Transaction } from './transaction.model';

export interface BudgetItem { id: string; name: string; amount: number; }
export interface CategoryData { collapsed: boolean; items: BudgetItem[]; }
export interface BudgetSection { [catName: string]: CategoryData; }
export interface BudgetMode { income: BudgetSection; expenses: BudgetSection; }
export interface MonthData { estimates: BudgetMode; final: BudgetMode; transactions: Transaction[]; }
export interface AllData { [monthKey: string]: MonthData; }
