/* =====================================================================
   VISTA PREVIA del portal (rama main) — reemplaza a js/supa.js.
   Expone las mismas funciones (sb, sbq, sbAll, load*, mountAuthGate, signOut)
   pero sin Supabase:
   - Login falso: eliges un jugador de la lista y entras como él, sin contraseña.
   - Jugadores, picks del survivor y resultados: los mismos que usa hoy
     survivor-league_new.html (autoguardado de este navegador o los datos guardados
     dentro del archivo). Los resultados oficiales no cambian.
   - Calendario, horarios y marcadores del pick'em: nfl-2026-UTC.csv.
   - Lo que elijas aquí se guarda solo en este navegador (localStorage), aparte
     de los datos reales.
   Requiere cargar antes league-core.js
   ===================================================================== */
const PREVIEW_PICKS_KEY = 'ra-preview-picks';   // { survivor:{playerId:{wk:team}}, pickem:{playerId:{gameId:choice}} }
const PREVIEW_USER_KEY = 'ra-preview-user';     // id del jugador con el que se entró
const PREVIEW_USER_PREFIX = 'preview-';

/* ---------------- DATOS ---------------- */
function previewRead(key){ try{ return JSON.parse(localStorage.getItem(key) || 'null'); }catch(e){ return null; } }
function previewWrite(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }

/* El mismo estado que abre survivor-league_new.html: el autoguardado de este navegador
   o, si es más nuevo, el que viene guardado dentro del archivo. */
async function previewSurvivorState(){
  const local = previewRead('survivor-league-data');
  let embedded = null;
  try{
    const html = await (await fetch('survivor-league_new.html', { cache: 'no-cache' })).text();
    const tag = new DOMParser().parseFromString(html, 'text/html').getElementById('embeddedStateData');
    if(tag) embedded = JSON.parse(tag.textContent);
  }catch(e){ /* abierto con doble clic (file://): solo queda el autoguardado */ }
  const useLocal = local && local.players && (!embedded || (local.savedAt || 0) >= (embedded.savedAt || 0));
  const s = useLocal ? Object.assign({}, local, previewRead('survivor-league-logos') || {}) : (embedded || {});
  s.players = Array.isArray(s.players) ? s.players : [];
  s.players.forEach(p=>{ if(!p.picks || typeof p.picks !== 'object') p.picks = {}; });
  s.results = s.results && typeof s.results === 'object' ? s.results : {};
  return s;
}

/* nfl-2026-UTC.csv (fixturedownload.com): Round Number, Date (UTC, dd/mm/aaaa hh:mm), Home Team, Away Team, Result (local - visitante) */
function previewTeam(fullName){
  const n = String(fullName || '').trim();
  const t = TEAMS.find(t=> n.endsWith(' ' + t.name) || n === t.abbr);
  return t ? t.abbr : null;
}
async function previewGames(){
  let text = '';
  try{ text = await (await fetch('nfl-2026-UTC.csv', { cache: 'no-cache' })).text(); }catch(e){ return []; }
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(l=> l.split(','));
  const head = rows.shift() || [];
  const col = name=> head.findIndex(h=> h.trim().toLowerCase() === name);
  const iId = col('match number'), iWk = col('round number'), iDate = col('date'), iHome = col('home team'), iAway = col('away team'), iRes = col('result');
  return rows.map(r=>{
    const m = (r[iDate] || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    const score = (r[iRes] || '').match(/(\d+)\s*-\s*(\d+)/);
    return {
      id: parseInt(r[iId], 10), week: 'WK' + parseInt(r[iWk], 10),
      away: previewTeam(r[iAway]), home: previewTeam(r[iHome]),
      kickoff: m ? new Date(Date.UTC(+m[3], +m[2]-1, +m[1], +m[4], +m[5])).toISOString() : null,
      home_score: score ? +score[1] : null, away_score: score ? +score[2] : null
    };
  }).filter(g=> g.id && g.away && g.home && g.week in WEEK_INDEX);
}

let previewDbPromise = null;
function previewDb(){
  if(!previewDbPromise) previewDbPromise = (async ()=>{
    const [sv, games] = await Promise.all([previewSurvivorState(), previewGames()]);
    const mine = previewRead(PREVIEW_PICKS_KEY) || {};
    const myPicks = { survivor: mine.survivor || {}, pickem: mine.pickem || {} };
    const players = sv.players.map((p, i)=>({
      id: p.id, name: p.name, starting_lives: p.startingLives ?? sv.startingLivesDefault ?? 3,
      row_color: p.rowColor || null, user_id: PREVIEW_USER_PREFIX + p.id, sort_order: i, created_at: null
    }));
    /* Picks del survivor: los reales; encima, los que hagas en la vista previa para semanas sin resultado */
    const survivorPicks = [];
    sv.players.forEach(p=>{
      const merged = Object.assign({}, p.picks);
      Object.entries(myPicks.survivor[p.id] || {}).forEach(([wk, team])=>{
        if(sv.results[wk]) return;
        if(team) merged[wk] = team; else delete merged[wk];
      });
      Object.entries(merged).forEach(([week, team])=> survivorPicks.push({ player_id: p.id, week, team }));
    });
    const pickemPicks = [];
    Object.entries(myPicks.pickem).forEach(([pid, byGame])=>{
      Object.entries(byGame).forEach(([gid, choice])=> pickemPicks.push({ player_id: pid, game_id: Number(gid), choice }));
    });
    const assets = [];
    Object.entries(sv.teamLogos || {}).forEach(([abbr, v])=>{ if(v) assets.push({ key: 'team:' + abbr, value: v }); });
    ['leagueLogo', 'tableWatermark', 'survivorRibbon'].forEach(k=>{ if(sv[k]) assets.push({ key: k, value: sv[k] }); });
    const settings = {
      startingLivesDefault: sv.startingLivesDefault ?? 3, missedPickCostsLife: !!sv.missedPickCostsLife,
      maxAgainst: sv.maxAgainst || 5, showLogos: !!sv.showLogos, tieMargin: DEFAULT_TIE_MARGIN
    };
    return { sv, games, myPicks, settings, tables: {
      games, players, assets, survivor_picks: survivorPicks, pickem_picks: pickemPicks,
      settings: [{ id: 1, data: settings }], profiles: [], publications: []
    }};
  })();
  return previewDbPromise;
}

/* "Publicación" armada al vuelo con los resultados actuales, igual que el botón Publicar del admin */
function previewPublication(db){
  const t = db.tables, sv = db.sv;
  const resultWeeks = WEEKS.filter(w=> sv.results[w.key]);
  if(!resultWeeks.length) return null;
  const through = resultWeeks[resultWeeks.length-1].key;
  const limit = WEEK_INDEX[through];
  /* Semana con resultados = semana jugada: todos los equipos cuentan como terminados */
  const finished = Object.fromEntries(resultWeeks.map(w=>[w.key, TEAMS.map(x=>x.abbr)]));
  const players = sv.players.map(p=>({
    id: p.id, name: p.name, startingLives: p.startingLives ?? db.settings.startingLivesDefault, rowColor: p.rowColor || null,
    picks: Object.fromEntries(Object.entries(p.picks).filter(([wk])=> WEEK_INDEX[wk] <= limit))
  }));
  const ids = players.map(p=>p.id);
  const tie = db.settings.tieMargin;
  const pkLimit = WEEKS[Math.max(limit, ...t.games.filter(gameHasScore).map(g=> WEEK_INDEX[g.week]))].key;
  const weekly = pickemWeekly(t.games, t.pickem_picks, ids, tie, pkLimit);
  const outcomes = {};
  t.games.forEach(g=>{ const o = gameOutcome(g, tie); if(o) outcomes[g.id] = o; });
  return {
    id: 1, through_week: through, published_at: new Date().toISOString(), published_by: null,
    snapshot: { version: 1, throughWeek: through,
      survivor: { startingLivesDefault: db.settings.startingLivesDefault, missedPickCostsLife: db.settings.missedPickCostsLife,
                  maxAgainst: db.settings.maxAgainst, showLogos: db.settings.showLogos, players, finished, results: sv.results },
      pickem: { tieMargin: tie, weekly, elo: computeElo(weekly, ids), outcomes } }
  };
}

/* ---------------- CLIENTE FALSO ----------------
   Imita lo que usan las páginas de supabase-js: from().select/upsert/delete + eq/in/order/range/limit/maybeSingle. */
function previewQuery(table){
  const q = { op: 'select', filters: [], rows: null, single: false, from: 0, to: Infinity, lim: Infinity };
  const api = {
    select(){ return api; },
    upsert(rows){ q.op = 'upsert'; q.rows = [].concat(rows); return api; },
    insert(rows){ q.op = 'upsert'; q.rows = [].concat(rows); return api; },
    update(){ q.op = 'readonly'; return api; },
    delete(){ q.op = 'delete'; return api; },
    eq(col, val){ q.filters.push(r=> r[col] === val); return api; },
    in(col, vals){ q.filters.push(r=> vals.includes(r[col])); return api; },
    order(){ return api; },
    range(from, to){ q.from = from; q.to = to; return api; },
    limit(n){ q.lim = n; return api; },
    maybeSingle(){ q.single = true; return api; },
    then(ok, fail){ return run().then(ok, fail); }
  };
  async function run(){
    const db = await previewDb();
    const t = db.tables;
    if(table === 'publications'){
      const pub = previewPublication(db);
      return { data: q.single ? pub : (pub ? [pub] : []), error: null };
    }
    if(table === 'profiles') return { data: q.single ? { is_admin: true } : [], error: null };
    if(q.op === 'readonly') return { data: null, error: { message: 'En la vista previa no se puede cambiar esto.' } };
    if(q.op === 'upsert' || q.op === 'delete') return previewWriteRows(db, table, q);
    const rows = (t[table] || []).filter(r=> q.filters.every(f=> f(r)));
    const page = rows.slice(q.from, Math.min(q.to + 1, q.from + q.lim));
    return { data: q.single ? (page[0] || null) : page, error: null };
  }
  return api;
}
/* Solo se pueden escribir los picks (survivor y pick'em), con la misma regla de cierre al kickoff que la base real */
function previewWriteRows(db, table, q){
  const t = db.tables;
  const err = m=> ({ data: null, error: { message: m } });
  if(table !== 'survivor_picks' && table !== 'pickem_picks') return err('En la vista previa no se puede cambiar esto.');
  const isSv = table === 'survivor_picks';
  const key = r=> isSv ? r.player_id + '|' + r.week : r.player_id + '|' + r.game_id;
  const gameFor = r=> isSv
    ? t.games.find(g=> g.week === r.week && (g.away === r.team || g.home === r.team))
    : t.games.find(g=> g.id === r.game_id);
  const store = isSv ? db.myPicks.survivor : db.myPicks.pickem;
  if(q.op === 'delete'){
    const gone = t[table].filter(r=> q.filters.every(f=> f(r)));
    if(gone.some(r=> gameStarted(gameFor(r)))) return err('Ese partido ya empezó: el pick ya no se puede quitar.');
    t[table] = t[table].filter(r=> !gone.includes(r));
    gone.forEach(r=>{ const s = store[r.player_id] = store[r.player_id] || {}; if(isSv) s[r.week] = null; else delete s[r.game_id]; });
  } else {
    for(const r of q.rows){
      if(gameStarted(gameFor(r))) return err('Ese partido ya empezó: el pick quedó cerrado.');
      const prev = t[table].find(x=> key(x) === key(r));
      if(isSv && prev && gameStarted(gameFor(prev))) return err('Tu pick de esa semana ya empezó y no se puede cambiar.');
      t[table] = t[table].filter(x=> key(x) !== key(r)).concat([Object.assign({}, r)]);
      const s = store[r.player_id] = store[r.player_id] || {};
      if(isSv) s[r.week] = r.team; else s[r.game_id] = r.choice;
    }
  }
  previewWrite(PREVIEW_PICKS_KEY, db.myPicks);
  return { data: null, error: null };
}
const sb = {
  from: previewQuery,
  channel(){ const ch = { on(){ return ch; }, subscribe(){ return ch; } }; return ch; },
  removeChannel(){}
};

async function sbq(query){
  const { data, error } = await query;
  if(error) throw error;
  return data;
}
async function sbAll(makeQuery){ return sbq(makeQuery()); }

/* ---------------- CARGA DE DATOS (misma forma que js/supa.js) ---------------- */
function loadGames(){ return sbAll(()=> sb.from('games').select('*').order('id')); }
async function loadSettings(){
  const row = await sbq(sb.from('settings').select('data').eq('id', 1).maybeSingle());
  return (row && row.data) || {};
}
async function loadPlayers(){
  const rows = await sbq(sb.from('players').select('*'));
  return rows.map(r=>({ id: r.id, name: r.name, startingLives: r.starting_lives, rowColor: r.row_color, userId: r.user_id, sortOrder: r.sort_order }));
}
async function loadAssets(){
  const rows = await sbq(sb.from('assets').select('key,value'));
  const out = { teamLogos: {}, leagueLogo: null, tableWatermark: { image: null, opacity: 0.12 }, survivorRibbon: null };
  rows.forEach(r=>{
    if(r.key.startsWith('team:')) out.teamLogos[r.key.slice(5)] = r.value;
    else out[r.key] = r.value;
  });
  if(!out.tableWatermark || typeof out.tableWatermark !== 'object') out.tableWatermark = { image: null, opacity: 0.12 };
  return out;
}
function loadLatestPublication(){ return sbq(sb.from('publications').select('*').maybeSingle()); }

/* ---------------- LOGIN FALSO ----------------
   Misma pantalla que el login real, pero en lugar de correo y contraseña eliges con qué jugador entrar. */
let previewSignedOut = null;
function mountAuthGate(opts){
  const gate = document.createElement('div');
  gate.className = 'auth-gate';
  gate.innerHTML = `
    <form class="auth-box">
      <div class="league-tag">Vista previa</div>
      <h2 class="auth-title">${escapeHtml(opts.title || 'Iniciar sesión')}</h2>
      <p class="auth-sub">Login de prueba: entra como cualquier jugador, sin contraseña. Lo que elijas se guarda solo en este navegador; los resultados reales no cambian.</p>
      <div class="auth-fields">
        <label>Entrar como<select name="player" required></select></label>
      </div>
      <button class="btn auth-submit" type="submit">Entrar</button>
      <button class="auth-link" type="button" data-act="reset">Borrar mis picks de prueba</button>
      <div class="auth-msg" role="status"></div>
      <a class="auth-link" href="index.html">&larr; Volver al inicio</a>
    </form>`;
  document.body.appendChild(gate);
  const form = gate.querySelector('form');
  const msg = gate.querySelector('.auth-msg');
  const setMsg = (t, isErr)=>{ msg.textContent = t || ''; msg.className = 'auth-msg' + (isErr ? ' err' : ''); };
  const show = ()=>{ gate.style.display = 'flex'; };
  const hide = ()=>{ gate.style.display = 'none'; };
  const enter = (pid)=>{
    const p = players.find(x=> x.id === pid);
    if(!p) return show();
    try{ sessionStorage.setItem(PREVIEW_USER_KEY, pid); }catch(e){}
    hide();
    opts.onReady && opts.onReady({ user: { id: p.userId, email: p.name + ' · vista previa' } });
  };
  let players = [];

  loadPlayers().then(list=>{
    players = list;
    if(!players.length){
      setMsg('No hay jugadores: abre el Survivor y carga o guarda tus datos primero.', true);
      form.querySelector('.auth-submit').disabled = true;
      return;
    }
    form.player.innerHTML = players.map(p=> `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    let last = null;
    try{ last = sessionStorage.getItem(PREVIEW_USER_KEY); }catch(e){}
    if(last && players.some(p=> p.id === last)){ form.player.value = last; enter(last); }
    else show();
  }).catch(err=> setMsg('No se pudieron cargar los jugadores: ' + (err.message || err), true));

  form.addEventListener('submit', e=>{ e.preventDefault(); setMsg(''); enter(form.player.value); });
  gate.querySelector('[data-act="reset"]').addEventListener('click', ()=>{
    if(!confirm('¿Borrar todos los picks que hiciste en la vista previa?')) return;
    try{ localStorage.removeItem(PREVIEW_PICKS_KEY); }catch(e){}
    previewDbPromise = null;
    setMsg('Listo: se borraron los picks de prueba.');
  });
  previewSignedOut = ()=>{
    try{ sessionStorage.removeItem(PREVIEW_USER_KEY); }catch(e){}
    show();
    opts.onSignedOut && opts.onSignedOut();
  };
  return { show, hide, setMsg };
}
async function signOut(){ if(previewSignedOut) previewSignedOut(); }
