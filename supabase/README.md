# Configuración de Supabase (una sola vez)

Proyecto: `https://oxlzedwhicfixqeacjql.supabase.co` · la llave *publishable* ya está en `js/supa.js`
(es pública a propósito; la seguridad la ponen las reglas RLS de `01_schema.sql`).
**Nunca** pongas la llave `service_role` ni la contraseña de la base en estos archivos.

## 1. Autenticación
Supabase → **Authentication → Sign In / Providers**
- Email: activado. **Allow new users to sign up: desactivado** (solo entran las cuentas que tú crees).

Supabase → **Authentication → URL Configuration**
- *Site URL*: la dirección de GitHub Pages (p. ej. `https://soyunbotholograma-boop.github.io/NFL-Fantasy/`).
- *Redirect URLs*: la misma dirección con `/**` al final (para "¿Olvidaste tu contraseña?").

## 2. Base de datos
Supabase → **SQL Editor** → pega y corre, en este orden:
1. `01_schema.sql`: tablas, reglas (RLS), validaciones de picks y Realtime.
2. `02_games_seed.sql`: los 272 partidos de 2026 con horario (UTC) y los marcadores que ya trae el CSV.

Los dos se pueden volver a correr sin perder datos.

## 3. Tu cuenta de admin
1. **Authentication → Users → Add user → Create new user**: tu correo + contraseña, con *Auto Confirm User*.
2. Abre `03_first_admin.sql`, cambia el correo por el tuyo y córrelo en el SQL Editor.

## 4. Pasar los datos actuales
1. Abre `survivor-league_new.html` y entra con tu cuenta.
2. Pestaña **Jugadores → Importar datos (JSON)** → elige `supabase/legacy-survivor-state.json`.
   Sube jugadores, picks del survivor y escudos. Los resultados salen de los marcadores (pestaña **Resultados**).

## 5. Cuentas de los jugadores
1. Por cada jugador: **Authentication → Users → Add user** (correo + contraseña temporal, *Auto Confirm*).
2. En `survivor-league_new.html` → **Jugadores → Cuentas**: liga cada correo con su jugador.
3. Mándales el enlace a `portal.html` con su contraseña. Pueden cambiarla con "¿Olvidaste tu contraseña?".
   El correo integrado de Supabase manda pocos correos por hora; si se atora, cambia la contraseña tú
   desde Authentication → Users.

## Cómo funciona cada semana
- Los jugadores eligen en **Mi Portal** (survivor + pick'em). Cada pick se cierra al empezar su partido;
  la base de datos lo rechaza aunque alguien intente saltarse la página.
- Tú ves los picks llegar en vivo en el Survivor (punto verde = conectado).
- Capturas marcadores en **Resultados** (o subes el CSV con la columna *Result*).
- Presionas **Publicar** (hasta la semana que elijas) y en ese momento todos ven las tablas nuevas.
