/* HR Analytics Dashboard by Deepa M.
   Data comes from window.HR_DATA (embedded at build time) or any .xlsx loaded from the top bar. */
const $ = id => document.getElementById(id);
const C = {teal:'#0E7C7B', orange:'#E8743B', red:'#D64550', blue:'#3E5C89', amber:'#D9A32B', dim:'#C9D1DC'};
Chart.defaults.font.family = "'Inter',system-ui,sans-serif";
Chart.defaults.font.size = 11.3;
Chart.defaults.color = '#4C5B75';
Chart.defaults.animation = {duration: 200};

// ---------- small helpers ----------
const fmt = n => Math.round(n).toLocaleString('en-IN');
const inr = n => '\u20B9' + fmt(n);
const kTick = v => '\u20B9' + v / 1000 + 'K';
const avg = (a, f) => a.length ? a.reduce((s, r) => s + f(r), 0) / a.length : 0;
const pct = (n, d) => d ? n / d * 100 : 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const numSort = (x, y) => ('' + x).localeCompare('' + y, undefined, {numeric: true});
const group = (a, k) => { const m = {}; a.forEach(r => (m[typeof k === 'function' ? k(r) : r[k]] ??= []).push(r)); return m; };
const iso = v => !v ? null : (v instanceof Date ? new Date(v.getTime() - v.getTimezoneOffset() * 6e4) : new Date(v)).toISOString().slice(0, 10);

// ---------- bands and attrition drivers ----------
const AGE = ['Under 30','30-39','40-49','50+'], EXP = ['0-2 yrs','3-7 yrs','8-14 yrs','15+ yrs'], SAL = ['Under 50K','50-70K','70-90K','90K+'];
const ageB = a => a < 30 ? AGE[0] : a < 40 ? AGE[1] : a < 50 ? AGE[2] : AGE[3];
const expB = e => e < 3 ? EXP[0] : e < 8 ? EXP[1] : e < 15 ? EXP[2] : EXP[3];
const salB = s => s < 50000 ? SAL[0] : s < 70000 ? SAL[1] : s < 90000 ? SAL[2] : SAL[3];
const DRIVERS = {
  'Overtime': [r => r.OverTime === 'Yes' ? 'Works overtime' : 'No overtime'],
  'Job satisfaction': [r => r.Job_Satisfaction],
  'Work-life balance': [r => r.Work_Life_Balance],
  'Performance rating': [r => r.Performance_Rating],
  'Promotions': [r => r.Num_Promotions],
  'Age band': [r => ageB(r.Age), AGE],
  'Salary band': [r => salB(r.Monthly_Salary), SAL],
  'Commute': [r => r.Distance_From_Home_KM <= 10 ? '0-10 km' : r.Distance_From_Home_KM <= 25 ? '11-25 km' : '26+ km'],
  'Education': [r => r.Education], 'Marital status': [r => r.Marital_Status], 'City': [r => r.City]
};
const REQUIRED = ['Employee_ID','Employee_Name','Gender','Department','Job_Title','Age','Experience_Years','Education','Marital_Status','Monthly_Salary','Hire_Date','Job_Satisfaction','Work_Life_Balance','Performance_Rating','OverTime','Distance_From_Home_KM','Training_Hours_Last_Year','Num_Promotions','Attrition','Exit_Date','City'];

// ---------- state ----------
let ALL = [], FIELDS = [], DEPTS = [], asOf, charts = {}, sortK = 'risk', sortD = -1, page = 0;
const F = {dept:'', gender:'', city:'', status:'', ot:''};
const FLABEL = {dept:'Department', gender:'Gender', city:'City', status:'Status', ot:'Overtime'};

// Add derived fields: tenure, rule-based attrition risk score and its reasons
function prep(rows) {
  FIELDS = Object.keys(rows[0]);
  ALL = rows.map(r => ({...r, Hire_Date: iso(r.Hire_Date), Exit_Date: iso(r.Exit_Date)}));
  asOf = new Date(Math.max(...ALL.flatMap(r => [r.Hire_Date, r.Exit_Date]).filter(Boolean).map(d => +new Date(d))));
  const med = {}, g = group(ALL, 'Department');
  for (const d in g) { const s = g[d].map(r => r.Monthly_Salary).sort((a, b) => a - b); med[d] = s[s.length >> 1]; }
  DEPTS = Object.keys(g).sort();
  ALL.forEach(r => {
    r.left = r.Attrition === 'Yes';
    r.tenure = ((r.left ? new Date(r.Exit_Date) : asOf) - new Date(r.Hire_Date)) / (365.25 * 864e5);
    const w = [];
    if (r.OverTime === 'Yes') w.push(['Works overtime', 2]);
    if (r.Job_Satisfaction <= 2) w.push(['Low job satisfaction', 2]);
    if (r.Work_Life_Balance <= 2) w.push(['Poor work-life balance', 2]);
    if (r.Distance_From_Home_KM > 30) w.push(['Long commute', 1]);
    if (r.Num_Promotions === 0 && r.tenure >= 3) w.push(['No promotion in 3+ years', 1]);
    if (r.Monthly_Salary < med[r.Department] * 0.9) w.push(['Paid below department median', 1]);
    if (r.Training_Hours_Last_Year < 15) w.push(['Low training hours', 1]);
    r.risk = w.reduce((s, x) => s + x[1], 0);
    r.why = w.map(x => x[0]).join(', ');
    r.level = r.risk >= 5 ? 'High' : r.risk >= 3 ? 'Medium' : 'Low';
  });
}

// Rows matching the filters; `skip` leaves one filter out so its own chart still shows every category
const view = skip => ALL.filter(r =>
  (skip === 'dept' || !F.dept || r.Department === F.dept) && (skip === 'gender' || !F.gender || r.Gender === F.gender) &&
  (skip === 'city' || !F.city || r.City === F.city) && (!F.status || (F.status === 'left') === r.left) && (!F.ot || r.OverTime === F.ot));

function setF(k, v) { F[k] = v; $('f-' + k).value = v; page = 0; render(); }
const toggle = (k, v) => setF(k, F[k] === v ? '' : v);

// ---------- chart helpers ----------
function draw(id, type, data, o = {}) {
  charts[id]?.destroy();
  charts[id] = new Chart($(id), {type, data, options: {responsive: true, maintainAspectRatio: false, ...o.o,
    plugins: {legend: {display: !!o.legend, position: 'bottom'}, ...o.o?.plugins}}});
}
const agg = (a, f, fn, order) => { const g = group(a, f), ks = order || Object.keys(g).sort(numSort); return [ks, ks.map(k => g[k] ? fn(g[k]) : 0)]; };
// Bar chart; `key` makes bars clickable cross-filters, `h` is horizontal
function bars(id, [labels, vals], o = {}) {
  const sel = o.key && F[o.key];
  const colors = labels.map(l => sel && sel !== l ? C.dim : (o.color || C.teal));
  const val = {beginAtZero: true, grid: {color: '#E3E8EF'}, ticks: {callback: o.tick}}, cat = {grid: {display: false}};
  draw(id, 'bar', {labels, datasets: [{data: vals, backgroundColor: colors, borderRadius: 5}]}, {o: {
    indexAxis: o.h ? 'y' : 'x', scales: o.h ? {x: val, y: cat} : {x: cat, y: val},
    plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => (o.fmt || (v => v))(c.parsed[o.h ? 'x' : 'y'])}}},
    onClick: (e, els) => { if (o.key && els.length) toggle(o.key, labels[els[0].index]); },
    onHover: (e, els) => { e.native.target.style.cursor = o.key && els.length ? 'pointer' : 'default'; }}});
}
function multi(id, labels, series, o = {}) {
  draw(id, 'bar', {labels, datasets: series.map(s => ({label: s[0], data: s[1], backgroundColor: s[2], borderRadius: 4}))},
    {legend: 1, o: {scales: {x: {grid: {display: false}}, y: {beginAtZero: true, ticks: {callback: o.tick}}}}});
}

// ---------- KPI cards and insights ----------
const M = a => {
  const n = a.length, l = a.filter(r => r.left).length, v = (f, d = 1) => avg(a, f).toFixed(d);
  return [
    ['Employees', fmt(n)], ['Active employees', fmt(n - l)], ['Attrition rate', pct(l, n).toFixed(1) + '%'],
    ['Avg monthly salary', inr(avg(a, r => r.Monthly_Salary))], ['Avg age', v(r => r.Age) + ' yrs'], ['Avg experience', v(r => r.Experience_Years) + ' yrs'],
    ['Job satisfaction', v(r => r.Job_Satisfaction, 2) + ' / 5'], ['Work-life balance', v(r => r.Work_Life_Balance, 2) + ' / 5'],
    ['Performance rating', v(r => r.Performance_Rating, 2) + ' / 5'], ['Works overtime', pct(a.filter(r => r.OverTime === 'Yes').length, n).toFixed(0) + '%'],
    ['Training hours / year', v(r => r.Training_Hours_Last_Year)], ['Promotions per employee', v(r => r.Num_Promotions, 2)]];
};
function kpis(d) {
  const now = M(d), base = M(ALL), on = Object.values(F).some(Boolean);
  $('kpis').innerHTML = now.map((k, i) => `<div class="kpi-card"><div class="k-label">${k[0]}</div><div class="k-value">${k[1]}</div><div class="k-delta">${on ? 'All employees: ' + base[i][1] : '&nbsp;'}</div></div>`).join('');
}
function insights(d) {
  const out = [], rate = a => pct(a.filter(r => r.left).length, a.length), all = rate(d);
  const dr = Object.entries(group(d, 'Department')).filter(([, v]) => v.length >= 5).map(([k, v]) => [k, rate(v)]).sort((a, b) => b[1] - a[1]);
  if (dr.length) out.push(['alert', 'Highest attrition', `<strong>${esc(dr[0][0])}</strong> has lost ${dr[0][1].toFixed(0)}% of its people, against ${all.toFixed(0)}% overall.`]);
  const ot = d.filter(r => r.OverTime === 'Yes'), no = d.filter(r => r.OverTime !== 'Yes');
  if (ot.length && no.length) out.push(['warn', 'Overtime', `Employees working overtime leave at <strong>${rate(ot).toFixed(0)}%</strong>, compared with ${rate(no).toFixed(0)}% for the rest.`]);
  const lo = d.filter(r => r.Job_Satisfaction <= 2), hi = d.filter(r => r.Job_Satisfaction > 2);
  if (lo.length && hi.length) out.push(['warn', 'Job satisfaction', `Low satisfaction (1 or 2) goes with <strong>${rate(lo).toFixed(0)}%</strong> attrition, versus ${rate(hi).toFixed(0)}% at 3 or above.`]);
  const f = d.filter(r => !r.left && r.Gender === 'Female'), m = d.filter(r => !r.left && r.Gender === 'Male');
  if (f.length && m.length) { const gap = (avg(m, r => r.Monthly_Salary) - avg(f, r => r.Monthly_Salary)) / avg(m, r => r.Monthly_Salary) * 100;
    out.push([Math.abs(gap) > 5 ? 'alert' : 'good', 'Pay gap', `Active women earn <strong>${Math.abs(gap).toFixed(1)}%</strong> ${gap >= 0 ? 'less' : 'more'} than active men on average.`]); }
  $('insights').innerHTML = out.map(i => `<div class="insight-card ${i[0]}"><div class="i-tag">${i[1]}</div><p>${i[2]}</p></div>`).join('') || '<p class="hint">No data for this selection.</p>';
}

// ---------- employee table ----------
const COLS = [['Employee_ID','ID'],['Employee_Name','Name'],['Department','Department'],['Job_Title','Job title'],['City','City'],['Monthly_Salary','Salary'],['Job_Satisfaction','Satisf.'],['Work_Life_Balance','WLB'],['OverTime','OT'],['risk','Status / risk'],['why','Risk drivers']];
function table(d) {
  const q = $('q').value.toLowerCase();
  const rows = d.filter(r => !q || (r.Employee_Name + r.Employee_ID + r.Job_Title).toLowerCase().includes(q));
  const val = r => sortK === 'risk' ? (r.left ? -1 : r.risk) : r[sortK];
  rows.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sortD);
  const pages = Math.max(1, Math.ceil(rows.length / 10)); page = Math.min(page, pages - 1);
  $('thead').innerHTML = '<tr>' + COLS.map(c => `<th class="${c[0] === 'why' ? '' : 's'}" data-k="${c[0]}">${c[1]}${sortK === c[0] ? (sortD > 0 ? ' \u25B2' : ' \u25BC') : ''}</th>`).join('') + '</tr>';
  $('tbody').innerHTML = rows.slice(page * 10, page * 10 + 10).map(r => `<tr><td>${esc(r.Employee_ID)}</td><td>${esc(r.Employee_Name)}</td><td>${esc(r.Department)}</td><td>${esc(r.Job_Title)}</td><td>${esc(r.City)}</td><td>${inr(r.Monthly_Salary)}</td><td>${r.Job_Satisfaction}</td><td>${r.Work_Life_Balance}</td><td>${esc(r.OverTime)}</td><td>${r.left ? '<span class="badge Left">Left</span>' : `<span class="badge ${r.level}">${r.level} (${r.risk})</span>`}</td><td class="why">${r.left ? '' : esc(r.why)}</td></tr>`).join('') || '<tr><td colspan="11">No employees match.</td></tr>';
  $('count').textContent = `${rows.length} employees, page ${page + 1} of ${pages}`;
  $('prev').disabled = page === 0; $('next').disabled = page >= pages - 1;
}

// ---------- main render ----------
function render() {
  const d = view(), act = d.filter(r => !r.left), left = d.filter(r => r.left);
  const dAct = view('dept').filter(r => !r.left), len = g => g.length, salAvg = g => avg(g, r => r.Monthly_Salary);
  $('hero-n').textContent = fmt(act.length);
  $('hero-asof').textContent = 'Data as of ' + asOf.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
  $('chips').innerHTML = Object.keys(F).filter(k => F[k]).map(k => `<button class="chip" data-k="${k}">${FLABEL[k]}: ${esc(F[k])} \u2715</button>`).join('');
  kpis(d); insights(d); table(d);

  // workforce
  bars('c-dept', agg(dAct, 'Department', len, DEPTS), {key: 'dept'});
  const gd = view('gender').filter(r => !r.left), gl = ['Female', 'Male'], gc = [C.orange, C.teal];
  draw('c-gender', 'doughnut', {labels: gl, datasets: [{data: gl.map(g => gd.filter(r => r.Gender === g).length), backgroundColor: gl.map((g, i) => F.gender && F.gender !== g ? C.dim : gc[i])}]},
    {legend: 1, o: {onClick: (e, els) => { if (els.length) toggle('gender', gl[els[0].index]); }}});
  bars('c-age', agg(act, r => ageB(r.Age), len, AGE));
  bars('c-edu', agg(act, 'Education', len, ['High School', "Bachelor's", "Master's", 'PhD']), {color: C.blue});
  const cc = agg(view('city').filter(r => !r.left), 'City', len), ci = cc[0].map((l, i) => [l, cc[1][i]]).sort((a, b) => b[1] - a[1]);
  bars('c-city', [ci.map(x => x[0]), ci.map(x => x[1])], {key: 'city', h: true, color: C.amber});
  bars('c-exp', agg(act, r => expB(r.Experience_Years), len, EXP), {color: C.blue});
  bars('c-hires', agg(d, r => r.Hire_Date.slice(0, 4), len));
  const qtr = r => { const x = new Date(r.Exit_Date); return x.getUTCFullYear() + ' Q' + (Math.floor(x.getUTCMonth() / 3) + 1); };
  bars('c-exits', agg(left, qtr, len), {color: C.orange});

  // pay
  bars('c-sal', agg(dAct, 'Department', salAvg, DEPTS), {key: 'dept', tick: kTick, fmt: inr});
  multi('c-salg', DEPTS, gl.map((g, i) => [g, DEPTS.map(x => avg(dAct.filter(r => r.Department === x && r.Gender === g), r => r.Monthly_Salary)), gc[i]]), {tick: kTick});
  bars('c-salband', agg(act, r => salB(r.Monthly_Salary), len, SAL), {color: C.blue});
  const pts = l => d.filter(r => r.left === l).map(r => ({x: r.Experience_Years, y: r.Monthly_Salary, r}));
  draw('c-scatter', 'scatter', {datasets: [{label: 'Active', data: pts(false), backgroundColor: C.teal + 'AA'}, {label: 'Left', data: pts(true), backgroundColor: C.orange + 'CC'}]},
    {legend: 1, o: {scales: {x: {title: {display: true, text: 'Experience (years)'}}, y: {ticks: {callback: kTick}}},
      plugins: {tooltip: {callbacks: {label: c => `${c.raw.r.Employee_Name}: ${inr(c.raw.y)}, ${c.raw.x} yrs`}}}}});

  // attrition
  bars('c-attr', agg(view('dept'), 'Department', g => pct(g.filter(r => r.left).length, g.length), DEPTS), {key: 'dept', color: C.orange, tick: v => v + '%', fmt: v => v.toFixed(1) + '%'});
  const dv = DRIVERS[$('driver').value];
  bars('c-driver', agg(d, dv[0], g => pct(g.filter(r => r.left).length, g.length), dv[1]), {color: C.red, tick: v => v + '%', fmt: v => v.toFixed(1) + '%'});

  // performance
  const R = [1, 2, 3, 4, 5];
  multi('c-eng', DEPTS, [['Satisfaction', 'Job_Satisfaction', C.teal], ['Work-life balance', 'Work_Life_Balance', C.orange], ['Rating', 'Performance_Rating', C.blue]]
    .map(s => [s[0], DEPTS.map(x => avg(dAct.filter(r => r.Department === x), r => r[s[1]])), s[2]]));
  bars('c-perf', agg(act, 'Performance_Rating', len, R));
  bars('c-train', agg(act, 'Performance_Rating', g => avg(g, r => r.Training_Hours_Last_Year), R), {color: C.blue, fmt: v => v.toFixed(1) + ' hrs'});
}

// ---------- loading data ----------
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3500); }
function load(rows, name) {
  prep(rows);
  const fill = (k, vals) => { $('f-' + k).innerHTML = $('f-' + k).options[0].outerHTML + vals.map(v => `<option>${esc(v)}</option>`).join(''); };
  fill('dept', DEPTS); fill('gender', [...new Set(ALL.map(r => r.Gender))].sort()); fill('city', [...new Set(ALL.map(r => r.City))].sort());
  Object.keys(F).forEach(k => { F[k] = ''; $('f-' + k).value = ''; });
  $('status-text').textContent = `${ALL.length} employees from ${name}`;
  page = 0; render();
}

// ---------- events ----------
Object.keys(F).forEach(k => $('f-' + k).onchange = e => setF(k, e.target.value));
$('reset').onclick = () => { Object.keys(F).forEach(k => { F[k] = ''; $('f-' + k).value = ''; }); $('q').value = ''; page = 0; render(); };
$('chips').onclick = e => { const k = e.target.dataset.k; if (k) setF(k, ''); };
$('driver').innerHTML = Object.keys(DRIVERS).map(k => `<option>${k}</option>`).join('');
$('driver').onchange = render;
$('q').oninput = () => { page = 0; render(); };
$('prev').onclick = () => { page--; render(); };
$('next').onclick = () => { page++; render(); };
$('thead').onclick = e => { const k = e.target.dataset.k; if (!k || k === 'why') return; sortD = sortK === k ? -sortD : -1; sortK = k; render(); };
$('csv').onclick = () => {
  const q = v => /[",\n]/.test(v ?? '') ? '"' + String(v).replace(/"/g, '""') + '"' : (v ?? '');
  const csv = [FIELDS.join(','), ...view().map(r => FIELDS.map(f => q(r[f])).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = 'hr_filtered.csv'; a.click();
};
$('load').onclick = () => $('file').click();
$('file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const wb = XLSX.read(rd.result, {type: 'array', cellDates: true});
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval: null});
      const miss = REQUIRED.filter(c => !(c in (rows[0] || {})));
      if (miss.length) throw new Error('Missing columns: ' + miss.join(', '));
      load(rows, f.name); toast('Dashboard updated from ' + f.name);
    } catch (err) { toast(err.message); }
  };
  rd.readAsArrayBuffer(f); e.target.value = '';
};

if (window.HR_DATA && HR_DATA.length) load(HR_DATA, 'hr_analytics_dataset_cleaned.xlsx');
else toast('No embedded data found. Run scripts/build_dashboard.py or load an Excel file.');
