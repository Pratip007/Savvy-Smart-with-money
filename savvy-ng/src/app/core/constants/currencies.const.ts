export interface Currency { code: string; label: string; }
export const CURRENCIES: Currency[] = [
  { code: 'USD', label: '$ USD — US Dollar' },
  { code: 'EUR', label: '€ EUR — Euro' },
  { code: 'GBP', label: '£ GBP — British Pound' },
  { code: 'INR', label: '₹ INR — Indian Rupee' },
  { code: 'JPY', label: '¥ JPY — Japanese Yen' },
  { code: 'CAD', label: '$ CAD — Canadian Dollar' },
  { code: 'AUD', label: '$ AUD — Australian Dollar' },
  { code: 'CHF', label: '₣ CHF — Swiss Franc' },
  { code: 'BRL', label: 'R$ BRL — Brazilian Real' },
  { code: 'MXN', label: '$ MXN — Mexican Peso' },
  { code: 'AED', label: 'د.إ AED — UAE Dirham' },
  { code: 'SGD', label: '$ SGD — Singapore Dollar' },
];
