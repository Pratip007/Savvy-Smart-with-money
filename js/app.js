/* ═══════════════════════════════════════════════════════════
   MONTHLY BUDGET — app.js
   ═══════════════════════════════════════════════════════════ */

/* ─── 1. CONSTANTS ──────────────────────────────────────── */
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const CCOLORS = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];

const DEF_INCOME = [
  { name:'Employment',  items:['Salary','Bonus','Overtime'] },
  { name:'Business',    items:['Freelance','Consulting'] },
  { name:'Investments', items:['Dividends','Interest','Rental Income'] },
  { name:'Other Income',items:['Gifts','Tax Refund','Other'] }
];

const DEF_EXPENSES = [
  { name:'Housing',      items:['Rent / Mortgage','Electricity','Water','Internet','Phone','Maintenance'] },
  { name:'Food',         items:['Groceries','Dining Out','Coffee & Snacks','Food Delivery'] },
  { name:'Transport',    items:['Car Payment','Fuel / Gas','Car Insurance','Public Transit'] },
  { name:'Health',       items:['Health Insurance','Doctor / Hospital','Pharmacy','Gym'] },
  { name:'Entertainment',items:['Streaming','Movies & Events','Hobbies','Gaming'] },
  { name:'Personal Care',items:['Haircut','Beauty','Clothing','Accessories'] },
  { name:'Education',    items:['Books','Online Courses','Subscriptions','Tuition'] },
  { name:'Savings',      items:['Emergency Fund','Retirement','Investments','Goals'] },
  { name:'Debt',         items:['Credit Card','Student Loan','Personal Loan'] },
  { name:'Misc',         items:['Charity','Gifts & Presents','Pet Care','Unexpected'] }
];

const GS_KEY = 'gs_url_v1';

const GAS_CODE = `var SHEET = 'Budget';

function doGet(e) {
  var s = getOrCreate();
  var rows = s.getLastRow() > 0
    ? s.getDataRange().getValues() : [];
  return out(JSON.stringify({ ok: true, rows: rows }));
}

function doPost(e) {
  var p = JSON.parse(e.postData.contents);
  var s = getOrCreate();
  s.clearContents();
  if (p.rows && p.rows.length)
    s.getRange(1,1,p.rows.length,p.rows[0].length)
     .setValues(p.rows);
  return out(JSON.stringify({ ok: true }));
}

function getOrCreate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET)
    || ss.insertSheet(SHEET);
}

function out(txt) {
  return ContentService
    .createTextOutput(txt)
    .setMimeType(ContentService.MimeType.JSON);
}`;

const CURRENCIES = [
  { code:'USD', label:'$ USD — US Dollar' },
  { code:'EUR', label:'€ EUR — Euro' },
  { code:'GBP', label:'£ GBP — British Pound' },
  { code:'INR', label:'₹ INR — Indian Rupee' },
  { code:'JPY', label:'¥ JPY — Japanese Yen' },
  { code:'CAD', label:'$ CAD — Canadian Dollar' },
  { code:'AUD', label:'$ AUD — Australian Dollar' },
  { code:'CHF', label:'₣ CHF — Swiss Franc' },
  { code:'BRL', label:'R$ BRL — Brazilian Real' },
  { code:'MXN', label:'$ MXN — Mexican Peso' },
  { code:'AED', label:'د.إ AED — UAE Dirham' },
  { code:'SGD', label:'$ SGD — Singapore Dollar' },
];

/* ─── 2. STATE ──────────────────────────────────────────── */
const S = {
  year:  new Date().getFullYear(),
  month: new Date().getMonth(),
  page:  'estimates',
  data:  {}
};

/* ─── 3. PERSISTENCE ────────────────────────────────────── */
function loadAll() {
  try { S.data = JSON.parse(localStorage.getItem('budgetv3') || '{}'); }
  catch(e) { S.data = {}; }
}

function save() {
  localStorage.setItem('budgetv3', JSON.stringify(S.data));
  scheduleSync();
}

let _syncTimer = null;

function scheduleSync() {
  if (!getGSURL()) return;
  clearTimeout(_syncTimer);
  setSyncInd('pending');
  _syncTimer = setTimeout(pushToSheets, 5000);
}

function mkey(y, m) {
  return `${y ?? S.year}-${String((m ?? S.month) + 1).padStart(2, '0')}`;
}

function getM(key) {
  const k = key || mkey();
  if (!S.data[k]) { S.data[k] = makeMonth(); save(); }
  return S.data[k];
}

function makeMonth() {
  return {
    estimates: { income: buildSec(DEF_INCOME),   expenses: buildSec(DEF_EXPENSES) },
    final:     { income: buildSec(DEF_INCOME),   expenses: buildSec(DEF_EXPENSES) }
  };
}

function buildSec(defs) {
  const o = {};
  defs.forEach(d => {
    o[d.name] = { collapsed: false, items: d.items.map(n => ({ id: uid(), name: n, amount: 0 })) };
  });
  return o;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

/* ─── 4. MATH & FORMAT ──────────────────────────────────── */
function secTotal(sec) {
  return Object.values(sec).reduce((s, cat) =>
    s + cat.items.reduce((a, i) => a + (parseFloat(i.amount) || 0), 0), 0);
}

function catSum(cat) {
  return cat.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
}

function getCurrency() { return localStorage.getItem('budget_currency') || 'INR'; }

function fmt(n, sign = false) {
  const abs = Math.abs(parseFloat(n) || 0);
  const str = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: getCurrency(),
    minimumFractionDigits: 0, maximumFractionDigits: 2
  }).format(abs);
  if (sign && n > 0) return '+' + str;
  if (n < 0) return '-' + str;
  return str;
}

/* ─── 5. NAVIGATION ─────────────────────────────────────── */
function updHeader() {
  document.getElementById('month-label').textContent =
    MONTHS[S.month].slice(0, 3) + ' ' + S.year;
}

function setPage(page) {
  S.page = page;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === page + '-page'));
  render();
}

function render() {
  if      (S.page === 'estimates') renderBudget('estimates');
  else if (S.page === 'final')     renderBudget('final');
  else if (S.page === 'settings')  renderSettings();
  else                             renderStats();
}

let AC = {};
function killCharts() { Object.values(AC).forEach(c => c?.destroy()); AC = {}; }

/* ─── 6. RENDER — BUDGET PAGES ──────────────────────────── */
function renderBudget(mode) {
  const d = getM(), sec = d[mode];
  const tI = secTotal(sec.income), tE = secTotal(sec.expenses), net = tI - tE;

  let h = `<div class="summary-banner">
    <div class="summary-item">
      <div class="summary-label">Income</div>
      <div class="summary-value">${fmt(tI)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Expenses</div>
      <div class="summary-value">${fmt(tE)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Balance</div>
      <div class="summary-value ${net >= 0 ? 'positive' : 'negative'}">${fmt(net, true)}</div>
    </div>
  </div>`;

  if (mode === 'estimates') {
    h += `<div class="action-row">
      <button class="btn btn-secondary" data-a="xcsv" data-mode="estimates">
        <i class="fa-solid fa-file-arrow-down"></i> Export CSV
      </button>
      <button class="btn btn-secondary" data-a="print">
        <i class="fa-solid fa-print"></i> Print
      </button>
    </div>`;
  } else {
    h += `<div class="import-card">
      <div class="import-card-title">
        <i class="fa-solid fa-file-arrow-up"></i> Import Actual Data
      </div>
      <div class="import-zone" id="drop-zone" data-a="browse">
        <div class="import-zone-icon"><i class="fa-solid fa-folder-open"></i></div>
        <div class="import-zone-text">Tap to upload or drag &amp; drop</div>
        <div class="import-zone-sub">CSV or Excel (.xlsx / .xls)</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-secondary" style="flex:1;font-size:11px" data-a="tpl">
          <i class="fa-solid fa-table"></i> Template
        </button>
        <button class="btn btn-secondary" style="flex:1;font-size:11px" data-a="xcsv" data-mode="final">
          <i class="fa-solid fa-file-arrow-down"></i> Export
        </button>
        <button class="btn btn-secondary" style="flex:1;font-size:11px" data-a="copy">
          <i class="fa-solid fa-rotate"></i> Copy Est.
        </button>
      </div>
    </div>`;
  }

  h += `<div class="section-header">
    <div class="section-title">
      <i class="fa-solid fa-arrow-trend-up" style="color:var(--color-income)"></i> Income
    </div>
    <span class="section-badge badge-income">${fmt(tI)}</span>
  </div>`;
  h += renderCats(sec.income, 'income', mode);
  h += `<button class="btn-add-category" data-a="addcat" data-type="income" data-mode="${mode}">
    <i class="fa-solid fa-plus"></i> Add Income Category
  </button>`;

  h += `<div class="section-header" style="margin-top:6px">
    <div class="section-title">
      <i class="fa-solid fa-arrow-trend-down" style="color:var(--color-expense)"></i> Expenses
    </div>
    <span class="section-badge badge-expense">${fmt(tE)}</span>
  </div>`;
  h += renderCats(sec.expenses, 'expenses', mode);
  h += `<button class="btn-add-category" data-a="addcat" data-type="expenses" data-mode="${mode}">
    <i class="fa-solid fa-plus"></i> Add Expense Category
  </button>`;

  if (mode === 'final') {
    const eI = secTotal(d.estimates.income), eE = secTotal(d.estimates.expenses);
    if (eI > 0 || eE > 0) {
      const iP = eI > 0 ? Math.min(100, (tI / eI) * 100) : 0;
      const eP = eE > 0 ? Math.min(100, (tE / eE) * 100) : 0;
      const eC = tE > eE ? '#e11d48' : '#059669';
      h += `<div class="comparison-card">
        <div class="comparison-title">
          <i class="fa-solid fa-chart-simple" style="color:var(--brand-600)"></i> Final vs Estimates
        </div>
        <div class="comparison-row">
          <div class="comparison-label"><span>Income</span><span>${fmt(tI)} / ${fmt(eI)}</span></div>
          <div class="comparison-track"><div class="comparison-fill" style="width:${iP}%;background:#059669"></div></div>
        </div>
        <div class="comparison-row">
          <div class="comparison-label"><span>Expenses</span><span>${fmt(tE)} / ${fmt(eE)}</span></div>
          <div class="comparison-track"><div class="comparison-fill" style="width:${eP}%;background:${eC}"></div></div>
        </div>
      </div>`;
    }
  }

  document.getElementById(mode + '-page').innerHTML = h;
  bindDrop();
}

function renderCats(section, type, mode) {
  return Object.entries(section).map(([name, cat], idx) => {
    const total = catSum(cat), enc = encodeURIComponent(name), open = !cat.collapsed;
    const dotColor = CCOLORS[idx % CCOLORS.length];
    const rows = cat.items.map(item => {
      let vc = '';
      if (mode === 'final') {
        const estCat  = getM().estimates[type][name];
        const estItem = estCat ? estCat.items.find(i => i.name === item.name) : null;
        if (estItem != null) {
          const diff = (parseFloat(item.amount) || 0) - (parseFloat(estItem.amount) || 0);
          const cls  = diff > 0 ? 'variance-over' : diff < 0 ? 'variance-under' : 'variance-exact';
          vc = `<span class="variance-chip ${cls}">${diff > 0 ? '+' : ''}${fmt(diff)}</span>`;
        }
      }
      return `<div class="budget-row">
        <input class="item-name-input" type="text" value="${esc(item.name)}" placeholder="Item name"
          data-a="uname" data-type="${type}" data-mode="${mode}" data-cat="${enc}" data-id="${item.id}">
        ${vc}
        <input class="item-amount-input" type="number" value="${parseFloat(item.amount) || ''}" placeholder="0" min="0" step="0.01"
          data-a="uamt" data-type="${type}" data-mode="${mode}" data-cat="${enc}" data-id="${item.id}">
        <button class="item-delete-btn" data-a="ditem" data-type="${type}" data-mode="${mode}" data-cat="${enc}" data-id="${item.id}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;
    }).join('');
    return `<div class="category-card">
      <div class="category-header" data-a="tcat" data-type="${type}" data-mode="${mode}" data-cat="${enc}">
        <span class="category-color-dot" style="background:${dotColor}"></span>
        <span class="category-name">${esc(name)}</span>
        <span class="category-total">${fmt(total)}</span>
        <button class="category-delete-btn" data-a="dcat" data-type="${type}" data-mode="${mode}" data-cat="${enc}" title="Delete category">
          <i class="fa-solid fa-trash-can"></i>
        </button>
        <i class="fa-solid fa-chevron-down category-chevron${open ? ' open' : ''}"></i>
      </div>
      <div class="category-body${open ? ' open' : ''}">
        ${rows}
        <button class="btn-add-item" data-a="aitem" data-type="${type}" data-mode="${mode}" data-cat="${enc}">
          <i class="fa-solid fa-plus"></i> Add item
        </button>
      </div>
    </div>`;
  }).join('');
}

/* Inline total update — preserves input focus */
function updTotals(mode) {
  const d = getM(), sec = d[mode];
  const tI = secTotal(sec.income), tE = secTotal(sec.expenses), net = tI - tE;
  const pg = document.getElementById(mode + '-page');
  const sv = pg.querySelectorAll('.summary-value');
  if (sv[0]) sv[0].textContent = fmt(tI);
  if (sv[1]) sv[1].textContent = fmt(tE);
  if (sv[2]) { sv[2].textContent = fmt(net, true); sv[2].className = 'summary-value ' + (net >= 0 ? 'positive' : 'negative'); }
  const badges = pg.querySelectorAll('.section-badge');
  if (badges[0]) badges[0].textContent = fmt(tI);
  if (badges[1]) badges[1].textContent = fmt(tE);
  pg.querySelectorAll('.category-card').forEach(card => {
    const hdr = card.querySelector('[data-a="tcat"]'); if (!hdr) return;
    const ct  = decodeURIComponent(hdr.dataset.cat);
    const c   = sec[hdr.dataset.type]?.[ct]; if (!c) return;
    const el  = card.querySelector('.category-total'); if (el) el.textContent = fmt(catSum(c));
  });
}

/* ─── 7. RENDER — STATISTICS PAGE ───────────────────────── */
function renderStats() {
  killCharts();
  const allKeys = Object.keys(S.data).sort();
  if (allKeys.length === 0) {
    document.getElementById('statistics-page').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fa-solid fa-chart-pie"></i></div>
        <div class="empty-state-text">No data yet.<br>Add your budget in the Estimates tab.</div>
      </div>`;
    return;
  }

  const key = mkey(), d = getM(key);
  const fI = secTotal(d.final.income),     fE = secTotal(d.final.expenses),     fN = fI - fE;
  const eI = secTotal(d.estimates.income), eE = secTotal(d.estimates.expenses), eN = eI - eE;
  const hasFinal = fI > 0 || fE > 0, hasEst = eI > 0 || eE > 0;
  const expSrc    = hasFinal ? d.final.expenses : d.estimates.expenses;
  const incSrc    = hasFinal ? d.final.income   : d.estimates.income;
  const hasExpData = secTotal(expSrc) > 0, hasIncData = secTotal(incSrc) > 0;
  const effI = fI || eI, effE = fE || eE, effN = effI - effE;
  const sr = fI > 0 ? Math.round((fN / fI) * 100) : (eI > 0 ? Math.round(((eI - eE) / eI) * 100) : 0);
  const effSr = effI > 0 ? Math.round((effN / effI) * 100) : 0;
  const lbl = MONTHS[S.month].slice(0, 3) + ' ' + S.year;

  function deltaHtml(final, est, isExpense) {
    if (!est || !final) return '';
    const pct = Math.round(Math.abs((final / est - 1) * 100));
    if (pct === 0) return '';
    const up = final > est, good = isExpense ? !up : up;
    return `<div class="stat-delta ${good ? 'delta-pos' : 'delta-neg'}">${up ? '↑' : '↓'} ${pct}% vs est</div>`;
  }

  let h = `<div class="stats-month-label">${lbl}</div>`;

  /* ── Monthly Circle ──────────────────────────────────── */
  if (effI > 0 || effE > 0) {
    h += `<div class="chart-card monthly-circle-card">
      <div class="chart-card-title"><i class="fa-solid fa-circle-dot" style="color:var(--brand-600)"></i> Monthly Summary — ${lbl}</div>
      <div class="monthly-circle-wrap">
        <canvas id="monthly-circle"></canvas>
        <div class="circle-center">
          <div class="circle-net-label">${effN >= 0 ? 'Surplus' : 'Deficit'}</div>
          <div class="circle-net-value ${effN >= 0 ? 'positive' : 'negative'}">${fmt(Math.abs(effN))}</div>
          <div class="circle-sr">${effSr >= 0 ? '+' : ''}${effSr}% saved</div>
        </div>
      </div>
      <div class="circle-legend">
        <div class="cl-item">
          <span class="cl-dot" style="background:#059669"></span>
          <span class="cl-label">Income</span>
          <span class="cl-val" style="color:var(--color-income)">${fmt(effI)}</span>
        </div>
        <div class="cl-item">
          <span class="cl-dot" style="background:#e11d48"></span>
          <span class="cl-label">Expenses</span>
          <span class="cl-val" style="color:var(--color-expense)">${fmt(effE)}</span>
        </div>
        ${effN > 0 ? `<div class="cl-item"><span class="cl-dot" style="background:#93c5fd"></span><span class="cl-label">Saved</span><span class="cl-val" style="color:var(--brand-600)">${fmt(effN)}</span></div>` : ''}
      </div>
    </div>`;
  }

  /* ── 6 KPI Cards ─────────────────────────────────────── */
  h += `<div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Est. Income</div>
      <div class="stat-value income">${fmt(eI)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Final Income</div>
      <div class="stat-value income">${fmt(fI)}</div>
      ${deltaHtml(fI, eI, false)}
    </div>
    <div class="stat-card">
      <div class="stat-label">Est. Expenses</div>
      <div class="stat-value expense">${fmt(eE)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Final Expenses</div>
      <div class="stat-value expense">${fmt(fE)}</div>
      ${deltaHtml(fE, eE, true)}
    </div>
    <div class="stat-card">
      <div class="stat-label">Net Balance</div>
      <div class="stat-value ${fN >= 0 ? 'positive' : 'negative'}">${fmt(fN, true)}</div>
      ${eN !== 0 ? `<div class="stat-sub">Est: ${fmt(eN, true)}</div>` : ''}
    </div>
    <div class="stat-card">
      <div class="stat-label">Savings Rate</div>
      <div class="stat-value ${sr >= 0 ? 'positive' : 'negative'}">${sr}%</div>
      <div class="stat-sub">${hasFinal ? 'Final' : 'Estimated'}</div>
    </div>
  </div>`;

  /* ── Budget Progress ─────────────────────────────────── */
  if (hasEst) {
    const iP = eI > 0 ? Math.min(150, Math.round((fI / eI) * 100)) : 0;
    const eP = eE > 0 ? Math.min(150, Math.round((fE / eE) * 100)) : 0;
    const bU = effI > 0 ? Math.min(150, Math.round((effE / effI) * 100)) : 0;
    h += `<div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-gauge-high" style="color:var(--brand-600)"></i> Budget Progress</div>
      <div class="budget-progress">
        <div class="bp-row">
          <div class="bp-label">
            <span><i class="fa-solid fa-arrow-trend-up" style="color:var(--color-income);font-size:10px;margin-right:4px"></i>Income</span>
            <span class="bp-pct">${iP}%</span>
          </div>
          <div class="bp-track"><div class="bp-fill bp-fill-income" style="width:${Math.min(100,iP)}%"></div></div>
          <div class="bp-amounts">${fmt(fI)} <span class="bp-of">of est.</span> ${fmt(eI)}</div>
        </div>
        <div class="bp-row">
          <div class="bp-label">
            <span><i class="fa-solid fa-arrow-trend-down" style="color:var(--color-expense);font-size:10px;margin-right:4px"></i>Expenses</span>
            <span class="bp-pct ${eP > 100 ? 'pct-over' : ''}">${eP}%</span>
          </div>
          <div class="bp-track"><div class="bp-fill ${eP > 100 ? 'bp-fill-over' : eP > 80 ? 'bp-fill-warn' : 'bp-fill-expense'}" style="width:${Math.min(100,eP)}%"></div></div>
          <div class="bp-amounts">${fmt(fE)} <span class="bp-of">of est.</span> ${fmt(eE)}</div>
        </div>
        <div class="bp-row">
          <div class="bp-label">
            <span><i class="fa-solid fa-piggy-bank" style="color:var(--brand-600);font-size:10px;margin-right:4px"></i>Budget Used</span>
            <span class="bp-pct ${bU > 90 ? 'pct-over' : bU > 75 ? 'pct-warn' : ''}">${bU}%</span>
          </div>
          <div class="bp-track"><div class="bp-fill ${bU > 90 ? 'bp-fill-over' : bU > 75 ? 'bp-fill-warn' : 'bp-fill-neutral'}" style="width:${Math.min(100,bU)}%"></div></div>
          <div class="bp-amounts">${fmt(effE)} <span class="bp-of">of</span> ${fmt(effI)}</div>
        </div>
      </div>
    </div>`;
  }

  /* ── Income vs Expenses Overview bar ─────────────────── */
  if (hasFinal || hasEst) {
    h += `<div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-chart-bar" style="color:var(--brand-600)"></i> Income vs Expenses Overview</div>
      <div class="chart-wrap chart-h220"><canvas id="overview"></canvas></div>
    </div>`;
  }

  /* ── Top 5 Expense Categories ────────────────────────── */
  if (hasExpData) {
    const topExps = Object.entries(expSrc)
      .map(([n, c]) => ({ n, v: catSum(c) }))
      .filter(e => e.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
    const totExp = topExps.reduce((s, e) => s + e.v, 0) || 1;
    const tRows  = topExps.map((e, i) => `
      <div class="texp-row">
        <div class="texp-rank" style="background:${CCOLORS[i]}20;border-color:${CCOLORS[i]}55;color:${CCOLORS[i]}">${i + 1}</div>
        <div class="texp-body">
          <div class="texp-top">
            <span class="texp-name">${esc(e.n)}</span>
            <span class="texp-val">${fmt(e.v)}</span>
          </div>
          <div class="texp-track">
            <div class="texp-fill" style="width:${Math.round(e.v / totExp * 100)}%;background:${CCOLORS[i]}"></div>
          </div>
          <div class="texp-pct">${Math.round(e.v / totExp * 100)}% of total expenses</div>
        </div>
      </div>`).join('');
    h += `<div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-fire-flame-curved" style="color:#f59e0b"></i> Top Expense Categories <span class="chart-src-tag">${hasFinal ? 'Final' : 'Estimate'}</span></div>
      <div class="top-exp-list">${tRows}</div>
    </div>`;
  }

  /* ── Expense Breakdown pie ───────────────────────────── */
  if (hasExpData) {
    h += `<div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-chart-pie" style="color:var(--color-expense)"></i> Expense Breakdown <span class="chart-src-tag">${hasFinal ? 'Final' : 'Estimate'}</span></div>
      <div class="chart-wrap chart-h220"><canvas id="pie"></canvas></div>
    </div>`;
  }

  /* ── Income Breakdown pie ────────────────────────────── */
  if (hasIncData) {
    h += `<div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-chart-pie" style="color:var(--color-income)"></i> Income Breakdown <span class="chart-src-tag">${hasFinal ? 'Final' : 'Estimate'}</span></div>
      <div class="chart-wrap chart-h220"><canvas id="income-pie"></canvas></div>
    </div>`;
  }

  /* ── Estimates vs Final bars ─────────────────────────── */
  if (hasEst && hasFinal) {
    h += `<div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-chart-bar" style="color:var(--color-expense)"></i> Estimates vs Final — Expenses</div>
      <div class="chart-wrap chart-h260" id="barwrap"><canvas id="barcmp"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-chart-bar" style="color:var(--color-income)"></i> Estimates vs Final — Income</div>
      <div class="chart-wrap chart-h260" id="barwrap-inc"><canvas id="barcmp-inc"></canvas></div>
    </div>`;
  }

  /* ── Multi-month charts ──────────────────────────────── */
  if (allKeys.length > 1) {
    h += `<div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-chart-column" style="color:var(--brand-600)"></i> Monthly Overview (last 8 months)</div>
      <div class="chart-wrap chart-h220"><canvas id="trend"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-card-title"><i class="fa-solid fa-chart-line" style="color:var(--brand-600)"></i> Net Balance Trend</div>
      <div class="chart-wrap chart-h180"><canvas id="net-trend"></canvas></div>
    </div>`;
  }

  /* ── Monthly Insights (needs >1 month) ───────────────── */
  if (allKeys.length > 1) {
    let totI = 0, totE = 0, bestNet = null, bestKey = null, worstNet = null, worstKey = null;
    allKeys.forEach(k => {
      const dd = S.data[k];
      const inc = secTotal(dd.final.income)   || secTotal(dd.estimates.income);
      const exp = secTotal(dd.final.expenses) || secTotal(dd.estimates.expenses);
      totI += inc; totE += exp;
      const net = inc - exp;
      if (bestNet  === null || net > bestNet)  { bestNet  = net;  bestKey  = k; }
      if (worstNet === null || net < worstNet) { worstNet = net; worstKey = k; }
    });
    const avgI = totI / allKeys.length, avgE = totE / allKeys.length;
    function moLabel(k) {
      if (!k) return '—';
      const [yr, mo] = k.split('-');
      return MONTHS[parseInt(mo) - 1].slice(0, 3) + ' ' + yr;
    }
    h += `<div class="stats-insights">
      <div class="insight-card">
        <div class="insight-label">Avg Monthly Income</div>
        <div class="insight-value" style="color:var(--color-income)">${fmt(avgI)}</div>
        <div class="insight-sub">over ${allKeys.length} months</div>
      </div>
      <div class="insight-card">
        <div class="insight-label">Avg Monthly Spend</div>
        <div class="insight-value" style="color:var(--color-expense)">${fmt(avgE)}</div>
        <div class="insight-sub">per month avg</div>
      </div>
      <div class="insight-card">
        <div class="insight-label">Best Savings Month</div>
        <div class="insight-value ${bestNet >= 0 ? 'positive' : 'negative'}">${fmt(bestNet, true)}</div>
        <div class="insight-sub">${moLabel(bestKey)}</div>
      </div>
      <div class="insight-card">
        <div class="insight-label">Months Tracked</div>
        <div class="insight-value" style="color:var(--brand-600)">${allKeys.length}</div>
        <div class="insight-sub">${worstNet < 0 ? 'Deficit: ' + moLabel(worstKey) : 'all positive'}</div>
      </div>
    </div>`;
  }

  /* ── All Months Table ────────────────────────────────── */
  const rows = allKeys.slice().reverse().map(k => {
    const dd = S.data[k]; if (!dd) return '';
    const inc = secTotal(dd.final.income)   || secTotal(dd.estimates.income);
    const exp = secTotal(dd.final.expenses) || secTotal(dd.estimates.expenses);
    const net = inc - exp;
    const [yr, mo] = k.split('-');
    return `<tr class="${k === key ? 'current-month' : ''}" data-nk="${k}">
      <td>${MONTHS[parseInt(mo) - 1].slice(0, 3)} ${yr}</td>
      <td class="td-income">${fmt(inc)}</td>
      <td class="td-expense">${fmt(exp)}</td>
      <td class="${net >= 0 ? 'td-positive' : 'td-negative'}">${fmt(net, true)}</td>
    </tr>`;
  }).join('');

  h += `<div class="history-card">
    <div class="history-title"><i class="fa-solid fa-calendar-days" style="color:var(--brand-600)"></i> All Months</div>
    <table class="history-table">
      <thead><tr>
        <th>Month</th><th>Income</th><th>Expenses</th><th>Net</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <button class="btn btn-secondary btn-full" id="tplbtn">
    <i class="fa-solid fa-table"></i> Download Import Template
  </button>`;

  document.getElementById('statistics-page').innerHTML = h;

  document.querySelectorAll('[data-nk]').forEach(tr => {
    tr.addEventListener('click', () => {
      const [yr, mo] = tr.dataset.nk.split('-');
      S.year = parseInt(yr); S.month = parseInt(mo) - 1;
      updHeader(); setPage('estimates');
    });
  });
  document.getElementById('tplbtn')?.addEventListener('click', dlTemplate);

  requestAnimationFrame(() => {
    if (effI > 0 || effE > 0)  drawMonthlyCircle(effI, effE, effN);
    if (hasFinal || hasEst)    drawOverview(d);
    if (hasExpData)            drawPie(expSrc);
    if (hasIncData)            drawIncomePie(incSrc);
    if (hasEst && hasFinal)    { drawBar(d); drawIncomeBar(d); }
    if (allKeys.length > 1)    { drawTrend(allKeys); drawNetTrend(allKeys); }
  });
}

/* ─── 8. RENDER — SETTINGS PAGE ─────────────────────────── */
function renderSettings() {
  const url  = getGSURL();
  const curr = getCurrency();

  document.getElementById('settings-page').innerHTML = `

  <div class="settings-section">
    <div class="settings-section-title">
      <i class="fa-solid fa-cloud"></i> Google Sheets Database
    </div>

    <div class="connection-pill ${url ? 'connected' : 'disconnected'}">
      <i class="fa-solid fa-${url ? 'link' : 'link-slash'}"></i>
      ${url ? 'Connected' : 'Not Connected'}
    </div>

    ${url ? `
    <div class="url-display">${esc(url)}</div>
    <div class="action-row" style="margin-bottom:8px">
      <button class="btn btn-primary" data-a="gs-push">
        <i class="fa-solid fa-cloud-arrow-up"></i> Push to Sheets
      </button>
      <button class="btn btn-secondary" data-a="gs-pull">
        <i class="fa-solid fa-cloud-arrow-down"></i> Pull from Sheets
      </button>
    </div>
    <hr class="settings-divider">
    ` : ''}

    <div class="field-label">${url ? 'Update URL' : 'Apps Script Web App URL'}</div>
    <div class="field-hint">Paste the deployment URL from Google Apps Script</div>
    <input class="form-input" id="gsurl-input"
      placeholder="https://script.google.com/macros/s/…/exec"
      value="${esc(url)}">
    <button class="btn btn-primary btn-full" data-a="gs-connect">
      <i class="fa-solid fa-${url ? 'rotate' : 'link'}"></i>
      ${url ? 'Update Connection' : 'Connect to Google Sheets'}
    </button>
    ${url ? `<button class="btn btn-secondary btn-full" data-a="gs-disc"
      style="color:var(--color-expense);border-color:var(--color-expense-border)">
      <i class="fa-solid fa-link-slash"></i> Disconnect
    </button>` : ''}

    <hr class="settings-divider">

    <button class="guide-toggle-btn" data-a="guide-toggle">
      <span><i class="fa-regular fa-circle-question"></i> How to set up (step-by-step)</span>
      <i class="fa-solid fa-chevron-down"></i>
    </button>
    <div class="guide-content" id="guide-content">
      <div style="margin-top:10px">
        <div class="setup-step">
          <div class="step-number">1</div>
          <div class="step-content">
            Go to <a href="https://sheets.new" target="_blank">sheets.new</a>
            to create a new Google Sheet, then open
            <strong>Extensions → Apps Script</strong>
          </div>
        </div>
        <div class="setup-step">
          <div class="step-number">2</div>
          <div class="step-content">
            <strong>Select all</strong> existing code and replace it with the code below,
            then press <strong>Save</strong>:
            <div class="code-block" id="gas-code-block">${esc(GAS_CODE)}<button class="code-copy-btn" data-a="copy-script"><i class="fa-regular fa-copy"></i> Copy</button></div>
          </div>
        </div>
        <div class="setup-step">
          <div class="step-number">3</div>
          <div class="step-content">
            Click <strong>Deploy → New deployment</strong><br>
            Set type to <strong>Web app</strong><br>
            • Execute as: <strong>Me</strong><br>
            • Who has access: <strong>Anyone</strong><br>
            Click <strong>Deploy</strong>, authorize, then <strong>copy the Web App URL</strong>
          </div>
        </div>
        <div class="setup-step">
          <div class="step-number">4</div>
          <div class="step-content">
            Paste the URL in the field above and tap <strong>Connect</strong>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-title">
      <i class="fa-solid fa-palette"></i> Preferences
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Currency</div>
        <div class="settings-row-sub">Used for all amount displays</div>
      </div>
      <select class="form-select" id="currency-select">
        ${CURRENCIES.map(c => `<option value="${c.code}" ${c.code === curr ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-title">
      <i class="fa-solid fa-hard-drive"></i> Data Management
    </div>
    <button class="btn btn-secondary btn-full" data-a="export-all">
      <i class="fa-solid fa-file-arrow-down"></i> Export All Months as CSV
    </button>
    <button class="btn btn-secondary btn-full" data-a="clear-all"
      style="color:var(--color-expense);border-color:var(--color-expense-border)">
      <i class="fa-solid fa-trash-can"></i> Clear All Data
    </button>
  </div>

  <div class="app-footer-note">
    Savvy &middot; Data stored locally in your browser
  </div>`;
}

/* ─── 9. MUTATIONS ──────────────────────────────────────── */
function mutItem(type, mode, catName, itemId, fn) {
  const cat = getM()[mode][type][catName]; if (!cat) return;
  const item = cat.items.find(i => i.id === itemId); if (item) { fn(item); save(); }
}

function toggleCat(type, mode, catName) {
  const cat = getM()[mode][type][catName];
  if (cat) { cat.collapsed = !cat.collapsed; save(); render(); }
}

function delCat(type, mode, catName) {
  delete getM()[mode][type][catName]; save(); render();
}

function addItem(type, mode, catName) {
  const cat = getM()[mode][type][catName];
  if (cat) { cat.items.push({ id: uid(), name: 'New Item', amount: 0 }); save(); render(); }
}

function delItem(type, mode, catName, itemId) {
  const cat = getM()[mode][type][catName];
  if (cat) { cat.items = cat.items.filter(i => i.id !== itemId); save(); render(); }
}

function copyFromEst() {
  const d = getM();
  const clone = JSON.parse(JSON.stringify(d.estimates));
  ['income','expenses'].forEach(t =>
    Object.values(clone[t]).forEach(cat =>
      cat.items.forEach(i => { i.id = uid(); i.amount = 0; })));
  d.final = clone; save(); render();
  toast('Structure copied — amounts reset to 0');
}

/* ─── 10. CATEGORY MODAL ────────────────────────────────── */
let _mctx = null;

function openModal(type, mode) {
  _mctx = { type, mode };
  document.getElementById('cat-input').value = '';
  document.getElementById('cat-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('cat-input').focus(), 80);
}

function closeModal() {
  document.getElementById('cat-modal').style.display = 'none';
  _mctx = null;
}

function confirmModal() {
  const name = document.getElementById('cat-input').value.trim();
  if (!name || !_mctx) return;
  const { type, mode } = _mctx, d = getM();
  if (d[mode][type][name]) { toast('Category already exists'); return; }
  d[mode][type][name] = { collapsed: false, items: [{ id: uid(), name: 'Item 1', amount: 0 }] };
  save(); closeModal(); render(); toast(`"${name}" added`);
}

/* ─── 11. IMPORT / EXPORT ───────────────────────────────── */
function bindDrop() {
  const z = document.getElementById('drop-zone'); if (!z) return;
  z.addEventListener('dragover',  e => { e.preventDefault(); z.classList.add('drag-over'); });
  z.addEventListener('dragleave', ()  => z.classList.remove('drag-over'));
  z.addEventListener('drop', e => {
    e.preventDefault(); z.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) processFile(f);
  });
}

function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const r = new FileReader();
    r.onload = e => doImport(e.target.result); r.readAsText(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded yet — try again'); return; }
    const r = new FileReader();
    r.onload = e => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      doImport(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
    };
    r.readAsArrayBuffer(file);
  } else {
    toast('Use CSV or Excel (.xlsx) files');
  }
}

function doImport(csv) {
  const lines = csv.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) { toast('File has no data rows'); return; }
  const d = getM(); let ok = 0, skip = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSV(lines[i]);
    if (cols.length < 3) { skip++; continue; }

    let type, cat, sub, amt;
    if (cols.length >= 4) {
      type = /income/i.test(cols[0]) ? 'income' : 'expenses';
      [, cat, sub, amt] = cols;
    } else {
      [cat, sub, amt] = cols; type = 'expenses';
    }
    cat = cat?.trim(); sub = sub?.trim();
    const n = parseFloat(String(amt || '').replace(/[$,]/g, '')) || 0;
    if (!cat || !sub) { skip++; continue; }

    const sec = d.final[type];
    if (!sec[cat]) sec[cat] = { collapsed: false, items: [] };
    const ex = sec[cat].items.find(i => i.name === sub);
    if (ex) ex.amount = n; else sec[cat].items.push({ id: uid(), name: sub, amount: n });
    ok++;
  }
  save(); render();
  toast(`Imported ${ok} items${skip ? ` (${skip} skipped)` : ''}`);
}

function parseCSV(line) {
  const r = []; let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { r.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  r.push(cur.trim()); return r;
}

function exportCSV(mode) {
  const d = getM(), k = mkey();
  const lbl = `${MONTHS[S.month]} ${S.year}`;
  const rows = [
    [`Savvy ${mode === 'estimates' ? 'Estimates' : 'Final'} – ${lbl}`],
    ['Type','Category','Sub-category','Amount']
  ];
  ['income','expenses'].forEach(t => {
    Object.entries(d[mode][t]).forEach(([cname, cat]) => {
      cat.items.forEach(item => {
        rows.push([t === 'income' ? 'Income' : 'Expenses', cname, item.name, item.amount]);
      });
    });
  });
  const tI = secTotal(d[mode].income), tE = secTotal(d[mode].expenses);
  rows.push([], [' Total Income','','',tI], [' Total Expenses','','',tE], [' Net Balance','','',tI-tE]);
  const csv = rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  dl(`budget-${mode}-${k}.csv`, csv, 'text/csv');
  toast('CSV exported');
}

function dlTemplate() {
  const rows = [
    ['Type','Category','Sub-category','Amount'],
    ['Income','Employment','Salary','5000'],
    ['Income','Employment','Bonus','0'],
    ['Expenses','Housing','Rent / Mortgage','1500'],
    ['Expenses','Housing','Electricity','120'],
    ['Expenses','Food','Groceries','400'],
    ['Expenses','Food','Dining Out','150'],
    ['Expenses','Transport','Fuel / Gas','120'],
    ['Expenses','Health','Health Insurance','200'],
  ];
  dl('budget-import-template.csv', rows.map(r => r.join(',')).join('\r\n'), 'text/csv');
  toast('Template downloaded');
}

function dl(name, content, mime) {
  const b = new Blob([content], { type: mime + ';charset=utf-8;' });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
}

function exportAllCSV() {
  if (!Object.keys(S.data).length) { toast('No data to export'); return; }
  const rows = dataToRows(S.data);
  const csv  = rows.map(r => r.join(',')).join('\r\n');
  dl('budget-all-months.csv', csv, 'text/csv');
  toast('All months exported');
}

/* ─── 12. GOOGLE SHEETS SYNC ────────────────────────────── */
function getGSURL()   { return localStorage.getItem(GS_KEY) || ''; }
function saveGSURL(u) { if (u) localStorage.setItem(GS_KEY, u); else localStorage.removeItem(GS_KEY); }

function dataToRows(allData) {
  const rows = [['Month','Mode','Type','Category','Sub-category','Item ID','Amount']];
  Object.entries(allData).forEach(([month, md]) => {
    ['estimates','final'].forEach(mode => {
      ['income','expenses'].forEach(type => {
        const sec = md?.[mode]?.[type]; if (!sec) return;
        Object.entries(sec).forEach(([cat, catData]) => {
          catData.items.forEach(item => {
            rows.push([month, mode, type, cat, item.name, item.id, item.amount]);
          });
        });
      });
    });
  });
  return rows;
}

function rowsToData(rows) {
  const data = {};
  if (!rows || rows.length < 2) return data;
  rows.slice(1).forEach(row => {
    const [month, mode, type, cat, itemName, itemId, amount] = row.map(c => String(c ?? ''));
    if (!month || !mode || !type || !cat) return;
    if (!data[month]) data[month] = {
      estimates: { income: {}, expenses: {} },
      final:     { income: {}, expenses: {} }
    };
    if (!data[month][mode]?.[type]) return;
    if (!data[month][mode][type][cat])
      data[month][mode][type][cat] = { collapsed: false, items: [] };
    if (itemName)
      data[month][mode][type][cat].items.push({
        id: itemId || uid(), name: itemName, amount: parseFloat(amount) || 0
      });
  });
  return data;
}

async function pushToSheets() {
  const url = getGSURL(); if (!url) return;
  setSyncInd('spin');
  try {
    const resp = await fetch(url, {
      method: 'POST', body: JSON.stringify({ rows: dataToRows(S.data) }),
      headers: { 'Content-Type': 'text/plain' }
    });
    const json = await resp.json();
    if (json.ok) { setSyncInd('ok'); toast('Pushed to Google Sheets'); }
    else throw new Error(json.error || 'Server error');
  } catch(e) {
    setSyncInd('err'); toast('Push failed: ' + e.message);
  }
}

async function pullFromSheets() {
  const url = getGSURL(); if (!url) return;
  setSyncInd('spin');
  try {
    const resp = await fetch(url + '?t=' + Date.now());
    const json = await resp.json();
    if (json.ok) {
      S.data = rowsToData(json.rows);
      save(); setSyncInd('ok'); render();
      toast('Loaded from Google Sheets');
    } else throw new Error(json.error || 'No data');
  } catch(e) {
    setSyncInd('err'); toast('Pull failed: ' + e.message);
  }
}

function setSyncInd(state) {
  const el  = document.getElementById('sync-btn');
  const url = getGSURL();
  if (!url) { el.hidden = true; return; }
  el.hidden = false;
  const tips = {
    pending: 'Auto-sync in 5s…',
    ok:      'Synced',
    spin:    'Syncing…',
    err:     'Sync failed — tap to retry',
    idle:    'Tap to sync now',
  };
  el.title     = tips[state] || '';
  el.className = 'sync-dot ' + (state || 'idle');
}

/* ─── 13. SETTINGS ACTIONS ──────────────────────────────── */
function gsConnect() {
  const url = document.getElementById('gsurl-input').value.trim();
  if (!url) { toast('Paste your Apps Script URL first'); return; }
  if (!url.startsWith('https://script.google.com')) {
    toast('URL must start with https://script.google.com'); return;
  }
  saveGSURL(url);
  setSyncInd('idle');
  renderSettings();
  toast('Connected! Use Push / Pull to sync data.');
}

function gsDisconnect() {
  saveGSURL('');
  setSyncInd('off');
  renderSettings();
  toast('Disconnected — local data kept');
}

let _guideOpen = false;
function toggleGuide() {
  _guideOpen = !_guideOpen;
  const body = document.getElementById('guide-content');
  const btn  = document.querySelector('.guide-toggle-btn');
  if (body) body.classList.toggle('open', _guideOpen);
  if (btn)  btn.classList.toggle('open', _guideOpen);
}

function copyScript() {
  navigator.clipboard.writeText(GAS_CODE).then(() => {
    const btn = document.querySelector('[data-a="copy-script"]');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
    }
  }).catch(() => toast('Long-press the code block and copy manually'));
}

function clearAllData() {
  if (!confirm('Delete ALL budget data across all months? This cannot be undone.')) return;
  S.data = {};
  save(); killCharts(); render();
  toast('All data cleared');
}

/* ─── 14. CHARTS ────────────────────────────────────────── */
const CF = { family: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" };
Chart.defaults.font  = CF;
Chart.defaults.color = '#475569';

function drawPie(expenses) {
  const cv = document.getElementById('pie'); if (!cv) return;
  let entries = Object.entries(expenses)
    .map(([n, c]) => ({ n, v: catSum(c) })).filter(e => e.v > 0)
    .sort((a, b) => b.v - a.v);
  let labels, vals, cols;
  if (entries.length <= 8) {
    labels = entries.map(e => e.n); vals = entries.map(e => e.v);
    cols   = CCOLORS.slice(0, entries.length);
  } else {
    const top  = entries.slice(0, 7), rest = entries.slice(7).reduce((s, e) => s + e.v, 0);
    labels = [...top.map(e => e.n), 'Other']; vals = [...top.map(e => e.v), rest];
    cols   = [...CCOLORS.slice(0, 7), '#94a3b8'];
  }
  const total = vals.reduce((a, b) => a + b, 0);
  AC.pie = new Chart(cv, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: cols, borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { font: { ...CF, size: 10 }, color: '#475569',
          padding: 6, boxWidth: 10, boxHeight: 10,
          generateLabels: chart => chart.data.labels.map((lbl, i) => ({
            text: `${lbl.slice(0, 11)} ${Math.round((vals[i] / total) * 100)}%`,
            fillStyle: cols[i], hidden: false, index: i
          }))}},
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} (${Math.round((ctx.raw / total) * 100)}%)` }}
      }
    }
  });
}

function drawBar(d) {
  const cv = document.getElementById('barcmp'); if (!cv) return;
  const cats = new Set([...Object.keys(d.estimates.expenses), ...Object.keys(d.final.expenses)]);
  const rows = [...cats].map(n => ({
    n, est: catSum(d.estimates.expenses[n] || { items: [] }),
    fin: catSum(d.final.expenses[n] || { items: [] })
  })).filter(r => r.est > 0 || r.fin > 0).sort((a, b) => b.est - a.est);
  if (!rows.length) return;
  const labels = rows.map(r => r.n.length > 13 ? r.n.slice(0, 13) + '…' : r.n);
  const wrap   = document.getElementById('barwrap');
  if (wrap) wrap.style.height = `${Math.max(200, rows.length * 36 + 48)}px`;
  AC.bar = new Chart(cv, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Estimated', data: rows.map(r => r.est), backgroundColor: 'rgba(37,99,235,.65)',  borderColor: '#2563eb', borderWidth: 1, borderRadius: 3 },
      { label: 'Final',     data: rows.map(r => r.fin), backgroundColor: 'rgba(235,104,52,.65)', borderColor: '#eb6834', borderWidth: 1, borderRadius: 3 }
    ]},
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { ...CF, size: 11 }, color: '#475569', boxWidth: 12, boxHeight: 12 }},
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` }}
      },
      scales: {
        x: { grid: { color: '#e2e8f0' }, ticks: { font: { ...CF, size: 10 }, color: '#94a3b8', callback: v => fmt(v) }},
        y: { grid: { display: false }, ticks: { font: { ...CF, size: 10 }, color: '#475569' }}
      }
    }
  });
}

function drawTrend(allKeys) {
  const cv   = document.getElementById('trend'); if (!cv) return;
  const last  = allKeys.slice(-8);
  const labels = last.map(k => {
    const [yr, mo] = k.split('-');
    return MONTHS[parseInt(mo) - 1].slice(0, 3) + ' \'' + yr.slice(2);
  });
  const inc = [], exp = [];
  last.forEach(k => {
    const dd = S.data[k] || makeMonth();
    inc.push(secTotal(dd.final.income)   || secTotal(dd.estimates.income));
    exp.push(secTotal(dd.final.expenses) || secTotal(dd.estimates.expenses));
  });
  AC.trend = new Chart(cv, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Income',   data: inc, backgroundColor: 'rgba(5,150,105,.7)',   borderColor: '#059669', borderWidth: 1, borderRadius: 3 },
      { label: 'Expenses', data: exp, backgroundColor: 'rgba(225,29,72,.7)',   borderColor: '#e11d48', borderWidth: 1, borderRadius: 3 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { ...CF, size: 11 }, color: '#475569', boxWidth: 12, boxHeight: 12 }},
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` }}
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { ...CF, size: 10 }, color: '#94a3b8' }},
        y: { grid: { color: '#e2e8f0' }, ticks: { font: { ...CF, size: 10 }, color: '#94a3b8', callback: v => fmt(v) }}
      }
    }
  });
}

function drawMonthlyCircle(income, expense, net) {
  const cv = document.getElementById('monthly-circle'); if (!cv) return;
  const savings    = Math.max(0, net);
  const spent      = Math.min(income, expense);
  const overspend  = Math.max(0, expense - income);

  let data, labels, colors, borders;
  if (income > 0 && expense <= income) {
    data    = [spent, savings];
    labels  = ['Spent', 'Saved'];
    colors  = ['rgba(225,29,72,.85)', 'rgba(37,99,235,.75)'];
    borders = ['#e11d48', '#2563eb'];
  } else if (income > 0 && expense > income) {
    data    = [income, overspend];
    labels  = ['Income', 'Over Budget'];
    colors  = ['rgba(5,150,105,.85)', 'rgba(157,23,77,.9)'];
    borders = ['#059669', '#9d174d'];
  } else {
    data    = [expense];
    labels  = ['Expenses'];
    colors  = ['rgba(225,29,72,.85)'];
    borders = ['#e11d48'];
  }

  AC.monthlyCircle = new Chart(cv, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data, backgroundColor: colors, borderColor: borders,
        borderWidth: 3, hoverOffset: 10, borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '74%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: ctx => {
            const total = data.reduce((a, b) => a + b, 0) || 1;
            return ` ${ctx.label}: ${fmt(ctx.raw)} (${Math.round(ctx.raw / total * 100)}%)`;
          }
        }}
      }
    }
  });
}

function drawOverview(d) {
  const cv = document.getElementById('overview'); if (!cv) return;
  const eI = secTotal(d.estimates.income),   fI = secTotal(d.final.income);
  const eE = secTotal(d.estimates.expenses), fE = secTotal(d.final.expenses);
  AC.overview = new Chart(cv, {
    type: 'bar',
    data: {
      labels: ['Income', 'Expenses'],
      datasets: [
        { label: 'Estimated', data: [eI, eE],
          backgroundColor: ['rgba(5,150,105,.3)', 'rgba(225,29,72,.3)'],
          borderColor: ['#059669', '#e11d48'], borderWidth: 1.5, borderRadius: 6 },
        { label: 'Final', data: [fI, fE],
          backgroundColor: ['rgba(5,150,105,.75)', 'rgba(225,29,72,.75)'],
          borderColor: ['#059669', '#e11d48'], borderWidth: 1.5, borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { ...CF, size: 11 }, color: '#475569', boxWidth: 12, boxHeight: 12 }},
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` }}
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { ...CF, size: 12 }, color: '#475569' }},
        y: { grid: { color: '#e2e8f0' }, ticks: { font: { ...CF, size: 10 }, color: '#94a3b8', callback: v => fmt(v) }}
      }
    }
  });
}

function drawIncomePie(income) {
  const cv = document.getElementById('income-pie'); if (!cv) return;
  const ICOLS = ['#059669','#0891b2','#7c3aed','#db2777','#d97706','#16a34a','#0369a1','#6d28d9'];
  let entries = Object.entries(income)
    .map(([n, c]) => ({ n, v: catSum(c) })).filter(e => e.v > 0)
    .sort((a, b) => b.v - a.v);
  let labels, vals, cols;
  if (entries.length <= 8) {
    labels = entries.map(e => e.n); vals = entries.map(e => e.v); cols = ICOLS.slice(0, entries.length);
  } else {
    const top = entries.slice(0, 7), rest = entries.slice(7).reduce((s, e) => s + e.v, 0);
    labels = [...top.map(e => e.n), 'Other']; vals = [...top.map(e => e.v), rest];
    cols   = [...ICOLS.slice(0, 7), '#94a3b8'];
  }
  const total = vals.reduce((a, b) => a + b, 0);
  AC.incomePie = new Chart(cv, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: cols, borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { font: { ...CF, size: 10 }, color: '#475569',
          padding: 6, boxWidth: 10, boxHeight: 10,
          generateLabels: chart => chart.data.labels.map((lbl, i) => ({
            text: `${lbl.slice(0, 11)} ${Math.round((vals[i] / total) * 100)}%`,
            fillStyle: cols[i], hidden: false, index: i
          }))}},
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} (${Math.round((ctx.raw / total) * 100)}%)` }}
      }
    }
  });
}

function drawIncomeBar(d) {
  const cv = document.getElementById('barcmp-inc'); if (!cv) return;
  const cats = new Set([...Object.keys(d.estimates.income), ...Object.keys(d.final.income)]);
  const rows = [...cats].map(n => ({
    n,
    est: catSum(d.estimates.income[n] || { items: [] }),
    fin: catSum(d.final.income[n]     || { items: [] })
  })).filter(r => r.est > 0 || r.fin > 0).sort((a, b) => b.est - a.est);
  if (!rows.length) return;
  const labels = rows.map(r => r.n.length > 13 ? r.n.slice(0, 13) + '…' : r.n);
  const wrap   = document.getElementById('barwrap-inc');
  if (wrap) wrap.style.height = `${Math.max(200, rows.length * 36 + 48)}px`;
  AC.incomeBar = new Chart(cv, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Estimated', data: rows.map(r => r.est), backgroundColor: 'rgba(5,150,105,.5)',  borderColor: '#059669', borderWidth: 1, borderRadius: 3 },
      { label: 'Final',     data: rows.map(r => r.fin), backgroundColor: 'rgba(8,145,178,.65)', borderColor: '#0891b2', borderWidth: 1, borderRadius: 3 }
    ]},
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { ...CF, size: 11 }, color: '#475569', boxWidth: 12, boxHeight: 12 }},
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` }}
      },
      scales: {
        x: { grid: { color: '#e2e8f0' }, ticks: { font: { ...CF, size: 10 }, color: '#94a3b8', callback: v => fmt(v) }},
        y: { grid: { display: false }, ticks: { font: { ...CF, size: 10 }, color: '#475569' }}
      }
    }
  });
}

function drawNetTrend(allKeys) {
  const cv = document.getElementById('net-trend'); if (!cv) return;
  const last   = allKeys.slice(-8);
  const labels = last.map(k => {
    const [yr, mo] = k.split('-');
    return MONTHS[parseInt(mo) - 1].slice(0, 3) + ' \'' + yr.slice(2);
  });
  const nets = last.map(k => {
    const dd = S.data[k] || makeMonth();
    return (secTotal(dd.final.income)   || secTotal(dd.estimates.income)) -
           (secTotal(dd.final.expenses) || secTotal(dd.estimates.expenses));
  });
  AC.netTrend = new Chart(cv, {
    type: 'line',
    data: { labels, datasets: [{
      label: 'Net Balance', data: nets,
      borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)',
      borderWidth: 2, pointRadius: 4,
      pointBackgroundColor: nets.map(v => v >= 0 ? '#059669' : '#e11d48'),
      fill: true, tension: 0.3
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` Net: ${fmt(ctx.raw, true)}` }}
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { ...CF, size: 10 }, color: '#94a3b8' }},
        y: { grid: { color: '#e2e8f0' }, ticks: { font: { ...CF, size: 10 }, color: '#94a3b8', callback: v => fmt(v, true) }}
      }
    }
  });
}

/* ─── 15. UTILITIES ─────────────────────────────────────── */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _tid;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_tid);
  _tid = setTimeout(() => el.classList.remove('visible'), 2600);
}

/* ─── 16. EVENT LISTENERS ───────────────────────────────── */

/* Main content — click delegation */
document.getElementById('main-content').addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  e.stopPropagation();
  const { a, type, mode, cat, id } = t.dataset;
  const catName = cat ? decodeURIComponent(cat) : null;

  if      (a === 'tcat')    { if (e.target.closest('[data-a="dcat"]')) return; toggleCat(type, mode, catName); }
  else if (a === 'dcat')    { if (confirm(`Delete "${catName}" and all its items?`)) delCat(type, mode, catName); }
  else if (a === 'ditem')   delItem(type, mode, catName, id);
  else if (a === 'aitem')   addItem(type, mode, catName);
  else if (a === 'addcat')  openModal(type, mode);
  else if (a === 'xcsv')    exportCSV(t.dataset.mode);
  else if (a === 'print')   window.print();
  else if (a === 'browse')  document.getElementById('file-input').click();
  else if (a === 'tpl')     dlTemplate();
  else if (a === 'copy')    copyFromEst();
  else if (a === 'gs-connect')  gsConnect();
  else if (a === 'gs-push')     pushToSheets();
  else if (a === 'gs-pull')     { if (confirm('Pull from Sheets? Local data will be overwritten.')) pullFromSheets(); }
  else if (a === 'gs-disc')     { if (confirm('Disconnect? Local data is kept.')) gsDisconnect(); }
  else if (a === 'guide-toggle') toggleGuide();
  else if (a === 'copy-script')  copyScript();
  else if (a === 'export-all')   exportAllCSV();
  else if (a === 'clear-all')    clearAllData();
});

/* Main content — input delegation */
document.getElementById('main-content').addEventListener('input', e => {
  const t = e.target; if (!t.dataset.a) return;
  const { a, type, mode, cat, id } = t.dataset;
  const catName = decodeURIComponent(cat);
  if (a === 'uamt') { mutItem(type, mode, catName, id, item => { item.amount = parseFloat(t.value) || 0; }); updTotals(mode); }
  if (a === 'uname')  mutItem(type, mode, catName, id, item => { item.name = t.value; });
});

/* Main content — change delegation */
document.getElementById('main-content').addEventListener('change', e => {
  if (e.target.dataset.a === 'uname') save();
  if (e.target.id === 'currency-select') {
    localStorage.setItem('budget_currency', e.target.value);
    render(); toast('Currency updated');
  }
});

/* Modal */
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-confirm').addEventListener('click', confirmModal);
document.getElementById('cat-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmModal(); });
document.getElementById('cat-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

/* File input */
document.getElementById('file-input').addEventListener('change', e => {
  const f = e.target.files[0]; if (f) processFile(f); e.target.value = '';
});

/* Month navigation */
document.getElementById('prev-month').addEventListener('click', () => {
  killCharts();
  if (S.month === 0) { S.month = 11; S.year--; } else S.month--;
  updHeader(); render();
});

document.getElementById('next-month').addEventListener('click', () => {
  killCharts();
  if (S.month === 11) { S.month = 0; S.year++; } else S.month++;
  updHeader(); render();
});

/* Tab bar */
document.getElementById('tab-bar').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  killCharts(); setPage(b.dataset.page);
});

/* Sync button */
document.getElementById('sync-btn').addEventListener('click', pushToSheets);

/* ─── 17. BOOT ──────────────────────────────────────────── */
loadAll();
updHeader();
render();
setSyncInd(getGSURL() ? 'idle' : 'off');
