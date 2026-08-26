import { Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', redirectTo: 'transactions', pathMatch: 'full' },
  { path: 'estimates', loadComponent: () => import('./pages/budget/budget-page').then(m => m.BudgetPage), data: { mode: 'estimates' } },
  { path: 'final', loadComponent: () => import('./pages/budget/budget-page').then(m => m.BudgetPage), data: { mode: 'final' } },
  { path: 'statistics', loadComponent: () => import('./pages/statistics/statistics-page').then(m => m.StatisticsPage) },
  { path: 'transactions', loadComponent: () => import('./pages/transactions/transactions-page').then(m => m.TransactionsPage) },
  { path: 'settings', loadComponent: () => import('./pages/settings/settings-page').then(m => m.SettingsPage) },
];
