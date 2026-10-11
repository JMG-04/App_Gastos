'use strict';

// ===== Configuración (valores públicos por diseño) =====
const CLIENT_ID = '466968619223-kc7f3jsdmud6t5tq33uaiasdrqsbffgc.apps.googleusercontent.com';
const API_URL = 'https://script.google.com/macros/s/AKfycbwO2TlH5g4ahp1msgcz_-AXfOiKrzk-412FNoc3AeqtsBJzk0cqB9sBEfg-WWwDtQx-_g/exec';

const CATS = {
  Vivienda: ['#7F77DD', '🏠'], Comida: ['#D85A30', '🍽️'], Transporte: ['#1D9E75', '🚗'],
  Gasolina: ['#E0A800', '⛽'],
  Servicios: ['#378ADD', '⚡'], Ocio: ['#D4537E', '🎬'], Salud: ['#BA7517', '❤️'], Otros: ['#888780', '🧾']
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 });
const meta = c => CATS[c] || CATS.Otros;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // siempre textContent: nunca HTML
  return e;
}
function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function monthLabel(k) { const p = k.split('-'); return MESES_L[+p[1] - 1] + ' ' + p[0]; }
function shiftMonth(k, n) { const p = k.split('-').map(Number); const d = new Date(p[0], p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }

// ===== Almacenamiento local (IndexedDB) =====
let dbp;
function db() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('gastos-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('expenses', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function store(mode) { return db().then(d => d.transaction('expenses', mode).objectStore('expenses')); }
function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function allItems() { return req((await store('readonly')).getAll()); }
async function putItem(x) { return req((await store('readwrite')).put(x)); }
async function delItem(id) { return req((await store('readwrite')).delete(id)); }

// ===== Estado =====
let items = [];
let month = todayStr().slice(0, 7);
let st = 'ok', syncing = false, pulled = false, lastErr = '';
const auth = { session: null };
try { auth.session = localStorage.getItem('gastos-session'); } catch (e) { }

// ===== Interfaz =====
function render() {
  $('mlabel').textContent = monthLabel(month);
  $('next').disabled = month >= todayStr().slice(0, 7);
  const list = items.filter(i => !i.deleted && i.fecha.slice(0, 7) === month)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = list.reduce((s, i) => s + i.monto, 0);
  $('total').textContent = fmt.format(total);
  $('count').textContent = list.length + (list.length === 1 ? ' gasto registrado' : ' gastos registrados');

  const cats = {};
  list.forEach(i => { cats[i.categoria] = (cats[i.categoria] || 0) + i.monto; });
  const arr = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  drawDonut(arr, total);

  const lg = $('legend');
  lg.replaceChildren();
  if (!arr.length) lg.appendChild(el('span', 'muted', 'Aún no hay gastos este mes'));
  arr.slice(0, 5).forEach(e => {
    const row = el('div', 'lg');
    const dot = el('i'); dot.style.background = meta(e[0])[0];
    row.append(dot, el('span', '', e[0]), el('b', '', Math.round(e[1] / total * 100) + '%'));
    lg.appendChild(row);
  });

  const box = $('list');
  box.replaceChildren();
  if (!list.length) box.appendChild(el('div', 'empty', 'Toca el botón + para registrar tu primer gasto.'));
  list.forEach(i => {
    const [color, icon] = meta(i.categoria);
    const row = el('div', 'item');
    const ico = el('div', 'ico', icon); ico.style.background = color + '33';
    const info = el('div', 'info');
    const d = i.fecha.split('-');
    info.append(el('b', '', i.descripcion || i.categoria),
      el('small', '', (+d[2]) + ' ' + MESES[+d[1] - 1] + ' · ' + i.categoria + (i.pending ? ' · sin sincronizar' : '')));
    const del = el('button', 'del', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Eliminar gasto');
    del.addEventListener('click', () => { if (confirm('¿Eliminar este gasto?')) removeItem(i.id); });
    row.append(ico, info, el('div', 'amt', fmt.format(i.monto)), del);
    box.appendChild(row);
  });
  updateStatus();
}

function drawDonut(arr, total) {
  const NS = 'http://www.w3.org/2000/svg', svg = $('donut');
  svg.replaceChildren();
  const circ = 2 * Math.PI * 42;
  const mk = (stroke, len, off) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', 60); c.setAttribute('cy', 60); c.setAttribute('r', 42);
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', 16);
    if (len !== undefined) {
      c.setAttribute('stroke-dasharray', len + ' ' + (circ - len));
      c.setAttribute('stroke-dashoffset', -off);
      c.setAttribute('transform', 'rotate(-90 60 60)');
    }
    return c;
  };
  svg.appendChild(mk('rgba(128,128,128,.25)'));
  let off = 0;
  arr.forEach(e => { const len = e[1] / total * circ; svg.appendChild(mk(meta(e[0])[0], len, off)); off += len; });
  const t = document.createElementNS(NS, 'text');
  t.setAttribute('x', 60); t.setAttribute('y', 64); t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font-size', 12); t.setAttribute('fill', 'currentColor');
  t.textContent = arr.length + (arr.length === 1 ? ' categoría' : ' categorías');
  svg.appendChild(t);
}

function updateStatus() {
  const pend = items.filter(i => i.pending || i.deleted).length;
  const extra = pend ? ' · ' + pend + (pend === 1 ? ' pendiente' : ' pendientes') : '';
  let k = st, t;
  if (!navigator.onLine) { k = 'offline'; t = 'Sin conexión' + extra; }
  else if (k === 'syncing') t = 'Sincronizando…';
  else if (k === 'login') t = 'Inicia sesión para sincronizar' + extra;
  else if (k === 'error') t = 'No se pudo sincronizar' + extra;
  else t = pend ? pend + ' por sincronizar' : 'Sincronizado';
  $('stext').textContent = t;
  $('stext').title = k === 'error' ? lastErr : '';
  $('dot').className = 'dot ' + k;
  $('gbtn').hidden = k !== 'login';
}

// ===== Login con Google =====
let gReady = false, gLoading = false;
function parseJwt(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; }
}
function getToken() { return auth.session; }
function setSession(v) {
  auth.session = v;
  try { if (v) localStorage.setItem('gastos-session', v); else localStorage.removeItem('gastos-session'); } catch (e) { }
}
async function onCred(r) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', token: r.credential })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'No se pudo iniciar sesión');
    setSession(j.data.session);
  } catch (e) { st = 'error'; lastErr = e.message; updateStatus(); return; }
  sync();
}
function loadGsi() {
  if (gReady || gLoading || !navigator.onLine) return;
  gLoading = true;
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onerror = () => { gLoading = false; };
  document.head.appendChild(s);
  let n = 0;
  const t = setInterval(() => {
    n++;
    if (window.google && google.accounts && google.accounts.id) {
      clearInterval(t);
      google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCred, auto_select: true, cancel_on_tap_outside: false });
      google.accounts.id.renderButton($('gbtn'), { theme: 'outline', size: 'medium', text: 'signin_with', locale: 'es' });
      gReady = true;
      promptLogin();
    } else if (n > 60) { clearInterval(t); gLoading = false; }
  }, 300);
}
let lastPrompt = 0;
function promptLogin() {
  if (!gReady || getToken() || Date.now() - lastPrompt < 20000) return;
  lastPrompt = Date.now();
  try { google.accounts.id.prompt(); } catch (e) { /* el botón queda como alternativa */ }
}

// ===== API (Apps Script) =====
async function api(action, extra) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
    body: JSON.stringify(Object.assign({ action: action, session: auth.session }, extra))
  });
  const j = await r.json();
  if (!j.ok) {
    if (/token|autorizado|sesi/i.test(j.error || '')) { setSession(null); throw new Error('auth'); }
    throw new Error(j.error || 'Error desconocido');
  }
  return j.data;
}

async function sync() {
  if (syncing) return;
  if (!navigator.onLine) { updateStatus(); return; }
  if (!auth.session) loadGsi();
  const pend = items.some(i => i.pending || i.deleted);
  if (!getToken()) { promptLogin(); st = (pend || !pulled) ? 'login' : 'ok'; updateStatus(); return; }
  syncing = true; st = 'syncing'; updateStatus();
  try {
    for (const x of items.filter(i => i.pending && !i.deleted)) {
      await api('add', { expense: { id: x.id, fecha: x.fecha, monto: x.monto, categoria: x.categoria, descripcion: x.descripcion } });
      x.pending = 0; await putItem(x);
    }
    for (const x of items.filter(i => i.deleted)) {
      await api('delete', { id: x.id });
      await delItem(x.id);
      items = items.filter(i => i.id !== x.id);
    }
    const server = await api('list', {});
    const ids = new Set(server.map(s => s.id));
    for (const x of items.filter(i => !i.pending && !i.deleted && !ids.has(i.id))) await delItem(x.id);
    for (const s of server) {
      const local = items.find(i => i.id === s.id);
      if (local && (local.pending || local.deleted)) continue;
      await putItem({ id: s.id, fecha: s.fecha, monto: s.monto, categoria: s.categoria, descripcion: s.descripcion, pending: 0, deleted: 0 });
    }
    pulled = true; st = 'ok';
  } catch (e) {
    if (e.message === 'auth') { st = 'login'; loadGsi(); }
    else { st = 'error'; lastErr = e.message; console.error(e); }
  } finally {
    syncing = false;
    try { items = await allItems(); } catch (e) { /* se conserva la lista en memoria */ }
    render();
  }
  if (st === 'ok' && items.some(i => i.pending || i.deleted)) sync();
}

// ===== Acciones =====
async function addItem(x) { items.push(x); await putItem(x); render(); sync(); }
async function removeItem(id) {
  const x = items.find(i => i.id === id);
  if (!x) return;
  x.deleted = 1; await putItem(x); render(); sync();
}

function openForm() {
  $('amt').value = ''; $('desc').value = ''; $('err').textContent = '';
  $('date').value = todayStr(); $('date').max = todayStr();
  $('dlg').showModal();
  $('amt').focus();
}

function init() {
  const sel = $('cat');
  Object.keys(CATS).forEach(k => { const o = el('option', '', k); o.value = k; sel.appendChild(o); });

  $('prev').addEventListener('click', () => { month = shiftMonth(month, -1); render(); });
  $('next').addEventListener('click', () => { month = shiftMonth(month, 1); render(); });
  $('fab').addEventListener('click', openForm);
  $('cancel').addEventListener('click', () => $('dlg').close());
  $('refresh').addEventListener('click', () => { lastPrompt = 0; sync(); });
  $('amt').addEventListener('input', () => { $('err').textContent = ''; });
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const monto = parseFloat($('amt').value);
    if (!(monto > 0)) { $('err').textContent = 'Ingresa un monto mayor a cero'; $('amt').focus(); return; }
    const fecha = $('date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { $('err').textContent = 'Elige una fecha válida'; return; }
    const x = {
      id: crypto.randomUUID(), fecha: fecha, monto: monto, categoria: $('cat').value,
      descripcion: $('desc').value.trim().slice(0, 100), pending: 1, deleted: 0
    };
    $('dlg').close();
    month = fecha.slice(0, 7);
    await addItem(x);
  });

  window.addEventListener('online', sync);
  window.addEventListener('offline', updateStatus);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden) sync(); }, 5 * 60 * 1000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  allItems().then(r => { items = r; }).catch(() => { items = []; }).then(() => { render(); sync(); });
}
init();
