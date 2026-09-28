/* =====================================================================
   Logica compartida entre survivor-league_new.html (admin) y portal.html (jugadores).
   Script clasico (no modulo): las funciones leen la variable global `state` que
   declara cada pagina con `let state`.
   ===================================================================== */

/* ---------------- DATA ---------------- */
const TEAMS = [
 {abbr:'ARI',name:'Cardinals',c1:'#97233F',c2:'#000000'},
 {abbr:'ATL',name:'Falcons',c1:'#A71930',c2:'#000000'},
 {abbr:'BAL',name:'Ravens',c1:'#241773',c2:'#9E7C0C'},
 {abbr:'BUF',name:'Bills',c1:'#00338D',c2:'#C60C30'},
 {abbr:'CAR',name:'Panthers',c1:'#0085CA',c2:'#101820'},
 {abbr:'CHI',name:'Bears',c1:'#0B162A',c2:'#C83803'},
 {abbr:'CIN',name:'Bengals',c1:'#FB4F14',c2:'#000000'},
 {abbr:'CLE',name:'Browns',c1:'#311D00',c2:'#FF3C00'},
 {abbr:'DAL',name:'Cowboys',c1:'#003594',c2:'#869397'},
 {abbr:'DEN',name:'Broncos',c1:'#FB4F14',c2:'#002244'},
 {abbr:'DET',name:'Lions',c1:'#0076B6',c2:'#B0B7BC'},
 {abbr:'GB', name:'Packers',c1:'#203731',c2:'#FFB612'},
 {abbr:'HOU',name:'Texans',c1:'#03202F',c2:'#A71930'},
 {abbr:'IND',name:'Colts',c1:'#002C5F',c2:'#A2AAAD'},
 {abbr:'JAX',name:'Jaguars',c1:'#101820',c2:'#D7A22A'},
 {abbr:'KC', name:'Chiefs',c1:'#E31837',c2:'#FFB612'},
 {abbr:'LV', name:'Raiders',c1:'#000000',c2:'#A5ACAF'},
 {abbr:'LAC',name:'Chargers',c1:'#0080C6',c2:'#FFC20E'},
 {abbr:'LAR',name:'Rams',c1:'#003594',c2:'#FFA300'},
 {abbr:'MIA',name:'Dolphins',c1:'#008E97',c2:'#FC4C02'},
 {abbr:'MIN',name:'Vikings',c1:'#4F2683',c2:'#FFC62F'},
 {abbr:'NE', name:'Patriots',c1:'#002244',c2:'#C60C30'},
 {abbr:'NO', name:'Saints',c1:'#D3BC8D',c2:'#101820'},
 {abbr:'NYG',name:'Giants',c1:'#0B2265',c2:'#A71930'},
 {abbr:'NYJ',name:'Jets',c1:'#125740',c2:'#000000'},
 {abbr:'PHI',name:'Eagles',c1:'#004C54',c2:'#A5ACAF'},
 {abbr:'PIT',name:'Steelers',c1:'#FFB612',c2:'#101820'},
 {abbr:'SF', name:'49ers',c1:'#AA0000',c2:'#B3995D'},
 {abbr:'SEA',name:'Seahawks',c1:'#002244',c2:'#69BE28'},
 {abbr:'TB', name:'Buccaneers',c1:'#D50A0A',c2:'#34302B'},
 {abbr:'TEN',name:'Titans',c1:'#0C2340',c2:'#4B92DB'},
 {abbr:'WAS',name:'Commanders',c1:'#5A1414',c2:'#FFB612'}
];
const TEAM_MAP = Object.fromEntries(TEAMS.map(t=>[t.abbr,t]));

const WEEKS = [];
for(let i=1;i<=18;i++) WEEKS.push({key:'WK'+i, label:'WK '+i});
WEEKS.push({key:'WC', label:'Wild Card'});
WEEKS.push({key:'DIV', label:'Divisional'});
WEEKS.push({key:'CONF', label:'Conf.'});
WEEKS.push({key:'SB', label:'Super Bowl'});
const WEEK_INDEX = Object.fromEntries(WEEKS.map((w,i)=>[w.key,i]));
const WEEK_LABEL = Object.fromEntries(WEEKS.map(w=>[w.key,w.label]));

const DEFAULT_TIE_MARGIN = 6;
const ELO_START = 1500;
const ELO_K = 30;

/* ---------------- PARTIDOS -> ESTADO ----------------
   Los resultados salen de los marcadores de la tabla games:
   state.schedule[wk] = [[visitante, local], ...]
   state.finished[wk] = equipos cuyo partido ya tiene marcador
   state.results[wk]  = equipos que perdieron (un empate no cuesta vida)
   untilWeekKey limita los resultados a esa semana (para lo que se publica). */
function applyGamesToState(target, games, untilWeekKey){
  const limit = untilWeekKey ? WEEK_INDEX[untilWeekKey] : Infinity;
  const schedule = {}, finished = {}, results = {};
  games.slice().sort((a,b)=> (a.kickoff||'').localeCompare(b.kickoff||'') || a.id - b.id).forEach(g=>{
    if(!(g.week in WEEK_INDEX) || !TEAM_MAP[g.away] || !TEAM_MAP[g.home]) return;
    (schedule[g.week] = schedule[g.week] || []).push([g.away, g.home]);
    if(g.away_score == null || g.home_score == null || WEEK_INDEX[g.week] > limit) return;
    (finished[g.week] = finished[g.week] || []).push(g.away, g.home);
    results[g.week] = results[g.week] || [];
    if(g.away_score < g.home_score) results[g.week].push(g.away);
    else if(g.home_score < g.away_score) results[g.week].push(g.home);
  });
  target.schedule = schedule;
  target.finished = finished;
  target.results = results;
  return target;
}

/* Semana "en curso": la del siguiente partido que no ha empezado */
function currentWeekKey(games, now){
  const t = now || Date.now();
  const upcoming = games.filter(g=>g.kickoff && Date.parse(g.kickoff) > t)
    .sort((a,b)=> Date.parse(a.kickoff) - Date.parse(b.kickoff))[0];
  if(upcoming) return upcoming.week;
  const weeks = [...new Set(games.map(g=>g.week))].sort((a,b)=>WEEK_INDEX[a]-WEEK_INDEX[b]);
  return weeks[weeks.length-1] || WEEKS[0].key;
}
function gameStarted(g, now){ return !!(g && g.kickoff && Date.parse(g.kickoff) <= (now || Date.now())); }
function gameHasScore(g){ return g && g.away_score != null && g.home_score != null; }
function formatKickoff(iso){
  if(!iso) return 'Sin horario';
  return new Date(iso).toLocaleString('es-MX', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

/* ---------------- SURVIVOR ---------------- */
function weekComplete(weekKey){
  const g = state.schedule && state.schedule[weekKey];
  const fin = state.finished && state.finished[weekKey];
  return !!(g && g.length && fin && fin.length >= g.length * 2);
}
function teamFinished(weekKey, abbr){
  const fin = state.finished && state.finished[weekKey];
  return !!(fin && fin.includes(abbr));
}
/* Recorre las semanas en orden. Las semanas sin pick solo cuestan vida si la regla esta activa,
   la semana ya se jugo completa y el jugador seguia vivo en ese momento. */
function playerTimeline(player){
  let lives = player.startingLives ?? state.startingLivesDefault;
  const missed = new Set();
  WEEKS.forEach(w=>{
    const fin = state.finished && state.finished[w.key];
    if(!fin || !fin.length) return;
    const pick = player.picks[w.key];
    if(pick){ if(fin.includes(pick) && (state.results[w.key] || []).includes(pick)) lives--; }
    else if(state.missedPickCostsLife && weekComplete(w.key) && lives > 0){ lives--; missed.add(w.key); }
  });
  return { lives: Math.max(0, lives), missed };
}
function currentLives(player){ return playerTimeline(player).lives; }
function isOut(player){ return currentLives(player) <= 0; }

let scheduleIndexCache = null, scheduleIndexSrc = null; // weekKey -> { abbr: rival }
function scheduleIndex(){
  if(scheduleIndexCache && scheduleIndexSrc === state.schedule) return scheduleIndexCache;
  scheduleIndexSrc = state.schedule;
  const idx = {};
  Object.entries(state.schedule || {}).forEach(([wk, games])=>{
    const m = {};
    games.forEach(([away, home])=>{ m[away] = home; m[home] = away; });
    idx[wk] = m;
  });
  return scheduleIndexCache = idx;
}
function weekHasSchedule(weekKey){ return !!scheduleIndex()[weekKey]; }
function hasAnySchedule(){ return Object.keys(state.schedule || {}).length > 0; }
/* null = esa semana no tiene calendario o el equipo descansa (ver weekHasSchedule) */
function opponentOf(weekKey, abbr){
  const m = scheduleIndex()[weekKey];
  return (m && m[abbr]) || null;
}
/* Cuantas veces eligio este jugador "contra" cada rival. excludeWeekKey deja fuera la semana
   que se esta editando, para saber si el pick nuevo rebasaria el tope. */
function againstCounts(player, excludeWeekKey){
  const counts = new Map();
  WEEKS.forEach(w=>{
    if(w.key===excludeWeekKey) return;
    const pick = player.picks[w.key];
    const opp = pick && opponentOf(w.key, pick);
    if(opp) counts.set(opp, (counts.get(opp)||0) + 1);
  });
  return counts;
}
function usedTeams(player, excludeWeekKey){
  const set = new Set();
  WEEKS.forEach(w=>{
    if(w.key===excludeWeekKey) return;
    const p = player.picks[w.key];
    if(p) set.add(p);
  });
  return set;
}
function weekStatus(player, weekKey, timeline){
  const pick = player.picks[weekKey];
  if(!pick) return (timeline || playerTimeline(player)).missed.has(weekKey) ? 'missed' : 'none';
  if(!teamFinished(weekKey, pick)) return 'pending';
  return (state.results[weekKey] || []).includes(pick) ? 'lost' : 'won';
}
function teamsPickedInWeek(weekKey){
  const set = new Set();
  state.players.forEach(p=>{ if(p.picks[weekKey]) set.add(p.picks[weekKey]); });
  return set;
}

/* ---------------- PICK'EM ---------------- */
/* 'tie' = partido cerrado: diferencia menor a tieMargin (no necesariamente empate real) */
function gameOutcome(g, tieMargin){
  if(!gameHasScore(g)) return null;
  const diff = g.home_score - g.away_score;
  if(Math.abs(diff) < (tieMargin ?? DEFAULT_TIE_MARGIN)) return 'tie';
  return diff > 0 ? 'home' : 'away';
}
/* -> { WK1: { playerId: puntos } } solo para semanas con al menos un marcador (<= untilWeekKey) */
function pickemWeekly(games, picks, playerIds, tieMargin, untilWeekKey){
  const limit = untilWeekKey ? WEEK_INDEX[untilWeekKey] : Infinity;
  const byGame = {};
  picks.forEach(p=>{ (byGame[p.game_id] = byGame[p.game_id] || {})[p.player_id] = p.choice; });
  const weekly = {};
  games.forEach(g=>{
    if(!(g.week in WEEK_INDEX) || WEEK_INDEX[g.week] > limit) return;
    const out = gameOutcome(g, tieMargin);
    if(!out) return;
    const wk = weekly[g.week] = weekly[g.week] || Object.fromEntries(playerIds.map(id=>[id,0]));
    const gp = byGame[g.id] || {};
    playerIds.forEach(id=>{ if(gp[id] === out) wk[id]++; });
  });
  return weekly;
}
/* Elo semanal (misma formula que la hoja de calculo):
   Elo = Elo anterior + 30 * ( promedio_j 1/(1+10^(-(Pts_i - Pts_j)/3))
                              - promedio_j 1/(1+10^((Elo_j - Elo_i)/400)) )
   -> { WK1: { playerId: { elo, change } } } */
function computeElo(weekly, playerIds){
  const history = {};
  let elo = Object.fromEntries(playerIds.map(id=>[id, ELO_START]));
  const n = playerIds.length;
  if(!n) return history;
  WEEKS.filter(w=>weekly[w.key]).forEach(w=>{
    const pts = playerIds.map(id=> weekly[w.key][id] || 0);
    const prev = playerIds.map(id=> elo[id]);
    const next = {};
    history[w.key] = {};
    playerIds.forEach((id, i)=>{
      let actual = 0, expected = 0;
      for(let j=0; j<n; j++){
        actual += 1 / (1 + Math.pow(10, -(pts[i] - pts[j]) / 3));
        expected += 1 / (1 + Math.pow(10, (prev[j] - prev[i]) / 400));
      }
      next[id] = prev[i] + ELO_K * (actual / n - expected / n);
      history[w.key][id] = { elo: next[id], change: next[id] - prev[i] };
    });
    elo = next;
  });
  return history;
}
/* Tabla de posiciones acumulada hasta weekKey: puntos totales, luego Elo */
function pickemStandings(players, weekly, eloHistory, weekKey){
  const upTo = WEEK_INDEX[weekKey];
  const weeksIn = WEEKS.filter(w=> weekly[w.key] && WEEK_INDEX[w.key] <= upTo);
  const rank = (wks)=>{
    const lastWk = wks.length ? wks[wks.length-1].key : null;
    const rows = players.map(p=>{
      const total = wks.reduce((a,w)=> a + (weekly[w.key][p.id] || 0), 0);
      const e = lastWk && eloHistory[lastWk] && eloHistory[lastWk][p.id];
      return { player: p, total, elo: e ? e.elo : ELO_START, eloChange: e ? e.change : 0,
               week: lastWk ? (weekly[lastWk][p.id] || 0) : 0 };
    });
    rows.sort((a,b)=> b.total - a.total || b.elo - a.elo || a.player.name.localeCompare(b.player.name));
    let pos = 0;
    rows.forEach((r, i)=>{ if(i===0 || r.total !== rows[i-1].total || Math.round(r.elo) !== Math.round(rows[i-1].elo)) pos = i + 1; r.pos = pos; });
    return rows;
  };
  const rows = rank(weeksIn);
  const prevRows = weeksIn.length > 1 ? rank(weeksIn.slice(0, -1)) : null;
  if(prevRows){
    const prevPos = Object.fromEntries(prevRows.map(r=>[r.player.id, r.pos]));
    rows.forEach(r=>{ r.move = prevPos[r.player.id] - r.pos; });
  } else rows.forEach(r=>{ r.move = 0; });
  return { rows, weekKey: weeksIn.length ? weeksIn[weeksIn.length-1].key : null };
}

/* ---------------- RENDER COMPARTIDO ---------------- */
function renderPickCell(pick, cls, title){
  /* Una abreviatura desconocida se dibuja con el texto crudo (escapado) en vez de tumbar el render. */
  const team = TEAM_MAP[pick] || { name: pick, c1: 'var(--line)' };
  const logo = state.teamLogos[pick];
  const tip = escapeHtml(title || `${pick} - ${team.name}`);
  const safePick = escapeHtml(pick);
  if(state.showLogos && logo){
    return `<span class="cell-logo ${cls}" title="${tip}"><img src="${escapeHtml(logo)}" alt="${safePick}"></span>`;
  }
  return `<span class="cell-pick ${cls}" style="border-color:${team.c1};" title="${tip}">${safePick}</span>`;
}
function teamLogoOrText(abbr){
  const logo = state.teamLogos[abbr];
  return state.showLogos && logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(abbr)}">` : escapeHtml(abbr);
}

function renderMainTable(weeksToShow, playersToShow){
  const weeks = weeksToShow || WEEKS;
  const players = playersToShow || state.players;
  const table = document.getElementById('mainTable');
  let html = '<thead><tr><th>Jugador</th><th>Vidas</th>';
  weeks.forEach(w=> html += `<th>${w.label}</th>`);
  html += '</tr></thead><tbody>';
  players.forEach(p=>{
    const tl = playerTimeline(p);
    const lives = tl.lives;
    const out = lives <= 0;
    const start = p.startingLives ?? state.startingLivesDefault;
    const rowBg = p.rowColor || null;
    const rowText = rowBg ? pickTextColor(rowBg) : null;
    const rowStyle = rowBg ? ` style="background:${rowBg};color:${rowText};"` : '';
    html += `<tr class="${out?'out-row':''}"${rowStyle}>`;
    html += `<td class="namecell"${rowStyle}>${escapeHtml(p.name)}</td>`;
    let pips = '';
    for(let i=0;i<start;i++) pips += `<span class="pip ${i<lives?'on':''}"></span>`;
    html += `<td class="livescell"${rowStyle}><span class="lives-pips">${pips}</span></td>`;
    weeks.forEach(w=>{
      const pick = p.picks[w.key];
      const st = weekStatus(p, w.key, tl);
      if(st==='missed'){ html += '<td><span class="cell-pick missed" title="Sin pick: pierde una vida">&mdash;</span></td>'; }
      else if(!pick){ html += '<td></td>'; }
      else{
        const cls = st==='lost'?'lost':(st==='won'?'won':'pending');
        const opp = opponentOf(w.key, pick);
        const team = TEAM_MAP[pick];
        const tip = `${w.label}: ${pick}${team ? ' - '+team.name : ''}${opp ? ' vs '+opp : ''}`;
        html += `<td>${renderPickCell(pick, cls, tip)}</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

/* Tarjeta individual de un jugador. withExport agrega el boton "Descargar PNG" (no sale en la imagen). */
function buildPlayerCard(p, idx, withExport){
  const showVs = hasAnySchedule();
  const max = state.maxAgainst;
  const tl = playerTimeline(p);
  const lives = tl.lives;
  const out = lives <= 0;
  const start = p.startingLives ?? state.startingLivesDefault;
  const picksList = WEEKS.filter(w=>p.picks[w.key]).map(w=>{
    const pick = p.picks[w.key];
    const st = weekStatus(p, w.key, tl);
    const cls = st==='lost'?'lost':(st==='won'?'won':'pending');
    const shortWk = w.label.replace('WK ','S');
    const opp = opponentOf(w.key, pick);
    const tip = escapeHtml(`${w.label}: ${pick}${opp ? ' vs '+opp : ''}`);
    const logo = state.teamLogos[pick];
    if(state.showLogos && logo){
      return `<span class="cell-logo ${cls}" title="${tip}"><span class="wk-tag">${shortWk}</span><img src="${escapeHtml(logo)}" alt="${escapeHtml(pick)}"></span>`;
    }
    return `<span class="cell-pick ${cls}" title="${tip}">${shortWk}: ${escapeHtml(pick)}</span>`;
  }).join('');
  // Columna "Contra": cada rival con su contador; ambar al llegar al tope, rojo si lo rebasa
  let vsCol = '';
  if(showVs){
    const counts = [...againstCounts(p).entries()].sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]));
    const items = counts.map(([opp, n])=>{
      const cls = n > max ? ' over' : (n === max ? ' limit' : '');
      return `<span class="vs-item${cls}" title="Contra ${opp}: ${n} ${n===1?'vez':'veces'} (tope ${max})">${teamLogoOrText(opp)}<span class="vs-count">×${n}</span></span>`;
    }).join('');
    vsCol = `<div class="pc-col-vs"><div class="pc-col-lbl">Contra</div>${items ? `<div class="pc-against">${items}</div>` : '<span class="empty-note">&mdash;</span>'}</div>`;
  }
  const card = document.createElement('div');
  card.className = 'player-card' + (out?' out':'') + (p.rowColor?' has-custom-color':'');
  card.id = 'card-'+idx;
  if(p.rowColor) card.style.borderLeftColor = p.rowColor;
  let pips = '';
  for(let i=0;i<start;i++) pips += `<span class="pc-pip ${i<lives?'':'off'}"></span>`;
  const picksCol = `<div class="pc-picks">${picksList || '<span class="empty-note">Sin selecciones aún</span>'}</div>`;
  card.innerHTML = `
    <div class="pc-head">
      <div class="pc-name">${escapeHtml(p.name)}</div>
      <div class="pc-status" style="color:${out?'var(--loss)':'var(--win)'}">${out?'ELIMINADO':'EN JUEGO'}</div>
    </div>
    <div class="pc-lives">${pips}</div>
    ${showVs ? `<div class="pc-body"><div><div class="pc-col-lbl">Picks</div>${picksCol}</div>${vsCol}</div>` : picksCol}
    ${withExport ? `<div class="pc-foot no-export"><button class="btn ghost small" data-card-export="${idx}">Descargar PNG</button></div>` : ''}
  `;
  return card;
}

/* ---------------- EXPORT ---------------- */
/* Los navegadores tienen un limite de canvas (~16k px por lado; Safari ~16.7M px de area). */
function safeCanvasScale(el, wanted){
  const w = Math.max(1, el.scrollWidth), h = Math.max(1, el.scrollHeight);
  return Math.max(1, Math.min(wanted, 16000 / w, 16000 / h, Math.sqrt(16e6 / (w * h))));
}
function safePlayerFileName(name){
  return (name || 'jugador').normalize('NFD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'jugador';
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}
function exportElementAsPng(el, filename){
  return html2canvas(el, {
    backgroundColor:'#101a4a', scale:safeCanvasScale(el, 4), useCORS:true, imageTimeout:15000,
    ignoreElements: (node)=> node.classList && node.classList.contains('no-export')
  }).then(canvas=>{
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

/* ---------------- UTIL ---------------- */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
/* Contraste automatico: texto blanco o negro segun que tan clara sea la fila con color personalizado. */
function pickTextColor(hex){
  const h = (hex || '').replace('#', '');
  if(h.length !== 6) return '#f4f5fb';
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.6 ? '#050816' : '#f4f5fb';
}
