-- Compartir rutina / perfil en el chat (migraciones share_routine_in_chat + share_profile_in_chat).
--
-- Ya se podía compartir un Rep (shared_post_id) y una publicación de gimnasio (shared_gym_post_id)
-- en el chat, y el link público de una rutina existía aparte (routines.is_shareable / share_token
-- + get_shared_routine + showExc.html?token=). Esto suma, con el mismo modal genérico
-- (src/lib/shareToChatsModal.ts): compartir una rutina y un perfil a un chat (grupo o 1 a 1),
-- como tarjeta, además de publicarlos como Rep o copiar el link.

-- 1) messages: dos columnas nuevas, misma mecánica que shared_post_id / shared_gym_post_id.
alter table public.messages
  add column if not exists shared_routine_id uuid references public.routines(id) on delete set null,
  add column if not exists shared_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists messages_shared_routine_idx on public.messages(shared_routine_id) where shared_routine_id is not null;
create index if not exists messages_shared_profile_idx on public.messages(shared_profile_id) where shared_profile_id is not null;

-- El check no contemplaba shared_gym_post_id (un share de publicación sin texto habría fallado)
-- ni ahora la rutina / el perfil.
alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content check (
  content is not null
  or attachment_path is not null
  or shared_post_id is not null
  or shared_gym_post_id is not null
  or shared_routine_id is not null
  or shared_profile_id is not null
);

-- 2) send_message: overload de 13 args (agrega p_shared_routine_id + p_shared_profile_id al
-- final). El cliente (chat.service.ts) manda SIEMPRE las 13 claves -- p_view_once,
-- p_shared_routine_id y p_shared_profile_id nunca undefined -- para que PostgREST resuelva sin
-- ambigüedad a esta versión (hay overloads viejos de 10/11/12 args que no se pueden dropear).
create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text default null,
  p_attachment_path text default null,
  p_attachment_type text default null,
  p_attachment_duration_seconds integer default null,
  p_shared_post_id uuid default null,
  p_reply_to_message_id uuid default null,
  p_is_forwarded boolean default false,
  p_attachment_filename text default null,
  p_shared_gym_post_id uuid default null,
  p_view_once boolean default false,
  p_shared_routine_id uuid default null,
  p_shared_profile_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_conv public.conversations;
  v_other uuid;
  v_block_status text;
  v_msg public.messages;
  v_preview text;
  v_view_once boolean;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(trim(p_content), '') = '' and p_attachment_path is null and p_shared_post_id is null
     and p_shared_gym_post_id is null and p_shared_routine_id is null and p_shared_profile_id is null then
    raise exception 'El mensaje esta vacio';
  end if;
  if p_shared_post_id is not null and not exists (
    select 1 from public.posts p where p.id = p_shared_post_id and public.is_profile_public(p.author_id)
  ) then
    raise exception 'No podes compartir este Rep';
  end if;
  if p_shared_gym_post_id is not null and not exists (
    select 1 from public.gym_posts gp where gp.id = p_shared_gym_post_id and public.can_view_gym_post(gp.gym_id, gp.visibility)
  ) then
    raise exception 'No podes compartir esta publicación';
  end if;
  if p_shared_routine_id is not null and not exists (
    select 1 from public.routines r where r.id = p_shared_routine_id and r.is_shareable = true
  ) then
    raise exception 'No podes compartir esta rutina';
  end if;
  if p_shared_profile_id is not null and not exists (
    select 1 from public.profiles p where p.id = p_shared_profile_id
  ) then
    raise exception 'No podes compartir este perfil';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if v_conv.id is null then
    raise exception 'Conversacion no encontrada';
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = v_me and left_at is null
  ) then
    raise exception 'No participas de esta conversacion';
  end if;

  if p_reply_to_message_id is not null and not exists (
    select 1 from public.messages m where m.id = p_reply_to_message_id and m.conversation_id = p_conversation_id
  ) then
    raise exception 'El mensaje al que respondes no existe';
  end if;

  if v_conv.kind = 'direct' then
    v_other := case when v_conv.user1_id = v_me then v_conv.user2_id else v_conv.user1_id end;
    select get_block_status(v_other) into v_block_status;
    if v_block_status <> 'none' then
      raise exception 'No podes enviarle mensajes a este usuario';
    end if;
  end if;

  v_view_once := coalesce(p_view_once, false) and p_attachment_type in ('image', 'video');

  insert into public.messages (
    conversation_id, sender_id, content, attachment_path, attachment_type, attachment_duration_seconds,
    shared_post_id, reply_to_message_id, is_forwarded, attachment_filename, shared_gym_post_id, view_once,
    shared_routine_id, shared_profile_id
  )
  values (
    p_conversation_id, v_me, nullif(trim(p_content), ''), p_attachment_path, p_attachment_type, p_attachment_duration_seconds,
    p_shared_post_id, p_reply_to_message_id, coalesce(p_is_forwarded, false), p_attachment_filename, p_shared_gym_post_id, v_view_once,
    p_shared_routine_id, p_shared_profile_id
  )
  returning * into v_msg;

  v_preview := case
    when p_attachment_type = 'image' and v_view_once then '📷 Foto efímera'
    when p_attachment_type = 'image' then '📷 Foto'
    when p_attachment_type = 'video' and v_view_once then '🎥 Video efímero'
    when p_attachment_type = 'video' then '🎥 Video'
    when p_attachment_type = 'document' then '📄 ' || coalesce(p_attachment_filename, 'Documento')
    when p_attachment_type = 'audio' then '🎤 Audio'
    when p_attachment_type = 'sticker' then coalesce(v_msg.content, '') || ' Sticker'
    when p_shared_post_id is not null then '🔁 Rep compartido'
    when p_shared_gym_post_id is not null then '📌 Publicación compartida'
    when p_shared_routine_id is not null then '🏋️ Rutina compartida'
    when p_shared_profile_id is not null then '👤 Perfil compartido'
    else v_msg.content
  end;

  update public.conversations
  set last_message_at = v_msg.created_at,
      last_message_preview = v_preview,
      last_message_type = coalesce(p_attachment_type, 'text'),
      last_message_sender_id = v_me,
      status = case when kind = 'direct' and status = 'pending' and initiator_id <> v_me then 'accepted' else status end
  where id = p_conversation_id;

  return v_msg;
end;
$function$;

-- 3) Preview batch de rutinas compartidas para el chat. RLS-safe: solo is_shareable = true.
-- (Los perfiles compartidos NO necesitan RPC: el cliente los hidrata con profiles_public /
-- getProfilesBasicByIds, que ya es legible para cualquier usuario autenticado.)
create or replace function public.get_shared_routines_by_ids(p_ids uuid[])
returns table (
  id uuid,
  nombre text,
  share_token uuid,
  owner_username text,
  owner_nombre text,
  owner_apellido text,
  weeks_count integer,
  days_count integer,
  exercises_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    r.id,
    r.nombre,
    r.share_token,
    p.username,
    p.nombre,
    p.apellido,
    (select count(*)::int from public.routine_weeks w where w.routine_id = r.id),
    (select count(*)::int
       from public.routine_days d
       join public.routine_weeks w on w.id = d.week_id
      where w.routine_id = r.id and w.numero = 1),
    (select count(*)::int
       from public.routine_exercises re
       join public.routine_days d on d.id = re.day_id
       join public.routine_weeks w on w.id = d.week_id
      where w.routine_id = r.id and w.numero = 1)
  from public.routines r
  join public.profiles p on p.id = r.user_id
  where r.id = any(p_ids) and r.is_shareable = true;
$function$;

grant execute on function public.get_shared_routines_by_ids(uuid[]) to authenticated;
