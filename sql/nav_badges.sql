-- ============================================================================
-- get_nav_badges: un solo round-trip para todo lo que el header/nav necesita al
-- arrancar (identidad del usuario + todos los contadores de badges).
-- ============================================================================
-- Antes el nav disparaba, en cada cold start, entre 5 (usuario normal) y 9
-- (staff) requests sueltas EN PARALELO -- perfil, notificaciones sin leer,
-- mensajes sin leer, solicitudes de follow/suscripción/socio/handle pendientes,
-- zoom_enabled, y (staff) contadores de reportes/validaciones. Cada una ~300-400ms
-- en mobile, saturando el pool de ~6 conexiones del navegador. Esto las junta en
-- una. Los polls de 60s y las suscripciones realtime de cada feature NO cambian:
-- esto solo reemplaza el fetch inicial (ver src/lib/nav.ts populateUserMenuTrigger).
-- Aplicado como migración get_nav_badges_rpc.

create or replace function public.get_nav_badges()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      username,
      avatar_url,
      user_type,
      coalesce(is_verified, false) as is_verified,
      coalesce(zoom_enabled, false) as zoom_enabled
    from public.profiles where id = auth.uid()
  )
  select jsonb_build_object(
    'username', (select username from me),
    'avatar_url', (select avatar_url from me),
    'user_type', (select user_type from me),
    'is_verified', (select is_verified from me),
    'zoom_enabled', (select zoom_enabled from me),
    'notifications', (select count(*)::int from public.notifications where user_id = auth.uid() and is_read = false),
    'messages', public.get_unread_conversation_count(),
    'follow_requests', (select count(*)::int from public.follows where followed_id = auth.uid() and status = 'pending'),
    'subscription_requests', case when (select user_type from me) = 'entrenador'
      then (select count(*)::int from public.subscriptions where trainer_id = auth.uid() and status = 'pending')
      else 0 end,
    'socio_requests', case when (select user_type from me) = 'gimnasio'
      then (select count(*)::int from public.gym_members where gym_id = auth.uid() and status = 'pending')
      else 0 end,
    'handle_requests', case when (select user_type from me) = 'gimnasio'
      then (select count(*)::int from public.gym_trainers where gym_id = auth.uid() and status = 'pending' and initiated_by = 'trainer')
      else 0 end,
    'admin_dot', case when public.is_staff() then (
      (select count(*) from public.contact_messages where is_read = false)
      + (select count(*) from public.error_reports where is_read = false)
      + (select count(*) from public.user_reports where is_read = false)
      + (select count(*) from public.verification_requests where status = 'pending')
    ) > 0 else false end
  );
$$;

grant execute on function public.get_nav_badges() to authenticated;
