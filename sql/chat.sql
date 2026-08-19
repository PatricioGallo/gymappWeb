-- ============================================================================
-- Chat estilo Instagram (mensajes directos 1 a 1) para Gym Social
-- ============================================================================
-- Correr esto una sola vez en el SQL Editor de Supabase (proyecto nxyxuthkhvzticqwtaar).
-- Asume que ya existen: public.profiles, public.profiles_public, public.follows,
-- public.user_blocks, la función public.get_block_status(uuid) y el bucket "avatars".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references public.profiles(id) on delete cascade,
  user2_id uuid not null references public.profiles(id) on delete cascade,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_message_type text check (last_message_type in ('text', 'image', 'audio', 'sticker')),
  last_message_sender_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  pinned_message_id uuid,
  constraint conversations_distinct_users check (user1_id <> user2_id),
  constraint conversations_user_order check (user1_id < user2_id),
  constraint conversations_unique_pair unique (user1_id, user2_id)
);

create index conversations_user1_idx on public.conversations(user1_id);
create index conversations_user2_idx on public.conversations(user2_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  attachment_path text,
  attachment_type text check (attachment_type in ('image', 'audio', 'sticker')),
  attachment_duration_seconds integer,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  shared_post_id uuid references public.posts(id) on delete set null,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  is_forwarded boolean not null default false,
  constraint messages_has_content check (content is not null or attachment_path is not null or shared_post_id is not null)
);

create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index messages_unread_idx on public.messages(conversation_id, sender_id) where read_at is null;
create index messages_reply_to_idx on public.messages(reply_to_message_id) where reply_to_message_id is not null;

-- pinned_message_id de conversations referencia messages, que recien se acaba de crear.
alter table public.conversations
  add constraint conversations_pinned_message_fkey foreign key (pinned_message_id) references public.messages(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Sin policies de insert/update: toda escritura pasa por los RPCs de abajo
-- (SECURITY DEFINER), para poder chequear bloqueos y aplicar el auto-accept
-- de solicitudes de forma atomica.

create policy conversations_select on public.conversations
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);

create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

-- Devuelve (creando si hace falta) el id de la conversacion 1 a 1 con
-- p_other_user_id. Si el otro ya me sigue (aceptado), la conversacion nace
-- 'accepted'; si no, nace 'pending' (solicitud de mensaje, como Instagram).
create or replace function public.get_or_create_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_u1 uuid;
  v_u2 uuid;
  v_id uuid;
  v_block_status text;
  v_initial_status text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if p_other_user_id = v_me then
    raise exception 'No podés iniciar una conversación con vos mismo';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'Usuario no encontrado';
  end if;

  select get_block_status(p_other_user_id) into v_block_status;
  if v_block_status <> 'none' then
    raise exception 'No podés enviarle mensajes a este usuario';
  end if;

  v_u1 := least(v_me, p_other_user_id);
  v_u2 := greatest(v_me, p_other_user_id);

  select id into v_id from public.conversations where user1_id = v_u1 and user2_id = v_u2;
  if v_id is not null then
    return v_id;
  end if;

  v_initial_status := case
    when exists (
      select 1 from public.follows
      where follower_id = p_other_user_id and followed_id = v_me and status = 'accepted'
    ) then 'accepted'
    else 'pending'
  end;

  insert into public.conversations (user1_id, user2_id, initiator_id, status)
  values (v_u1, v_u2, v_me, v_initial_status)
  on conflict (user1_id, user2_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.conversations where user1_id = v_u1 and user2_id = v_u2;
  end if;

  return v_id;
end;
$$;

-- Inserta un mensaje (texto, adjunto y/o Rep compartido; opcionalmente respondiendo
-- a otro o marcado como reenviado), bumpea la conversacion y, si quien responde es
-- el destinatario de una solicitud pendiente, la auto-acepta.
create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text default null,
  p_attachment_path text default null,
  p_attachment_type text default null,
  p_attachment_duration_seconds integer default null,
  p_shared_post_id uuid default null,
  p_reply_to_message_id uuid default null,
  p_is_forwarded boolean default false
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conv public.conversations;
  v_other uuid;
  v_block_status text;
  v_msg public.messages;
  v_preview text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(trim(p_content), '') = '' and p_attachment_path is null and p_shared_post_id is null then
    raise exception 'El mensaje está vacío';
  end if;
  if p_shared_post_id is not null and not exists (
    select 1 from public.posts p where p.id = p_shared_post_id and public.is_profile_public(p.author_id)
  ) then
    raise exception 'No podés compartir este Rep';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if v_conv.id is null then
    raise exception 'Conversación no encontrada';
  end if;
  if v_me <> v_conv.user1_id and v_me <> v_conv.user2_id then
    raise exception 'No participás de esta conversación';
  end if;

  if p_reply_to_message_id is not null and not exists (
    select 1 from public.messages m where m.id = p_reply_to_message_id and m.conversation_id = p_conversation_id
  ) then
    raise exception 'El mensaje al que respondés no existe';
  end if;

  v_other := case when v_conv.user1_id = v_me then v_conv.user2_id else v_conv.user1_id end;
  select get_block_status(v_other) into v_block_status;
  if v_block_status <> 'none' then
    raise exception 'No podés enviarle mensajes a este usuario';
  end if;

  insert into public.messages (conversation_id, sender_id, content, attachment_path, attachment_type, attachment_duration_seconds, shared_post_id, reply_to_message_id, is_forwarded)
  values (p_conversation_id, v_me, nullif(trim(p_content), ''), p_attachment_path, p_attachment_type, p_attachment_duration_seconds, p_shared_post_id, p_reply_to_message_id, coalesce(p_is_forwarded, false))
  returning * into v_msg;

  v_preview := case
    when p_attachment_type = 'image' then '📷 Foto'
    when p_attachment_type = 'audio' then '🎤 Audio'
    when p_attachment_type = 'sticker' then coalesce(v_msg.content, '') || ' Sticker'
    when p_shared_post_id is not null then '🔁 Rep compartido'
    else v_msg.content
  end;

  update public.conversations
  set last_message_at = v_msg.created_at,
      last_message_preview = v_preview,
      last_message_type = coalesce(p_attachment_type, 'text'),
      last_message_sender_id = v_me,
      status = case when status = 'pending' and initiator_id <> v_me then 'accepted' else status end
  where id = p_conversation_id;

  return v_msg;
end;
$$;

-- Ancla/desancla un mensaje de la conversacion (uno solo a la vez, visible para ambos).
create or replace function public.pin_message(p_conversation_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  update public.conversations
  set pinned_message_id = p_message_id
  where id = p_conversation_id
    and (user1_id = v_me or user2_id = v_me)
    and exists (select 1 from public.messages m where m.id = p_message_id and m.conversation_id = p_conversation_id);

  if not found then
    raise exception 'No se pudo anclar el mensaje';
  end if;
end;
$$;

create or replace function public.unpin_message(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  update public.conversations
  set pinned_message_id = null
  where id = p_conversation_id
    and (user1_id = v_me or user2_id = v_me);

  if not found then
    raise exception 'No se pudo desanclar el mensaje';
  end if;
end;
$$;

-- Acepta una solicitud de mensaje pendiente (solo el destinatario, no quien la inició).
create or replace function public.accept_message_request(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  update public.conversations
  set status = 'accepted'
  where id = p_conversation_id
    and status = 'pending'
    and initiator_id <> v_me
    and (user1_id = v_me or user2_id = v_me);

  if not found then
    raise exception 'No se pudo aceptar la solicitud';
  end if;
end;
$$;

-- Rechaza (borra) una solicitud de mensaje pendiente.
create or replace function public.decline_message_request(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  delete from public.conversations
  where id = p_conversation_id
    and status = 'pending'
    and initiator_id <> v_me
    and (user1_id = v_me or user2_id = v_me);

  if not found then
    raise exception 'No se pudo rechazar la solicitud';
  end if;
end;
$$;

-- Marca como leidos los mensajes del otro participante en una conversacion.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> v_me
    and read_at is null
    and exists (
      select 1 from public.conversations c
      where c.id = p_conversation_id and (c.user1_id = v_me or c.user2_id = v_me)
    );
end;
$$;

-- Lista las conversaciones del usuario actual con el perfil del otro participante
-- ya resuelto y el estado de lectura/no-leidos calculado.
create or replace function public.list_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_nombre text,
  other_apellido text,
  other_avatar_url text,
  other_user_type public.user_type,
  other_is_verified boolean,
  status text,
  is_initiator boolean,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_type text,
  last_message_sender_is_me boolean,
  last_message_read boolean,
  unread_count integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id as conversation_id,
    p.id as other_user_id,
    p.username as other_username,
    p.nombre as other_nombre,
    p.apellido as other_apellido,
    p.avatar_url as other_avatar_url,
    p.user_type as other_user_type,
    coalesce(p.is_verified, false) as other_is_verified,
    c.status,
    (c.initiator_id = auth.uid()) as is_initiator,
    c.last_message_at,
    c.last_message_preview,
    c.last_message_type,
    (c.last_message_sender_id = auth.uid()) as last_message_sender_is_me,
    (
      select m.read_at is not null
      from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) as last_message_read,
    (
      select count(*)::int from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.read_at is null
    ) as unread_count
  from public.conversations c
  join public.profiles_public p on p.id = (case when c.user1_id = auth.uid() then c.user2_id else c.user1_id end)
  where c.user1_id = auth.uid() or c.user2_id = auth.uid()
  order by c.last_message_at desc;
$$;

-- Numero para el badge del header: conversaciones aceptadas con mensajes sin
-- leer + solicitudes de mensaje pendientes recibidas.
create or replace function public.get_unread_conversation_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select
    (
      select count(distinct m.conversation_id)::int
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where c.status = 'accepted'
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
        and m.sender_id <> auth.uid()
        and m.read_at is null
    )
    +
    (
      select count(*)::int
      from public.conversations c
      where c.status = 'pending'
        and c.initiator_id <> auth.uid()
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    );
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, text, text, integer, uuid, uuid, boolean) to authenticated;
grant execute on function public.accept_message_request(uuid) to authenticated;
grant execute on function public.decline_message_request(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.list_conversations() to authenticated;
grant execute on function public.get_unread_conversation_count() to authenticated;
grant execute on function public.pin_message(uuid, uuid) to authenticated;
grant execute on function public.unpin_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage: bucket privado para fotos/audios del chat
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 20971520)
on conflict (id) do nothing;

create policy chat_attachments_select on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id = ((storage.foldername(name))[1])::uuid
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

create policy chat_attachments_insert on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id = ((storage.foldername(name))[1])::uuid
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4b. Stickers propios: coleccion personal (como el creador de stickers de
-- WhatsApp), reutilizable en cualquier chat -- no van organizados por
-- conversacion como las fotos, sino guardados por dueno.
-- ---------------------------------------------------------------------------

create table public.user_stickers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index user_stickers_owner_idx on public.user_stickers(owner_id, created_at desc);

alter table public.user_stickers enable row level security;

-- Solo el dueno gestiona (ve/agrega/borra) su propia coleccion. Quien RECIBE un
-- sticker en un chat no necesita leer esta tabla -- solo necesita poder cargar
-- el archivo (ver policy de storage abajo), la fila de messages ya le llega
-- con el path via realtime/select.
create policy user_stickers_select on public.user_stickers
  for select using (owner_id = auth.uid());

create policy user_stickers_insert on public.user_stickers
  for insert with check (owner_id = auth.uid());

create policy user_stickers_delete on public.user_stickers
  for delete using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-stickers', 'chat-stickers', false, 20971520)
on conflict (id) do nothing;

-- El dueno gestiona los suyos (carpeta = su propio user id). Ademas, cualquiera
-- que participe de una conversacion con un mensaje que referencie ese path
-- puede verlo -- asi el que RECIBE el sticker en el chat tambien puede
-- cargarlo, no solo quien lo subio.
create policy chat_stickers_select on storage.objects
  for select using (
    bucket_id = 'chat-stickers'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.messages m
        join public.conversations c on c.id = m.conversation_id
        where m.attachment_path = name
          and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
      )
    )
  );

create policy chat_stickers_insert on storage.objects
  for insert with check (
    bucket_id = 'chat-stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy chat_stickers_delete on storage.objects
  for delete using (
    bucket_id = 'chat-stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------------
-- 6. Reacciones (emoji) a mensajes, estilo WhatsApp: un emoji por usuario por
-- mensaje (tocar el mismo emoji lo saca, tocar otro lo reemplaza). Se guarda
-- como jsonb en la propia fila del mensaje (mapa emoji -> array de user_id)
-- para que viaje gratis por el mismo UPDATE realtime + cache de IndexedDB que
-- ya usan los mensajes, sin necesitar tabla ni canal nuevos.
-- ---------------------------------------------------------------------------

alter table public.messages add column if not exists reactions jsonb not null default '{}'::jsonb;

create or replace function public.react_to_message(p_message_id uuid, p_emoji text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_msg public.messages;
  v_reactions jsonb;
  v_new_reactions jsonb := '{}'::jsonb;
  v_had_this_emoji boolean := false;
  v_row record;
  v_users jsonb;
  v_notify boolean;
  v_reactor_username text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(trim(p_emoji), '') = '' or char_length(p_emoji) > 16 then
    raise exception 'Emoji inválido';
  end if;

  select * into v_msg from public.messages where id = p_message_id for update;
  if v_msg.id is null then
    raise exception 'Mensaje no encontrado';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = v_msg.conversation_id and (c.user1_id = v_me or c.user2_id = v_me)
  ) then
    raise exception 'No participás de esta conversación';
  end if;

  v_reactions := coalesce(v_msg.reactions, '{}'::jsonb);

  for v_row in select * from jsonb_each(v_reactions)
  loop
    if v_row.key = p_emoji and v_row.value ? v_me::text then
      v_had_this_emoji := true;
    end if;
    v_users := (
      select coalesce(jsonb_agg(u), '[]'::jsonb)
      from jsonb_array_elements_text(v_row.value) u
      where u <> v_me::text
    );
    if jsonb_array_length(v_users) > 0 then
      v_new_reactions := v_new_reactions || jsonb_build_object(v_row.key, v_users);
    end if;
  end loop;

  if not v_had_this_emoji then
    v_new_reactions := v_new_reactions ||
      jsonb_build_object(p_emoji, coalesce(v_new_reactions -> p_emoji, '[]'::jsonb) || to_jsonb(v_me::text));
  end if;

  update public.messages set reactions = v_new_reactions where id = p_message_id returning * into v_msg;

  -- Notifica solo cuando se agrega una reacción nueva (no al sacarla) y no es a tu propio
  -- mensaje. Mismo sistema que like/comment/repost: tabla notifications + notification_prefs
  -- (clave 'reactions', default habilitada si no está seteada).
  if not v_had_this_emoji and v_msg.sender_id <> v_me then
    select coalesce((notification_prefs ->> 'reactions')::boolean, true) into v_notify
      from public.profiles where id = v_msg.sender_id;
    if coalesce(v_notify, true) then
      select username into v_reactor_username from public.profiles where id = v_me;
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_msg.sender_id, 'message_reaction', 'Nueva reacción',
        coalesce(v_reactor_username, 'Alguien') || ' reaccionó ' || p_emoji || ' a tu mensaje',
        'chats.html?c=' || v_msg.conversation_id
      );
    end if;
  end if;

  return v_msg;
end;
$$;

grant execute on function public.react_to_message(uuid, text) to authenticated;

-- ============================================================================
-- NOTA: este archivo quedó desactualizado respecto a la base real entre este
-- punto y la sección 7 de abajo -- migraciones intermedias aplicadas
-- directamente contra el proyecto remoto (nunca reflejadas acá) agregaron:
-- privacidad de "última vez"/confirmación de lectura (profiles.show_last_seen,
-- show_read_receipts + get_conversation_peer_meta), reply/forward/pin,
-- stickers propios (ya arriba), y adjuntos de video/documento
-- (messages.attachment_filename, attachment_type amplía a 'video'/'document').
-- La sección 7 sí está sincronizada con lo aplicado (migración
-- chat_group_conversations) y reescribe varias funciones de arriba, ya
-- incluyendo esos cambios intermedios.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 7. Chats grupales (3+ personas). conversation_participants pasa a ser la
-- fuente única de "quién ve/escribe esta conversación", para DMs y grupos por
-- igual -- reemplaza el chequeo user1_id/user2_id en RLS, storage y RPCs.
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column kind text not null default 'direct' check (kind in ('direct','group')),
  add column group_name text,
  add column group_avatar_url text;

alter table public.conversations alter column user1_id drop not null;
alter table public.conversations alter column user2_id drop not null;

alter table public.conversations drop constraint conversations_distinct_users;
alter table public.conversations drop constraint conversations_user_order;
alter table public.conversations drop constraint conversations_unique_pair;

alter table public.conversations add constraint conversations_direct_shape check (
  kind <> 'direct' or (user1_id is not null and user2_id is not null and user1_id < user2_id)
);
alter table public.conversations add constraint conversations_group_shape check (
  kind <> 'group' or (user1_id is null and user2_id is null and group_name is not null and length(trim(group_name)) > 0)
);

create unique index conversations_unique_direct_pair on public.conversations (user1_id, user2_id) where kind = 'direct';

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_participants_active_idx on public.conversation_participants(user_id) where left_at is null;

alter table public.conversation_participants enable row level security;

-- Sin insert/update/delete policies -- igual que conversations/messages, toda
-- escritura pasa por los RPCs de abajo (SECURITY DEFINER).
create policy conversation_participants_select on public.conversation_participants
  for select using (
    exists (
      select 1 from public.conversation_participants me
      where me.conversation_id = conversation_participants.conversation_id
        and me.user_id = auth.uid()
    )
  );

-- Backfill: una fila de participante por cada lado de cada DM existente al
-- momento de la migración. last_read_at se calcula del último mensaje del
-- otro que ya tenía read_at seteado, para no generar un pico falso de
-- "no leídos" apenas se aplica.
insert into public.conversation_participants (conversation_id, user_id, role, joined_at, last_read_at)
select
  c.id,
  u.user_id,
  'member',
  c.created_at,
  coalesce(
    (select max(m.created_at) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> u.user_id and m.read_at is not null),
    c.created_at
  )
from public.conversations c
cross join lateral (values (c.user1_id), (c.user2_id)) as u(user_id)
where c.kind = 'direct';

drop policy conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id and cp.user_id = auth.uid() and cp.left_at is null
    )
  );

drop policy messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid() and cp.left_at is null
    )
  );

drop policy chat_attachments_select on storage.objects;
drop policy chat_attachments_insert on storage.objects;

create policy chat_attachments_select on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = ((storage.foldername(name))[1])::uuid and cp.user_id = auth.uid() and cp.left_at is null
    )
  );

create policy chat_attachments_insert on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = ((storage.foldername(name))[1])::uuid and cp.user_id = auth.uid() and cp.left_at is null
    )
  );

drop policy chat_stickers_select on storage.objects;
create policy chat_stickers_select on storage.objects
  for select using (
    bucket_id = 'chat-stickers'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.messages m
        join public.conversation_participants cp on cp.conversation_id = m.conversation_id
        where m.attachment_path = name and cp.user_id = auth.uid() and cp.left_at is null
      )
    )
  );

-- Foto de grupo: reusa el bucket público "avatars" (mismo que profiles.avatar_url),
-- path groups/{conversation_id}/... -- público ya se lee vía getPublicUrl sin
-- necesitar policy de select (bucket public=true), solo hace falta
-- insert/update restringido a admins activos del grupo.
create policy group_avatars_insert on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = ((storage.foldername(name))[2])::uuid
        and cp.user_id = auth.uid() and cp.role = 'admin' and cp.left_at is null
    )
  );

create policy group_avatars_update on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = ((storage.foldername(name))[2])::uuid
        and cp.user_id = auth.uid() and cp.role = 'admin' and cp.left_at is null
    )
  );

alter publication supabase_realtime add table public.conversation_participants;

-- get_or_create_conversation: sin cambio de comportamiento, pero ahora además
-- deja las dos filas de conversation_participants (idempotente).
create or replace function public.get_or_create_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_u1 uuid;
  v_u2 uuid;
  v_id uuid;
  v_block_status text;
  v_initial_status text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if p_other_user_id = v_me then
    raise exception 'No podés iniciar una conversación con vos mismo';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'Usuario no encontrado';
  end if;

  select get_block_status(p_other_user_id) into v_block_status;
  if v_block_status <> 'none' then
    raise exception 'No podés enviarle mensajes a este usuario';
  end if;

  v_u1 := least(v_me, p_other_user_id);
  v_u2 := greatest(v_me, p_other_user_id);

  select id into v_id from public.conversations where user1_id = v_u1 and user2_id = v_u2 and kind = 'direct';
  if v_id is null then
    v_initial_status := case
      when exists (
        select 1 from public.follows
        where follower_id = p_other_user_id and followed_id = v_me and status = 'accepted'
      ) then 'accepted'
      else 'pending'
    end;

    insert into public.conversations (user1_id, user2_id, initiator_id, status, kind)
    values (v_u1, v_u2, v_me, v_initial_status, 'direct')
    on conflict (user1_id, user2_id) where kind = 'direct' do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.conversations where user1_id = v_u1 and user2_id = v_u2 and kind = 'direct';
    end if;
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_id, v_u1), (v_id, v_u2)
  on conflict (conversation_id, user_id) do nothing;

  return v_id;
end;
$$;

-- send_message: el chequeo de participación pasa a conversation_participants
-- (uniforme para 1 a 1 y grupo); el bloqueo solo aplica en directo.
create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text default null,
  p_attachment_path text default null,
  p_attachment_type text default null,
  p_attachment_duration_seconds integer default null,
  p_shared_post_id uuid default null,
  p_reply_to_message_id uuid default null,
  p_is_forwarded boolean default false,
  p_attachment_filename text default null
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conv public.conversations;
  v_other uuid;
  v_block_status text;
  v_msg public.messages;
  v_preview text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(trim(p_content), '') = '' and p_attachment_path is null and p_shared_post_id is null then
    raise exception 'El mensaje está vacío';
  end if;
  if p_shared_post_id is not null and not exists (
    select 1 from public.posts p where p.id = p_shared_post_id and public.is_profile_public(p.author_id)
  ) then
    raise exception 'No podés compartir este Rep';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if v_conv.id is null then
    raise exception 'Conversación no encontrada';
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = v_me and left_at is null
  ) then
    raise exception 'No participás de esta conversación';
  end if;

  if p_reply_to_message_id is not null and not exists (
    select 1 from public.messages m where m.id = p_reply_to_message_id and m.conversation_id = p_conversation_id
  ) then
    raise exception 'El mensaje al que respondés no existe';
  end if;

  if v_conv.kind = 'direct' then
    v_other := case when v_conv.user1_id = v_me then v_conv.user2_id else v_conv.user1_id end;
    select get_block_status(v_other) into v_block_status;
    if v_block_status <> 'none' then
      raise exception 'No podés enviarle mensajes a este usuario';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, content, attachment_path, attachment_type, attachment_duration_seconds, shared_post_id, reply_to_message_id, is_forwarded, attachment_filename)
  values (p_conversation_id, v_me, nullif(trim(p_content), ''), p_attachment_path, p_attachment_type, p_attachment_duration_seconds, p_shared_post_id, p_reply_to_message_id, coalesce(p_is_forwarded, false), p_attachment_filename)
  returning * into v_msg;

  v_preview := case
    when p_attachment_type = 'image' then '📷 Foto'
    when p_attachment_type = 'video' then '🎥 Video'
    when p_attachment_type = 'document' then '📄 ' || coalesce(p_attachment_filename, 'Documento')
    when p_attachment_type = 'audio' then '🎤 Audio'
    when p_attachment_type = 'sticker' then coalesce(v_msg.content, '') || ' Sticker'
    when p_shared_post_id is not null then '🔁 Rep compartido'
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
$$;

create or replace function public.pin_message(p_conversation_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  update public.conversations
  set pinned_message_id = p_message_id
  where id = p_conversation_id
    and exists (
      select 1 from public.conversation_participants
      where conversation_id = p_conversation_id and user_id = v_me and left_at is null
    )
    and exists (select 1 from public.messages m where m.id = p_message_id and m.conversation_id = p_conversation_id);

  if not found then
    raise exception 'No se pudo anclar el mensaje';
  end if;
end;
$$;

create or replace function public.unpin_message(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  update public.conversations
  set pinned_message_id = null
  where id = p_conversation_id
    and exists (
      select 1 from public.conversation_participants
      where conversation_id = p_conversation_id and user_id = v_me and left_at is null
    );

  if not found then
    raise exception 'No se pudo desanclar el mensaje';
  end if;
end;
$$;

create or replace function public.react_to_message(p_message_id uuid, p_emoji text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_msg public.messages;
  v_reactions jsonb;
  v_new_reactions jsonb := '{}'::jsonb;
  v_had_this_emoji boolean := false;
  v_row record;
  v_users jsonb;
  v_notify boolean;
  v_reactor_username text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(trim(p_emoji), '') = '' or char_length(p_emoji) > 16 then
    raise exception 'Emoji inválido';
  end if;

  select * into v_msg from public.messages where id = p_message_id for update;
  if v_msg.id is null then
    raise exception 'Mensaje no encontrado';
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = v_msg.conversation_id and user_id = v_me and left_at is null
  ) then
    raise exception 'No participás de esta conversación';
  end if;

  v_reactions := coalesce(v_msg.reactions, '{}'::jsonb);

  for v_row in select * from jsonb_each(v_reactions)
  loop
    if v_row.key = p_emoji and v_row.value ? v_me::text then
      v_had_this_emoji := true;
    end if;
    v_users := (
      select coalesce(jsonb_agg(u), '[]'::jsonb)
      from jsonb_array_elements_text(v_row.value) u
      where u <> v_me::text
    );
    if jsonb_array_length(v_users) > 0 then
      v_new_reactions := v_new_reactions || jsonb_build_object(v_row.key, v_users);
    end if;
  end loop;

  if not v_had_this_emoji then
    v_new_reactions := v_new_reactions ||
      jsonb_build_object(p_emoji, coalesce(v_new_reactions -> p_emoji, '[]'::jsonb) || to_jsonb(v_me::text));
  end if;

  update public.messages set reactions = v_new_reactions where id = p_message_id returning * into v_msg;

  if not v_had_this_emoji and v_msg.sender_id <> v_me then
    select coalesce((notification_prefs ->> 'reactions')::boolean, true) into v_notify
      from public.profiles where id = v_msg.sender_id;
    if coalesce(v_notify, true) then
      select username into v_reactor_username from public.profiles where id = v_me;
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_msg.sender_id, 'message_reaction', 'Nueva reacción',
        coalesce(v_reactor_username, 'Alguien') || ' reaccionó ' || p_emoji || ' a tu mensaje',
        'chats.html?c=' || v_msg.conversation_id
      );
    end if;
  end if;

  return v_msg;
end;
$$;

-- mark_conversation_read: además del comportamiento de siempre (read_at en
-- directo, intacto), ahora también deja un watermark universal en
-- conversation_participants.last_read_at -- es lo que alimenta unread_count
-- para directo Y grupo por igual (ver list_conversations/get_unread_conversation_count).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kind text;
begin
  select kind into v_kind from public.conversations where id = p_conversation_id;

  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = v_me and left_at is null;

  if v_kind = 'direct' then
    update public.messages
    set read_at = now()
    where conversation_id = p_conversation_id
      and sender_id <> v_me
      and read_at is null;
  end if;
end;
$$;

-- list_conversations: agrega kind/group_name/group_avatar_url/participants;
-- para kind='group' los other_* van null y viceversa. participants trae a
-- TODOS los que pasaron alguna vez por el grupo (con left_at), tanto para
-- resolver el nombre de quien mandó un mensaje viejo si ya se fue, como para
-- el panel "Info del grupo" (que filtra left_at is null en el cliente).
drop function public.list_conversations();

create function public.list_conversations()
returns table (
  conversation_id uuid,
  kind text,
  other_user_id uuid,
  other_username text,
  other_nombre text,
  other_apellido text,
  other_avatar_url text,
  other_user_type public.user_type,
  other_is_verified boolean,
  group_name text,
  group_avatar_url text,
  participants jsonb,
  status text,
  is_initiator boolean,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_type text,
  last_message_sender_is_me boolean,
  last_message_read boolean,
  unread_count integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id as conversation_id,
    c.kind,
    case when c.kind = 'direct' then p.id end as other_user_id,
    case when c.kind = 'direct' then p.username end as other_username,
    case when c.kind = 'direct' then p.nombre end as other_nombre,
    case when c.kind = 'direct' then p.apellido end as other_apellido,
    case when c.kind = 'direct' then p.avatar_url end as other_avatar_url,
    case when c.kind = 'direct' then p.user_type end as other_user_type,
    case when c.kind = 'direct' then coalesce(p.is_verified, false) end as other_is_verified,
    c.group_name,
    c.group_avatar_url,
    case when c.kind = 'group' then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', pp.id,
        'username', pp.username,
        'avatar_url', pp.avatar_url,
        'role', cp2.role,
        'left_at', cp2.left_at
      ) order by (cp2.role = 'admin') desc, cp2.joined_at asc), '[]'::jsonb)
      from public.conversation_participants cp2
      join public.profiles_public pp on pp.id = cp2.user_id
      where cp2.conversation_id = c.id
    ) end as participants,
    c.status,
    (c.initiator_id = auth.uid()) as is_initiator,
    c.last_message_at,
    c.last_message_preview,
    c.last_message_type,
    (c.last_message_sender_id = auth.uid()) as last_message_sender_is_me,
    case when c.kind = 'direct' then (
      select m.read_at is not null
      from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) end as last_message_read,
    (
      select count(*)::int from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > mycp.last_read_at
    ) as unread_count
  from public.conversations c
  join public.conversation_participants mycp
    on mycp.conversation_id = c.id and mycp.user_id = auth.uid() and mycp.left_at is null
  left join public.profiles_public p
    on c.kind = 'direct' and p.id = (case when c.user1_id = auth.uid() then c.user2_id else c.user1_id end)
  order by c.last_message_at desc;
$$;

grant execute on function public.list_conversations() to authenticated;

create or replace function public.get_unread_conversation_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select
    (
      select count(*)::int
      from public.conversations c
      join public.conversation_participants mycp
        on mycp.conversation_id = c.id and mycp.user_id = auth.uid() and mycp.left_at is null
      where c.status = 'accepted'
        and exists (
          select 1 from public.messages m
          where m.conversation_id = c.id
            and m.sender_id <> auth.uid()
            and m.created_at > mycp.last_read_at
        )
    )
    +
    (
      select count(*)::int
      from public.conversations c
      where c.status = 'pending'
        and c.initiator_id <> auth.uid()
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    );
$$;

-- Crea un grupo: yo quedo admin, el resto member. Sin paso de "solicitud" --
-- a diferencia de un DM, un grupo agrega directo (estilo WhatsApp/Instagram).
create or replace function public.create_group_conversation(
  p_name text,
  p_member_ids uuid[] default '{}'::uuid[],
  p_avatar_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_members uuid[];
  v_id uuid;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if v_name = '' then
    raise exception 'El grupo necesita un nombre';
  end if;

  select coalesce(array_agg(distinct m), '{}') into v_members
  from unnest(p_member_ids) as m
  where m <> v_me and exists (select 1 from public.profiles where id = m);

  if array_length(v_members, 1) is null or array_length(v_members, 1) < 2 then
    raise exception 'Un grupo necesita al menos 2 integrantes además de vos';
  end if;
  if array_length(v_members, 1) > 99 then
    raise exception 'Los grupos admiten hasta 100 integrantes';
  end if;

  insert into public.conversations (kind, initiator_id, status, group_name, group_avatar_url)
  values ('group', v_me, 'accepted', v_name, p_avatar_url)
  returning id into v_id;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_id, v_me, 'admin');

  insert into public.conversation_participants (conversation_id, user_id, role)
  select v_id, m, 'member' from unnest(v_members) as m;

  return v_id;
end;
$$;

create or replace function public.add_group_participants(p_conversation_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kind text;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  select kind into v_kind from public.conversations where id = p_conversation_id;
  if v_kind is null then
    raise exception 'Grupo no encontrado';
  end if;
  if v_kind <> 'group' then
    raise exception 'Esta acción solo aplica a grupos';
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = v_me and role = 'admin' and left_at is null
  ) then
    raise exception 'Solo un admin puede agregar integrantes';
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role, joined_at, left_at, last_read_at)
  select p_conversation_id, m, 'member', now(), null, now()
  from unnest(p_user_ids) as m
  where m <> v_me and exists (select 1 from public.profiles where id = m)
  on conflict (conversation_id, user_id) do update set left_at = null;
end;
$$;

-- No se puede sacar a quien creó el grupo (initiator_id) -- si un admin quiere
-- irse, usa leave_group_conversation, que promueve reemplazo automáticamente.
create or replace function public.remove_group_participant(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_creator uuid;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  select initiator_id into v_creator from public.conversations where id = p_conversation_id and kind = 'group';
  if v_creator is null then
    raise exception 'Grupo no encontrado';
  end if;

  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = v_me and role = 'admin' and left_at is null
  ) then
    raise exception 'Solo un admin puede sacar integrantes';
  end if;

  if p_user_id = v_creator then
    raise exception 'No se puede sacar a quien creó el grupo';
  end if;

  update public.conversation_participants
  set left_at = now()
  where conversation_id = p_conversation_id and user_id = p_user_id and left_at is null;

  if not found then
    raise exception 'Esa persona no está en el grupo';
  end if;
end;
$$;

-- Si quien se va era el único admin activo, promueve automáticamente al
-- miembro más antiguo para que el grupo nunca quede sin admin.
create or replace function public.leave_group_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_was_admin boolean;
  v_next_admin uuid;
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if not exists (select 1 from public.conversations where id = p_conversation_id and kind = 'group') then
    raise exception 'Grupo no encontrado';
  end if;

  select role = 'admin' into v_was_admin
  from public.conversation_participants
  where conversation_id = p_conversation_id and user_id = v_me and left_at is null;

  if v_was_admin is null then
    raise exception 'No participás de este grupo';
  end if;

  update public.conversation_participants
  set left_at = now()
  where conversation_id = p_conversation_id and user_id = v_me;

  if v_was_admin and not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and role = 'admin' and left_at is null
  ) then
    select user_id into v_next_admin
    from public.conversation_participants
    where conversation_id = p_conversation_id and left_at is null
    order by joined_at asc
    limit 1;

    if v_next_admin is not null then
      update public.conversation_participants
      set role = 'admin'
      where conversation_id = p_conversation_id and user_id = v_next_admin;
    end if;
  end if;
end;
$$;

create or replace function public.rename_group(p_conversation_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;
  if v_name = '' then
    raise exception 'El grupo necesita un nombre';
  end if;

  update public.conversations
  set group_name = v_name
  where id = p_conversation_id
    and kind = 'group'
    and exists (
      select 1 from public.conversation_participants
      where conversation_id = p_conversation_id and user_id = v_me and role = 'admin' and left_at is null
    );

  if not found then
    raise exception 'No se pudo renombrar el grupo';
  end if;
end;
$$;

create or replace function public.set_group_avatar(p_conversation_id uuid, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'No autenticado';
  end if;

  update public.conversations
  set group_avatar_url = p_avatar_url
  where id = p_conversation_id
    and kind = 'group'
    and exists (
      select 1 from public.conversation_participants
      where conversation_id = p_conversation_id and user_id = v_me and role = 'admin' and left_at is null
    );

  if not found then
    raise exception 'No se pudo actualizar la foto del grupo';
  end if;
end;
$$;

grant execute on function public.create_group_conversation(text, uuid[], text) to authenticated;
grant execute on function public.add_group_participants(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_participant(uuid, uuid) to authenticated;
grant execute on function public.leave_group_conversation(uuid) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.set_group_avatar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Fix: conversation_participants_select se referenciaba a si misma dentro
-- de su propio USING (y conversations_select/messages_select/las storage
-- policies la subconsultaban directo) -- bajo RLS real (rol "authenticated",
-- no el superusuario con el que se probó al principio) eso dispara
-- "infinite recursion detected in policy for relation
-- conversation_participants" (42P17) en CUALQUIER lectura de chat, no solo
-- grupos. Fix estándar: mover el chequeo de participación/admin a funciones
-- SECURITY DEFINER -- al ejecutarse como el dueño de la tabla (postgres), su
-- consulta interna no vuelve a evaluar RLS y corta la recursión sin cambiar
-- el resultado lógico de ninguna policy.
-- ---------------------------------------------------------------------------

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid() and left_at is null
  );
$$;

create or replace function public.is_conversation_admin(p_conversation_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid() and role = 'admin' and left_at is null
  );
$$;

grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.is_conversation_admin(uuid) to authenticated;

drop policy conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants
  for select using (public.is_conversation_participant(conversation_id));

drop policy conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (public.is_conversation_participant(id));

drop policy messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.is_conversation_participant(conversation_id));

drop policy chat_attachments_select on storage.objects;
drop policy chat_attachments_insert on storage.objects;

create policy chat_attachments_select on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );

create policy chat_attachments_insert on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );

drop policy chat_stickers_select on storage.objects;
create policy chat_stickers_select on storage.objects
  for select using (
    bucket_id = 'chat-stickers'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.messages m
        where m.attachment_path = name and public.is_conversation_participant(m.conversation_id)
      )
    )
  );

drop policy group_avatars_insert on storage.objects;
drop policy group_avatars_update on storage.objects;

create policy group_avatars_insert on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and public.is_conversation_admin(((storage.foldername(name))[2])::uuid)
  );

create policy group_avatars_update on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and public.is_conversation_admin(((storage.foldername(name))[2])::uuid)
  );

-- Fix: uploadGroupAvatar usa upsert:true -- el storage-api de Supabase, con upsert,
-- ejecuta un INSERT ... ON CONFLICT DO UPDATE ... RETURNING * (no un INSERT liso), y ese
-- RETURNING necesita una policy de SELECT ademas de las de insert/update, o falla con
-- "new row violates row-level security policy" (42501) aunque el insert/update en sí
-- estén permitidos. avatars_own_select solo cubre la carpeta del propio usuario, no
-- "groups/..." -- hacía falta el equivalente para fotos de grupo. Cualquier participante
-- activo (no solo el admin que la subió) puede leerla.
create policy group_avatars_select on storage.objects
  for select using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'groups'
    and public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
  );
