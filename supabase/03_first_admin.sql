-- Correr UNA vez, despues de crear tu propia cuenta en Authentication > Users.
-- Cambia el correo por el de tu cuenta. A partir de ahi, los demas admins se
-- nombran desde la pagina del Survivor (pestana Jugadores > Cuentas).
update public.profiles set is_admin = true where email = 'TU-CORREO@ejemplo.com';

select email, is_admin from public.profiles;
