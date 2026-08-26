export const GAS_CODE = `var DATA_SHEET = '_Data';
var TXN_SHEET  = '_Transactions';
var MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ── READ: return budget rows + all transactions ── */
function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var ds = ss.getSheetByName(DATA_SHEET);
    var rows = ds && ds.getLastRow() > 0 ? ds.getDataRange().getValues() : [];
    var ts = ss.getSheetByName(TXN_SHEET);
    var txnRows = [];
    if (ts && ts.getLastRow() > 1) {
      txnRows = ts.getRange(2, 1, ts.getLastRow() - 1, 9).getValues();
    }
    return respond(JSON.stringify({ ok: true, rows: rows, txnRows: txnRows }));
  } catch(err) {
    return respond(JSON.stringify({ ok: false, error: err.message }));
  }
}

/* ── WRITE: save budget + transactions, rebuild month sheets ── */
function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var ss = getSpreadsheet();
    if (p.rows && p.rows.length) {
      saveRaw(ss, p.rows);
      buildSheets(ss, p.rows);
      var ds = ss.getSheetByName(DATA_SHEET);
      if (ds) try { ds.hideSheet(); } catch(x) {}
    }
    if (p.transactions && p.transactions.length) {
      saveTxnSheet(ss, p.transactions);
    }
    return respond(JSON.stringify({ ok: true }));
  } catch(err) {
    return respond(JSON.stringify({ ok: false, error: err.message }));
  }
}

/* Save flat rows to _Data sheet (not hidden yet — caller hides after month sheets are built) */
function saveRaw(ss, rows) {
  var s = ss.getSheetByName(DATA_SHEET) || ss.insertSheet(DATA_SHEET);
  try { s.showSheet(); } catch(x) {}  // ensure visible so deleting other sheets won't leave zero visible sheets
  s.clearContents(); s.clearFormats();
  s.getRange(1, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows);
  s.setTabColor('#999999');
}

/* Create / update one formatted sheet per month */
function buildSheets(ss, rows) {
  var months = {};
  rows.slice(1).forEach(function(r) {
    var k = String(r[0]); if (!k) return;
    if (!months[k]) months[k] = [];
    months[k].push(r);
  });
  var keys = Object.keys(months).sort();
  var names = keys.map(keyName);

  // Remove sheets for months no longer in the data (keep _Data and _Transactions)
  ss.getSheets().forEach(function(s) {
    var n = s.getName();
    if (n !== DATA_SHEET && n !== TXN_SHEET && names.indexOf(n) < 0) ss.deleteSheet(s);
  });

  // Build each month sheet and place in chronological order
  keys.forEach(function(k, i) {
    var s = ss.getSheetByName(keyName(k)) || ss.insertSheet(keyName(k));
    paintSheet(s, k, months[k]);
    ss.setActiveSheet(s);
    ss.moveActiveSheet(i + 1);
  });
}

function keyName(k) {
  var p = k.split('-');
  return MN[parseInt(p[1]) - 1] + ' ' + p[0];  // e.g. "Jul 2026"
}

/* Build the layout for a single month sheet */
function paintSheet(sheet, key, rows) {
  sheet.clearContents(); sheet.clearFormats(); sheet.setConditionalFormatRules([]);

  // Parse flat rows into income / expense maps
  var inc = {}, exp = {};
  rows.forEach(function(r) {
    var mode = String(r[1]).toLowerCase();   // 'estimate' | 'actual'
    var type = String(r[2]).toLowerCase();   // 'income'   | 'expense'
    var cat  = String(r[3]), item = String(r[4]), amt = parseFloat(r[5]) || 0;
    var sec  = (type === 'income') ? inc : exp;
    if (!sec[cat]) sec[cat] = {};
    if (!sec[cat][item]) sec[cat][item] = { e: 0, a: 0 };
    if (mode === 'estimate') sec[cat][item].e = amt; else sec[cat][item].a = amt;
  });

  // Build output rows (R) and their display types (T)
  var R = [], T = [];
  function add(v, t) { R.push(v); T.push(t); }

  add([keyName(key) + '   —   Monthly Budget', '', '', '', ''], 'title');
  add(['', '', '', '', ''], 'gap');
  add(['Category', 'Item', 'Estimate', 'Actual', 'Difference'], 'head');

  // Income section
  add(['INCOME', '', '', '', ''], 'sec-inc');
  var eI = 0, aI = 0;
  Object.keys(inc).sort().forEach(function(cat) {
    Object.keys(inc[cat]).sort().forEach(function(item) {
      var d = inc[cat][item];
      add([cat, item, d.e, d.a, d.a - d.e], 'data-inc');
      eI += d.e; aI += d.a;
    });
  });
  add(['Total Income', '', eI, aI, aI - eI], 'tot-inc');
  add(['', '', '', '', ''], 'gap');

  // Expense section
  add(['EXPENSES', '', '', '', ''], 'sec-exp');
  var eE = 0, aE = 0;
  Object.keys(exp).sort().forEach(function(cat) {
    Object.keys(exp[cat]).sort().forEach(function(item) {
      var d = exp[cat][item];
      add([cat, item, d.e, d.a, d.a - d.e], 'data-exp');
      eE += d.e; aE += d.a;
    });
  });
  add(['Total Expenses', '', eE, aE, aE - eE], 'tot-exp');
  add(['', '', '', '', ''], 'gap');

  // Net balance
  add(['Net Balance', '', eI - eE, aI - aE, (aI - aE) - (eI - eE)], 'net');

  sheet.getRange(1, 1, R.length, 5).setValues(R);
  applyStyles(sheet, T, R);
}

/* Apply all formatting in bulk for performance */
function applyStyles(sheet, T, R) {
  var n = T.length;
  var BG = [], FC = [], FW = [], FS = [], HA = [];

  T.forEach(function(t, i) {
    var diff = R[i][4];
    var bg = '#ffffff', fc = '#1f2937', fw = 'normal', fs = 10;
    var ha = ['left', 'left', 'right', 'right', 'right'];

    if      (t === 'title')   { bg='#1e3a8a'; fc='#ffffff'; fw='bold'; fs=14; ha=['center','center','center','center','center']; }
    else if (t === 'head')    { bg='#1d4ed8'; fc='#ffffff'; fw='bold'; }
    else if (t === 'sec-inc') { bg='#dcfce7'; fc='#14532d'; fw='bold'; }
    else if (t === 'sec-exp') { bg='#fee2e2'; fc='#7f1d1d'; fw='bold'; }
    else if (t === 'data-inc' || t === 'data-exp') { bg = (i % 2 === 0) ? '#f8fafc' : '#ffffff'; }
    else if (t === 'tot-inc') { bg='#bbf7d0'; fw='bold'; }
    else if (t === 'tot-exp') { bg='#fecaca'; fw='bold'; }
    else if (t === 'net')     { bg='#1e3a8a'; fc='#ffffff'; fw='bold'; fs=11; }

    // Color-code the Difference cell: green = good, red = bad
    var fc5 = [fc, fc, fc, fc, fc];
    if (t === 'data-inc' || t === 'tot-inc')
      fc5[4] = diff >= 0 ? '#15803d' : '#b91c1c';
    else if (t === 'data-exp' || t === 'tot-exp')
      fc5[4] = diff <= 0 ? '#15803d' : '#b91c1c';
    else if (t === 'net')
      fc5[4] = diff >= 0 ? '#86efac' : '#fca5a5';

    BG.push([bg,bg,bg,bg,bg]); FC.push(fc5);
    FW.push([fw,fw,fw,fw,fw]); FS.push([fs,fs,fs,fs,fs]); HA.push(ha);
  });

  // Bulk-apply styles (minimises API calls)
  var rng = sheet.getRange(1, 1, n, 5);
  rng.setBackgrounds(BG).setFontColors(FC).setFontWeights(FW)
     .setFontSizes(FS).setHorizontalAlignments(HA).setVerticalAlignment('middle');

  // Number format for numeric columns (rows 4 onward = after title+gap+head)
  sheet.getRange(4, 3, n - 3, 3).setNumberFormat('#,##0.00');

  // Row heights: set default first, then override non-default rows
  var H = { title:48, gap:8, head:32, 'sec-inc':30, 'sec-exp':30,
            'tot-inc':30, 'tot-exp':30, net:36, 'data-inc':26, 'data-exp':26 };
  sheet.setRowHeights(1, n, 26);
  T.forEach(function(t, i) { var h = H[t]; if (h && h !== 26) sheet.setRowHeight(i+1, h); });

  // Column widths
  sheet.setColumnWidth(1, 145);
  sheet.setColumnWidth(2, 175);
  sheet.setColumnWidths(3, 3, 120);

  // Merge title row and section header rows across all 5 columns
  sheet.getRange(1, 1, 1, 5).mergeAcross();
  T.forEach(function(t, i) {
    if (t === 'sec-inc' || t === 'sec-exp') sheet.getRange(i+1, 1, 1, 5).mergeAcross();
  });

  sheet.setFrozenRows(3);    // title + gap + column header always visible
  sheet.setTabColor('#1e3a8a');
}

function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var props = PropertiesService.getScriptProperties();
    var ssId = props.getProperty('SPREADSHEET_ID');
    if (ssId) { try { ss = SpreadsheetApp.openById(ssId); } catch(e) { ss = null; } }
    if (!ss) { ss = SpreadsheetApp.create('Savvy Budget'); props.setProperty('SPREADSHEET_ID', ss.getId()); }
  }
  return ss;
}

function respond(txt) {
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

/* ── Save all transactions to _Transactions sheet ── */
function saveTxnSheet(ss, txns) {
  var s = ss.getSheetByName(TXN_SHEET) || ss.insertSheet(TXN_SHEET);
  try { s.showSheet(); } catch(x) {}
  s.clearContents();
  var hdr = [['MonthKey','ID','Date','Type','Category','Item','Amount','Note','Source']];
  var data = txns.map(function(t) {
    return [t.monthKey||'',t.id||'',t.date||'',t.type||'',t.category||'',t.item||'',parseFloat(t.amount)||0,t.note||'',t.source||'manual'];
  });
  s.getRange(1,1,hdr.length + data.length, 9).setValues(hdr.concat(data));
  s.setTabColor('#6366f1');
  try { s.hideSheet(); } catch(x) {}
}

/* ── GMAIL BANK EMAIL SYNC ───────────────────────────────── */
/* SETUP: In Apps Script editor → Extensions → Apps Script → Triggers
   Click "+ Add Trigger" → Function: syncBankEmails
   Event source: Time-driven → Hour timer → Every 1 hour            */
function syncBankEmails() {
  var ss = getSpreadsheet();
  var ts = ss.getSheetByName(TXN_SHEET) || ss.insertSheet(TXN_SHEET);
  if (ts.getLastRow() === 0) {
    ts.appendRow(['MonthKey','ID','Date','Type','Category','Item','Amount','Note','Source']);
  }

  var props = PropertiesService.getScriptProperties();
  var procList;
  try { procList = JSON.parse(props.getProperty('PROC_EMAILS') || '[]'); } catch(e2) { procList = []; }
  var seen = {};
  procList.forEach(function(id) { seen[id] = true; });

  var queries = [
    'from:(alerts@hdfcbank.net OR hdfcbank@hdfcbank.net) subject:(debit OR credit OR transaction)',
    'from:(donotreply@sbi.co.in OR alerts@sbi.co.in) subject:(debit OR credit)',
    'from:(icicibank@icicibank.com OR alerts@icicibank.com) subject:(transaction OR alert)',
    'from:(noreply@kotak.com OR alerts@kotak.com) subject:(debit OR credit)',
    'from:(axisbank@axisbank.com OR alerts@axisbank.com) subject:(transaction OR debit)',
    'from:(noreply@indusind.com OR alerts@indusind.com) subject:(debit OR credit)'
  ];

  var newRows = [];
  var newIds  = [];

  queries.forEach(function(q) {
    try {
      var threads = GmailApp.search(q + ' newer_than:7d', 0, 30);
      threads.forEach(function(thread) {
        thread.getMessages().forEach(function(msg) {
          var mid = msg.getId();
          if (seen[mid]) return;
          seen[mid] = true;
          newIds.push(mid);
          var t = parseBankEmail(msg);
          if (t) newRows.push([t.monthKey,t.id,t.date,t.type,t.category,t.item,t.amount,t.note,t.source]);
        });
      });
    } catch(qErr) {}
  });

  if (newRows.length) {
    ts.getRange(ts.getLastRow() + 1, 1, newRows.length, 9).setValues(newRows);
  }

  var allIds = procList.concat(newIds);
  if (allIds.length > 1000) allIds = allIds.slice(-800);
  props.setProperty('PROC_EMAILS', JSON.stringify(allIds));
}

function parseBankEmail(msg) {
  try {
    var body  = msg.getPlainBody();
    var bodyL = body.toLowerCase();
    var tz    = 'Asia/Kolkata';
    var date  = msg.getDate();
    var dateStr  = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    var monthKey = Utilities.formatDate(date, tz, 'yyyy-MM');

    var isDebit  = /\b(debit|debited|withdrawn|paid|spent)\b/.test(bodyL);
    var isCredit = /\b(credit|credited|received|deposited)\b/.test(bodyL);
    if (!isDebit && !isCredit) return null;

    /* extract amount — try several common bank SMS / email patterns */
    var amtPatterns = [
      /(?:Rs\.?|INR|₹)\s*([0-9,]+\.?[0-9]*)/i,
      /([0-9,]+\.?[0-9]*)\s*(?:Rs\.?|INR|₹)/i,
      /amount[:\s]+(?:Rs\.?|INR|₹)?\s*([0-9,]+\.?[0-9]*)/i
    ];
    var amount = 0;
    for (var pi = 0; pi < amtPatterns.length; pi++) {
      var am = body.match(amtPatterns[pi]);
      if (am) { amount = parseFloat(am[1].replace(/,/g,'')); break; }
    }
    if (!amount || amount <= 0) return null;

    /* extract merchant name (best-effort) */
    var merchant = '';
    var mPatterns = [
      /(?:at|merchant[:\s]+|paid to[:\s]+)([A-Za-z0-9 .&\-\/]+?)(?:\s+on\b|\s+via\b|\s+ref\b|\s+txn\b|\.|$)/i,
      /(?:UPI to|transfer to)[:\s]+([A-Za-z0-9 .@\-]+?)(?:\s+on\b|\s+via\b|\s+ref\b|\.|$)/i
    ];
    for (var mi = 0; mi < mPatterns.length; mi++) {
      var mm = body.match(mPatterns[mi]);
      if (mm) { merchant = mm[1].trim(); break; }
    }

    var cat = autoCategorize(merchant.toLowerCase(), msg.getSubject().toLowerCase());
    return {
      id: 'bank_' + msg.getId(),
      date: dateStr,
      monthKey: monthKey,
      type: isDebit ? 'expense' : 'income',
      category: cat.c,
      item: cat.i,
      amount: amount,
      note: merchant || 'Bank transaction',
      source: 'bank'
    };
  } catch(e3) { return null; }
}

function autoCategorize(merchant, subj) {
  var m = merchant + ' ' + subj;
  var rules = [
    { k:['zomato','swiggy','dunzo','box8','rebel foods'],          c:'Food',              i:'Food Delivery'             },
    { k:['bigbasket','grofers','zepto','dmart','jiomart','blinkit'],c:'Food',              i:'Groceries'                 },
    { k:['uber','ola ','rapido','meru '],                           c:'Transport',         i:'Taxi / Cab / Auto'         },
    { k:['petrol','fuel','bpcl','iocl','hp pump','nayara','hpcl'], c:'Transport',         i:'Fuel / Gas'                },
    { k:['fastag','toll ','nhai'],                                  c:'Transport',         i:'Toll & Fastag'             },
    { k:['irctc','railway ticket','train ticket'],                  c:'Travel',            i:'Train / Bus Tickets'       },
    { k:['makemytrip','goibibo','indigo','air india','vistara','spicejet','cleartrip'],
                                                                    c:'Travel',            i:'Flight Tickets'            },
    { k:['oyo ','treebo','hotel '],                                 c:'Travel',            i:'Hotel / Stay'              },
    { k:['netflix','hotstar','disney','prime video'],               c:'Entertainment',     i:'Streaming (Netflix/Prime)' },
    { k:['spotify','gaana','jiosaavn','wynk','apple music'],        c:'Entertainment',     i:'OTT / Music Apps'          },
    { k:['medplus','apollo pharm','netmeds','1mg','pharmeasy'],     c:'Health',            i:'Pharmacy'                  },
    { k:['doctor','hospital','clinic','fortis','max health'],       c:'Health',            i:'Doctor / Hospital'         },
    { k:['gym','cult.fit','crossfit','fitness'],                    c:'Health',            i:'Gym'                       },
    { k:['bescom','msedcl','tata power','adani elec','torrent pow'],c:'Housing',           i:'Electricity'               },
    { k:['water bill','bwssb'],                                     c:'Housing',           i:'Water'                     },
    { k:['airtel','jio ','vi recharge','bsnl'],                      c:'Technology',        i:'Mobile Recharge'           },
    { k:['amazon','flipkart','myntra','ajio','meesho','snapdeal'],  c:'Misc',              i:'Gifts & Presents'          },
    { k:['salary credit','payroll credit','ctc credit'],            c:'Employment',        i:'Salary'                    },
    { k:['interest credit','fd interest','savings int'],            c:'Investments',       i:'Interest'                  },
  ];
  for (var ri = 0; ri < rules.length; ri++) {
    for (var ki = 0; ki < rules[ri].k.length; ki++) {
      if (m.indexOf(rules[ri].k[ki]) >= 0) return { c: rules[ri].c, i: rules[ri].i };
    }
  }
  return { c: 'Misc', i: 'Unexpected / Emergency' };
}`;
