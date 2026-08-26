import { Injectable } from '@angular/core';
import { BudgetStateService } from './budget-state.service';
import { SheetsService } from './sheets.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class ImportExportService {
  constructor(
    private state: BudgetStateService,
    private sheets: SheetsService,
    private toast: ToastService
  ) {}

  processFile(file: File): void {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = e => this.doImport(e.target?.result as string);
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      import('xlsx').then(XLSX => {
        const reader = new FileReader();
        reader.onload = e => {
          const wb = XLSX.read(e.target?.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(ws);
          this.doImport(csv);
        };
        reader.readAsArrayBuffer(file);
      });
    } else {
      this.toast.show('Unsupported file type. Use CSV or XLSX.');
    }
  }

  doImport(csv: string): void {
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { this.toast.show('Empty file'); return; }
    const rows = lines.map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()));
    let imported = 0;
    rows.slice(1).forEach(r => {
      const [rawMonth, modeRaw, typeRaw, cat, itemName, amtStr] = r;
      if (!rawMonth || !modeRaw || !typeRaw || !cat) return;
      const month = rawMonth.length === 7 ? rawMonth : null;
      if (!month) return;
      const modeMap: any = { estimate: 'estimates', estimates: 'estimates', final: 'final' };
      const typeMap: any = { income: 'income', expense: 'expenses', expenses: 'expenses' };
      const mode = modeMap[modeRaw.toLowerCase()];
      const type = typeMap[typeRaw.toLowerCase()];
      if (!mode || !type) return;
      const d = this.state.getM(month);
      if (!(d as any)[mode][type][cat])
        (d as any)[mode][type][cat] = { collapsed: false, items: [] };
      const items = (d as any)[mode][type][cat].items;
      const amt = parseFloat(amtStr) || 0;
      const ex = items.find((i: any) => i.name === itemName);
      if (ex) ex.amount = amt;
      else items.push({ id: Math.random().toString(36).slice(2,9), name: itemName, amount: amt });
      imported++;
    });
    this.state.data.update(d => ({ ...d }));
    this.toast.show(`Imported ${imported} rows`);
    this.sheets.schedulePush();
  }

  exportCSV(mode: 'estimates' | 'final'): void {
    const d = this.state.currentMonthData();
    const key = this.state.currentKey();
    const rows = [['MonthKey','Mode','Type','Category','Item','Amount']];
    (['income','expenses'] as const).forEach(type => {
      Object.entries(d[mode][type]).forEach(([cat, catData]) => {
        catData.items.forEach(item => {
          rows.push([key, mode, type, cat, item.name, String(item.amount)]);
        });
      });
    });
    this.dl(`savvy_${key}_${mode}.csv`, rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n'), 'text/csv');
  }

  exportAllCSV(): void {
    const allData = this.state.data();
    const rows = [['MonthKey','Mode','Type','Category','Item','Amount']];
    Object.entries(allData).forEach(([k, md]) => {
      (['estimates','final'] as const).forEach(mode => {
        (['income','expenses'] as const).forEach(type => {
          Object.entries(md[mode][type]).forEach(([cat, catData]) => {
            catData.items.forEach(item => rows.push([k, mode, type, cat, item.name, String(item.amount)]));
          });
        });
      });
    });
    this.dl('savvy_all.csv', rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n'), 'text/csv');
  }

  dlTemplate(): void {
    const header = '"MonthKey","Mode","Type","Category","Item","Amount"';
    const eg = '"2026-07","estimates","expenses","Food","Groceries","5000"';
    this.dl('savvy_template.csv', header + '\n' + eg, 'text/csv');
  }

  dl(name: string, content: string, mime: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
