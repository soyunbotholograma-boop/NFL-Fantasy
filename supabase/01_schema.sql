-- =====================================================================
--  Ramirez y Amigos · Survivor + Pick'em
--  Correr completo en Supabase > SQL Editor (se puede volver a correr).
--  Orden: 01_schema.sql -> 02_games_seed.sql -> 03_first_admin.sql
-- =====================================================================

-- ---------- Tablas ----------

-- Una fila por cuenta de Supabase Auth (se crea sola al dar de alta al usuario)
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Jugadores de la liga. user_id liga al jugador con su cuenta (lo asigna el admin)
create table if not exists public.players (
  id             text primary key,
  name           text not null,
  starting_lives int  not null default 3 check (starting_lives >= 0),
  row_color      text check (row_color is null or row_color ~* '^#[0-9a-f]{6}$'),
  sort_order     int  not null default 0,
  user_id        uuid unique references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Ajustes generales (una sola fila, id = 1)
create table if not exists public.settings (
  id   int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb
);
insert into public.settings (id, data)
values (1, '{"startingLivesDefault":3,"maxAgainst":5,"missedPickCostsLife":false,"showLogos":false,"tieMargin":6}')
on conflict (id) do nothing;

-- Imagenes (escudos 'team:BAL', 'leagueLogo', 'tableWatermark', 'survivorRibbon')
create table if not exists public.assets (
  key   text primary key,
  value jsonb
);

-- Calendario + marcadores
create table if not exists public.games (
  id         bigint generated always as identity primary key,
  week       text not null,
  away       text not null,
  home       text not null,
  kickoff    timestamptz,
  away_score int,
  home_score int,
  unique (week, away, home)
);
create index if not exists games_week_idx on public.games (week);

-- Survivor: un equipo por jugador por semana
create table if not exists public.survivor_picks (
  player_id  text not null references public.players(id) on delete cascade,
  week       text not null,
  team       text not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, week)
);

-- Pick'em: por partido, visitante / cerrado (diferencia < tieMargin) / local
create table if not exists public.pickem_picks (
  player_id  text   not null references public.players(id) on delete cascade,
  game_id    bigint not null references public.games(id) on delete cascade,
  choice     text   not null check (choice in ('away','tie','home')),
  updated_at timestamptz not null default now(),
  primary key (player_id, game_id)
);

-- Lo que ven los jugadores: una foto de las tablas cada vez que el admin publica
create table if not exists public.publications (
  id           bigint generated always as identity primary key,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  through_week text not null,
  snapshot     jsonb not null
);

-- ---------- Funciones auxiliares ----------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false);
$$;

create or replace function public.my_player_id() returns text
language sql stable security definer set search_path = public as $$
  select id from public.players where user_id = auth.uid();
$$;

-- Crear perfil automaticamente al dar de alta una cuenta
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
  for each row execute function public.handle_new_user();
-- Cuentas que ya existian antes de correr este script
insert into public.profiles (user_id, email) select id, email from auth.users on conflict (user_id) do nothing;

-- Un admin no puede quitarse el admin a si mismo (para no quedarse sin ninguno)
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.user_id = auth.uid() and old.is_admin and not new.is_admin then
    raise exception 'No puedes quitarte el admin a ti mismo.';
  end if;
  -- Desde la pagina solo se cambia is_admin; el correo lo sincroniza handle_new_user
  if auth.uid() is not null then new.email := old.email; end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- Reglas del survivor (se aplican a jugadores; el admin puede corregir lo que sea) ----------
create or replace function public.survivor_pick_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_opp text; v_kick timestamptz; v_old_kick timestamptz; v_max int; v_cnt int;
begin
  if public.is_admin() then
    if tg_op <> 'DELETE' then new.updated_at := now(); end if;
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE','DELETE') then
    if old.player_id is distinct from public.my_player_id() then
      raise exception 'Ese pick no es tuyo.';
    end if;
    select kickoff into v_old_kick from public.games
      where week = old.week and (home = old.team or away = old.team);
    if v_old_kick is not null and v_old_kick <= now() then
      raise exception 'Tu pick de % ya está cerrado: el partido de % ya empezó.', old.week, old.team;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    if new.week <> old.week or new.player_id <> old.player_id then
      raise exception 'No se puede mover un pick a otra semana.';
    end if;
  end if;

  if new.player_id is distinct from public.my_player_id() then
    raise exception 'Solo puedes elegir por tu propio jugador.';
  end if;

  select case when home = new.team then away else home end, kickoff
    into v_opp, v_kick
    from public.games where week = new.week and (home = new.team or away = new.team);
  if not found then
    raise exception '% no juega en %.', new.team, new.week;
  end if;
  if v_kick is not null and v_kick <= now() then
    raise exception 'El partido de % ya empezó.', new.team;
  end if;

  if exists (select 1 from public.survivor_picks
             where player_id = new.player_id and team = new.team and week <> new.week) then
    raise exception 'Ya usaste a % en otra semana.', new.team;
  end if;

  select coalesce((data->>'maxAgainst')::int, 5) into v_max from public.settings where id = 1;
  select count(*) into v_cnt
    from public.survivor_picks p
    join public.games g on g.week = p.week and (g.home = p.team or g.away = p.team)
   where p.player_id = new.player_id and p.week <> new.week
     and (case when g.home = p.team then g.away else g.home end) = v_opp;
  if v_cnt >= coalesce(v_max, 5) then
    raise exception 'Ya elegiste % veces contra % (tope %).', v_cnt, v_opp, v_max;
  end if;

  new.updated_at := now();
  return new;
end $$;
drop trigger if exists survivor_pick_guard on public.survivor_picks;
create trigger survivor_pick_guard before insert or update or delete on public.survivor_picks
  for each row execute function public.survivor_pick_guard();

-- ---------- Reglas del pick'em ----------
create or replace function public.pickem_pick_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kick timestamptz;
begin
  if public.is_admin() then
    if tg_op <> 'DELETE' then new.updated_at := now(); end if;
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE','DELETE') then
    if old.player_id is distinct from public.my_player_id() then raise exception 'Ese pick no es tuyo.'; end if;
    select kickoff into v_kick from public.games where id = old.game_id;
    if v_kick is not null and v_kick <= now() then raise exception 'Ese partido ya empezó.'; end if;
    if tg_op = 'DELETE' then return old; end if;
    if new.game_id <> old.game_id or new.player_id <> old.player_id then raise exception 'Cambio no permitido.'; end if;
  end if;
  if new.player_id is distinct from public.my_player_id() then raise exception 'Solo puedes elegir por tu propio jugador.'; end if;
  select kickoff into v_kick from public.games where id = new.game_id;
  if not found then raise exception 'Ese partido no existe.'; end if;
  if v_kick is not null and v_kick <= now() then raise exception 'Ese partido ya empezó.'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists pickem_pick_guard on public.pickem_picks;
create trigger pickem_pick_guard before insert or update or delete on public.pickem_picks
  for each row execute function public.pickem_pick_guard();

-- ---------- Row Level Security ----------
alter table public.profiles       enable row level security;
alter table public.players        enable row level security;
alter table public.settings       enable row level security;
alter table public.assets         enable row level security;
alter table public.games          enable row level security;
alter table public.survivor_picks enable row level security;
alter table public.pickem_picks   enable row level security;
alter table public.publications   enable row level security;

do $$
declare r record;
begin
  -- Borra politicas previas para que el script se pueda volver a correr
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
           and tablename in ('profiles','players','settings','assets','games','survivor_picks','pickem_picks','publications')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles: cada quien ve el suyo; el admin ve y edita todos
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Lectura para cualquier jugador con sesion; escritura solo admin
create policy players_select  on public.players  for select to authenticated using (true);
create policy players_write   on public.players  for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_select on public.settings for select to authenticated using (true);
create policy settings_write  on public.settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy assets_select   on public.assets   for select to authenticated using (true);
create policy assets_write    on public.assets   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy games_select    on public.games    for select to authenticated using (true);
create policy games_write     on public.games    for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Picks: cada jugador solo ve y toca los suyos; el admin ve todos (en vivo)
create policy survivor_select on public.survivor_picks for select to authenticated
  using (player_id = public.my_player_id() or public.is_admin());
create policy survivor_insert on public.survivor_picks for insert to authenticated
  with check (player_id = public.my_player_id() or public.is_admin());
create policy survivor_update on public.survivor_picks for update to authenticated
  using (player_id = public.my_player_id() or public.is_admin())
  with check (player_id = public.my_player_id() or public.is_admin());
create policy survivor_delete on public.survivor_picks for delete to authenticated
  using (player_id = public.my_player_id() or public.is_admin());

create policy pickem_select on public.pickem_picks for select to authenticated
  using (player_id = public.my_player_id() or public.is_admin());
create policy pickem_insert on public.pickem_picks for insert to authenticated
  with check (player_id = public.my_player_id() or public.is_admin());
create policy pickem_update on public.pickem_picks for update to authenticated
  using (player_id = public.my_player_id() or public.is_admin())
  with check (player_id = public.my_player_id() or public.is_admin());
create policy pickem_delete on public.pickem_picks for delete to authenticated
  using (player_id = public.my_player_id() or public.is_admin());

-- Publicaciones: todos leen; solo el admin publica
create policy publications_select on public.publications for select to authenticated using (true);
create policy publications_insert on public.publications for insert to authenticated with check (public.is_admin());
create policy publications_delete on public.publications for delete to authenticated using (public.is_admin());

-- ---------- Realtime (el admin ve llegar los picks en vivo) ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'survivor_picks') then
    alter publication supabase_realtime add table public.survivor_picks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pickem_picks') then
    alter publication supabase_realtime add table public.pickem_picks;
  end if;
  -- El portal de cada jugador se actualiza solo cuando el admin publica
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'publications') then
    alter publication supabase_realtime add table public.publications;
  end if;
end $$;
