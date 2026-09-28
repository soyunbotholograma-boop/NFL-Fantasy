/* =====================================================================
   Conexion a Supabase + login compartido (admin y portal).
   La llave "publishable" es publica a proposito: lo que cada quien puede leer o
   escribir lo deciden las reglas (RLS) de supabase/01_schema.sql, no esta llave.
   Requiere cargar antes: @supabase/supabase-js (UMD) y league-core.js
   ===================================================================== */
const SUPABASE_URL = 'https://oxlzedwhicfixqeacjql.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Hldn_EUWAY2LZTYjp4MyhQ_sZkKS1Hp';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function sbq(query){
  const { data, error } = await query;
  if(error) throw error;
  return data;
}
/* Supabase regresa maximo 1000 filas por consulta; los picks del pick'em pasan de eso */
async function sbAll(makeQuery, pageSize){
  const size = pageSize || 1000;
  const out = [];
  for(let from = 0; ; from += size){
    const rows = await sbq(makeQuery().range(from, from + size - 1));
    out.push(...rows);
    if(rows.length < size) return out;
  }
}

/* ---------------- CARGA DE DATOS ---------------- */
function loadGames(){ return sbAll(()=> sb.from('games').select('*').order('id')); }
async function loadSettings(){
  const row = await sbq(sb.from('settings').select('data').eq('id', 1).maybeSingle());
  return (row && row.data) || {};
}
async function loadPlayers(){
  const rows = await sbq(sb.from('players').select('*').order('sort_order').order('created_at'));
  return rows.map(r=>({ id: r.id, name: r.name, startingLives: r.starting_lives, rowColor: r.row_color, userId: r.user_id, sortOrder: r.sort_order }));
}
/* Imagenes: 'team:BAL' -> teamLogos.BAL; el resto con su propio nombre */
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
async function loadLatestPublication(){
  return sbq(sb.from('publications').select('*').order('published_at', { ascending: false }).limit(1).maybeSingle());
}

/* ---------------- LOGIN ----------------
   Muestra una pantalla de acceso encima de la pagina hasta que haya sesion.
   onReady(session) se llama cada vez que entra alguien (y al cargar si ya habia sesion). */
function mountAuthGate(opts){
  const gate = document.createElement('div');
  gate.className = 'auth-gate';
  gate.style.display = 'none'; // se muestra en cuanto Supabase confirma que no hay sesion
  gate.innerHTML = `
    <form class="auth-box" autocomplete="on">
      <div class="league-tag">Ramirez y Amigos</div>
      <h2 class="auth-title">${escapeHtml(opts.title || 'Iniciar sesión')}</h2>
      <p class="auth-sub">${escapeHtml(opts.subtitle || '')}</p>
      <div class="auth-fields" data-mode="login">
        <label>Correo<input type="email" name="email" autocomplete="username" required></label>
        <label class="auth-pass">Contraseña<input type="password" name="password" autocomplete="current-password"></label>
        <label class="auth-new" hidden>Nueva contraseña<input type="password" name="newPassword" autocomplete="new-password" minlength="8"></label>
      </div>
      <button class="btn auth-submit" type="submit">Entrar</button>
      <button class="auth-link" type="button" data-act="forgot">¿Olvidaste tu contraseña?</button>
      <div class="auth-msg" role="status"></div>
      <a class="auth-link" href="index.html">&larr; Volver al inicio</a>
    </form>`;
  document.body.appendChild(gate);
  const form = gate.querySelector('form');
  const msg = gate.querySelector('.auth-msg');
  const submit = gate.querySelector('.auth-submit');
  let mode = 'login'; // 'login' | 'forgot' | 'recovery'
  const setMsg = (t, isErr)=>{ msg.textContent = t || ''; msg.className = 'auth-msg' + (isErr ? ' err' : ''); };
  const setMode = (m)=>{
    mode = m;
    gate.querySelector('.auth-pass').hidden = m !== 'login';
    gate.querySelector('.auth-new').hidden = m !== 'recovery';
    form.email.closest('label').hidden = m === 'recovery';
    gate.querySelector('[data-act="forgot"]').textContent = m === 'login' ? '¿Olvidaste tu contraseña?' : 'Volver a iniciar sesión';
    submit.textContent = m === 'login' ? 'Entrar' : (m === 'forgot' ? 'Enviarme un correo' : 'Guardar contraseña');
    setMsg('');
  };
  gate.querySelector('[data-act="forgot"]').addEventListener('click', ()=> setMode(mode === 'login' ? 'forgot' : 'login'));

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    submit.disabled = true;
    try{
      if(mode === 'login'){
        const { error } = await sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
        if(error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
      } else if(mode === 'forgot'){
        const { error } = await sb.auth.resetPasswordForEmail(form.email.value.trim(), { redirectTo: location.href.split('#')[0] });
        if(error) throw error;
        setMsg('Listo: revisa tu correo y abre el enlace para elegir una nueva contraseña.');
      } else {
        const { error } = await sb.auth.updateUser({ password: form.newPassword.value });
        if(error) throw error;
        const session = (await sb.auth.getSession()).data.session;
        lastUser = session && session.user.id; // evita que USER_UPDATED vuelva a cargar todo
        setMode('login');
        hide();
        opts.onReady && opts.onReady(session);
      }
    }catch(err){
      setMsg(err.message || String(err), true);
    }finally{
      submit.disabled = false;
    }
  });

  const show = ()=>{ gate.style.display = 'flex'; };
  const hide = ()=>{ gate.style.display = 'none'; form.password.value = ''; };
  let lastUser = null;
  sb.auth.onAuthStateChange((event, session)=>{
    if(event === 'PASSWORD_RECOVERY'){ show(); setMode('recovery'); return; }
    if(mode === 'recovery') return;
    if(session){
      hide();
      // TOKEN_REFRESHED tambien trae sesion: solo recargar si cambio la persona
      if(session.user.id !== lastUser){ lastUser = session.user.id; setTimeout(()=> opts.onReady && opts.onReady(session), 0); }
    } else {
      lastUser = null;
      show();
      opts.onSignedOut && opts.onSignedOut();
    }
  });
  return { show, hide, setMsg };
}

async function signOut(){ await sb.auth.signOut(); }
