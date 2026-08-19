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
  return v_msg;
end;
$$;

grant execute on function public.react_to_message(uuid, text) to authenticated;
