import { Injectable } from '@angular/core';
import { MERCHANT_MAP } from '../constants/merchant-map.const';

@Injectable({ providedIn: 'root' })
export class CategorizeService {
  categorize(note: string): { cat: string; item: string } {
    const m = (note || '').toLowerCase();
    for (const rule of MERCHANT_MAP) {
      if (rule.keys.some(k => m.includes(k))) return { cat: rule.cat, item: rule.item };
    }
    return { cat: 'Misc', item: 'Unexpected / Emergency' };
  }
}
