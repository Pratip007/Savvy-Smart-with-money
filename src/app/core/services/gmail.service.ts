import { Injectable, signal } from '@angular/core';
import { Transaction } from '../models/transaction.model';
import { GoogleAuthService } from './google-auth.service';
import { TransactionService } from './transaction.service';
import { CategorizeService } from './categorize.service';
import { ToastService } from './toast.service';
import { BudgetStateService } from './budget-state.service';

@Injectable({ providedIn: 'root' })
export class GmailService {
  readonly isSyncing = signal(false);
  readonly lastSync = signal<Date | null>(null);
  readonly importedCount = signal(0);

  constructor(
    private auth: GoogleAuthService,
    private txnService: TransactionService,
    private categorize: CategorizeService,
    private toast: ToastService,
    private state: BudgetStateService
  ) {}

  async syncInbox(): Promise<void> {
    const token = this.auth.accessToken();
    if (!token) { this.toast.show('Connect Google account first'); return; }
    this.isSyncing.set(true);
    const base = 'https://gmail.googleapis.com/gmail/v1/users/me';
    const queries = [
      'from:(alerts@hdfcbank.net OR hdfcbank@hdfcbank.net) subject:(debit OR credit OR transaction) newer_than:7d',
      'from:(donotreply@sbi.co.in OR alerts@sbi.co.in) subject:(debit OR credit) newer_than:7d',
      'from:(icicibank@icicibank.com OR alerts@icicibank.com) subject:(transaction OR alert) newer_than:7d',
      'from:(noreply@kotak.com OR alerts@kotak.com) subject:(debit OR credit) newer_than:7d',
      'from:(axisbank@axisbank.com OR alerts@axisbank.com) subject:(transaction OR debit) newer_than:7d',
    ];
    let count = 0;
    const seen = new Set<string>();
    for (const q of queries) {
      try {
        const listRes = await this.fetchJson(`${base}/messages?q=${encodeURIComponent(q)}&maxResults=20`, token);
        if (!listRes.messages) continue;
        for (const msg of listRes.messages) {
          if (seen.has(msg.id)) continue;
          seen.add(msg.id);
          const full = await this.fetchJson(`${base}/messages/${msg.id}?format=full`, token);
          const parsed = this.parseBankEmail(full);
          if (parsed) {
            this.txnService.addTransaction({ ...parsed, id: 'gmail_' + msg.id } as any);
            count++;
          }
        }
      } catch {}
    }
    this.importedCount.set(count);
    this.lastSync.set(new Date());
    this.isSyncing.set(false);
    this.toast.show(count > 0 ? `Imported ${count} transactions from Gmail` : 'No new transactions found');
  }

  private parseBankEmail(msgData: any): Partial<Transaction> | null {
    try {
      const headers = msgData.payload?.headers || [];
      const dateHeader = headers.find((h: any) => h.name === 'Date')?.value;
      const date = dateHeader ? new Date(dateHeader) : new Date();
      const dateStr = date.toISOString().slice(0, 10);
      const monthKey = date.toISOString().slice(0, 7);
      const body = this.decodeBody(msgData.payload);
      const bodyL = body.toLowerCase();
      const isDebit = /\b(debit|debited|withdrawn|paid|spent)\b/.test(bodyL);
      const isCredit = /\b(credit|credited|received|deposited)\b/.test(bodyL);
      if (!isDebit && !isCredit) return null;
      const amtPatterns = [
        /(?:Rs\.?|INR|₹)\s*([0-9,]+\.?[0-9]*)/i,
        /([0-9,]+\.?[0-9]*)\s*(?:Rs\.?|INR|₹)/i,
        /amount[:\s]+(?:Rs\.?|INR|₹)?\s*([0-9,]+\.?[0-9]*)/i
      ];
      let amount = 0;
      for (const p of amtPatterns) {
        const m = body.match(p);
        if (m) { amount = parseFloat(m[1].replace(/,/g, '')); break; }
      }
      if (!amount || amount <= 0) return null;
      let merchant = '';
      const mPats = [
        /(?:at|merchant[:\s]+|paid to[:\s]+)([A-Za-z0-9 .&\-\/]+?)(?:\s+on\b|\s+via\b|\s+ref\b|\.| $)/i,
        /(?:UPI to|transfer to)[:\s]+([A-Za-z0-9 .@\-]+?)(?:\s+on\b|\s+via\b|\s+ref\b|\.| $)/i
      ];
      for (const p of mPats) {
        const m = body.match(p);
        if (m) { merchant = m[1].trim(); break; }
      }
      const cat = this.categorize.categorize(merchant);
      return {
        date: dateStr, type: isDebit ? 'expense' : 'income',
        category: cat.cat, item: cat.item,
        amount, note: merchant || 'Bank transaction', source: 'gmail'
      };
    } catch { return null; }
  }

  private decodeBody(payload: any): string {
    if (!payload) return '';
    if (payload.body?.data) return atob(payload.body.data.replace(/-/g,'+').replace(/_/g,'/'));
    if (payload.parts) {
      for (const p of payload.parts) {
        const txt = this.decodeBody(p);
        if (txt) return txt;
      }
    }
    return '';
  }

  private async fetchJson(url: string, token: string): Promise<any> {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    return res.json();
  }
}
