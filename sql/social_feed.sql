-- ============================================================================
-- Reps: feed social estilo Twitter para Gym Social
-- ============================================================================
-- Ya fue aplicado en producción vía mcp__supabase__apply_migration (proyecto
-- nxyxuthkhvzticqwtaar), en varios pasos. Este archivo documenta el estado final
-- para referencia futura, siguiendo el mismo formato que sql/chat.sql.
-- Asume que ya existen: public.profiles, public.profiles_public, public.follows,
-- public.notifications, public.is_admin(), public.is_profile_public(uuid),
-- public.set_updated_at(), public.get_block_status(uuid), public.messages,
-- public.send_message(...) y el bucket "avatars".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  quoted_post_id uuid references public.posts(id) on delete set null,
  thread_root_id uuid references public.posts(id) on delete cascade,
  thread_parent_id uuid references public.posts(id) on delete cascade,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  reposts_count integer not null default 0,
  quotes_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_content_len check (content is null or char_length(content) <= 140),
  constraint posts_has_content check (content is not null or media_url is not null),
  constraint posts_media_pair check ((media_url is null) = (media_type is null)),
  constraint posts_thread_pair check ((thread_root_id is null) = (thread_parent_id is null)),
  constraint posts_thread_not_self check (thread_parent_id is distinct from id),
  constraint posts_quote_not_self check (quoted_post_id is distinct from id)
);

create index posts_author_created_idx on public.posts(author_id, created_at desc);
create index posts_created_idx on public.posts(created_at desc);
create index posts_thread_root_idx on public.posts(thread_root_id);
create index posts_thread_parent_idx on public.posts(thread_parent_id);
create index posts_quoted_post_idx on public.posts(quoted_post_id) where quoted_post_id is not null;

create trigger posts_touch_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

-- "Me gusta" de un Rep.
create table public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_unique unique (post_id, user_id)
);

create index post_likes_post_idx on public.post_likes(post_id);
create index post_likes_user_idx on public.post_likes(user_id);

-- Repost simple (sin contenido propio) -- es una accion, no crea una fila nueva en posts.
-- Citar un Rep SI crea una fila nueva en posts con quoted_post_id seteado.
create table public.post_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_reposts_unique unique (post_id, user_id)
);

create index post_reposts_post_idx on public.post_reposts(post_id);
create index post_reposts_user_idx on public.post_reposts(user_id);

-- Comentarios planos (sin anidar) de un Rep.
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint post_comments_content_len check (char_length(content) between 1 and 140)
);

create index post_comments_post_created_idx on public.post_comments(post_id, created_at);
create index post_comments_author_idx on public.post_comments(author_id);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_reposts enable row level security;
alter table public.post_comments enable row level security;

-- posts: visible si el autor es publico, soy yo, soy admin, o lo sigo (aceptado).
-- is_profile_public() ya contempla las 4 condiciones -- mismo helper que usan
-- routines/weight_logs, no hizo falta tocarlo.
create policy posts_select on public.posts
  for select using (
    public.is_profile_public(author_id)
  );

create policy posts_insert on public.posts
  for insert with check (auth.uid() = author_id);

create policy posts_update on public.posts
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

create policy posts_delete on public.posts
  for delete using (auth.uid() = author_id or public.is_admin());

-- Likes/reposts/comentarios: legibles si el post asociado es visible; escribibles
-- solo por su dueño y solo si el post sigue siendo visible en ese momento (no solo
-- al cargarlo en el cliente) -- evita que alguien le de like/comente/repostee algo
-- que ya no puede ver (autor paso a privado, lo dejaron de seguir, etc).
create policy post_likes_select on public.post_likes
  for select using (
    exists (select 1 from public.posts p where p.id = post_likes.post_id and public.is_profile_public(p.author_id))
  );

create policy post_likes_insert on public.post_likes
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id and public.is_profile_public(p.author_id))
  );

create policy post_likes_delete on public.post_likes
  for delete using (auth.uid() = user_id);

create policy post_reposts_select on public.post_reposts
  for select using (
    exists (select 1 from public.posts p where p.id = post_reposts.post_id and public.is_profile_public(p.author_id))
  );

create policy post_reposts_insert on public.post_reposts
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_id and public.is_profile_public(p.author_id))
  );

create policy post_reposts_delete on public.post_reposts
  for delete using (auth.uid() = user_id);

create policy post_comments_select on public.post_comments
  for select using (
    exists (select 1 from public.posts p where p.id = post_comments.post_id and public.is_profile_public(p.author_id))
  );

create policy post_comments_insert on public.post_comments
  for insert with check (
    auth.uid() = author_id
    and exists (select 1 from public.posts p where p.id = post_id and public.is_profile_public(p.author_id))
  );

create policy post_comments_delete on public.post_comments
  for delete using (auth.uid() = author_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Hilos: solo podes continuar tu propio Rep
-- ---------------------------------------------------------------------------
-- Un hilo es una cadena de Reps del MISMO autor (thread_parent_id -> post anterior,
-- thread_root_id -> primer post del hilo, denormalizado para traer el hilo completo
-- de una sola consulta). Esto es distinto de los comentarios: los comentarios son
-- de cualquier usuario y no forman parte del hilo.

create or replace function public.enforce_thread_self_continuation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_parent_author uuid;
  v_parent_root uuid;
begin
  if new.thread_parent_id is null then
    return new;
  end if;

  select author_id, coalesce(thread_root_id, id) into v_parent_author, v_parent_root
  from public.posts where id = new.thread_parent_id;

  if v_parent_author is null then
    raise exception 'El post padre del hilo no existe';
  end if;
  if v_parent_author <> new.author_id then
    raise exception 'Solo podes continuar tu propio hilo';
  end if;
  if new.thread_root_id is distinct from v_parent_root then
    raise exception 'thread_root_id no coincide con la raiz real del hilo';
  end if;

  return new;
end;
$$;

create trigger posts_enforce_thread_self_continuation
before insert or update of thread_parent_id, thread_root_id, author_id on public.posts
for each row execute function public.enforce_thread_self_continuation();

-- ---------------------------------------------------------------------------
-- 4. Contadores denormalizados (likes/comments/reposts/quotes en posts)
-- ---------------------------------------------------------------------------
-- Evita recalcular COUNT() en cada fetch del feed. Mantenidos por triggers
-- AFTER INSERT/DELETE en las tablas de accion correspondientes.

create or replace function public.bump_post_likes_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_likes_bump_count
after insert or delete on public.post_likes
for each row execute function public.bump_post_likes_count();

create or replace function public.bump_post_comments_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comments_count = comments_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_comments_bump_count
after insert or delete on public.post_comments
for each row execute function public.bump_post_comments_count();

create or replace function public.bump_post_reposts_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reposts_count = reposts_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set reposts_count = greatest(0, reposts_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_reposts_bump_count
after insert or delete on public.post_reposts
for each row execute function public.bump_post_reposts_count();

-- Un post que nace con quoted_post_id bumpea el contador del original. Si el
-- original se borra, quoted_post_id se limpia via ON DELETE SET NULL de la FK
-- (no dispara este trigger) y el contador de citas del original desaparece
-- junto con la fila borrada -- no hace falta descuento adicional en ese caso.
create or replace function public.bump_post_quotes_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' and new.quoted_post_id is not null then
    update public.posts set quotes_count = quotes_count + 1 where id = new.quoted_post_id;
  elsif tg_op = 'DELETE' and old.quoted_post_id is not null then
    update public.posts set quotes_count = greatest(0, quotes_count - 1) where id = old.quoted_post_id;
  end if;
  return null;
end;
$$;

create trigger posts_bump_quotes_count
after insert or delete on public.posts
for each row execute function public.bump_post_quotes_count();

-- ---------------------------------------------------------------------------
-- 5. Notificaciones (like / comment / repost / quote)
-- ---------------------------------------------------------------------------
-- Reutiliza las claves 'likes'/'comments' de notification_prefs que ya estaban
-- pre-provisionadas (dormidas) en profiles. Agrega la clave 'reposts', que
-- tambien cubre las citas (mismo "alguien hizo algo con tu Rep").

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = ANY (ARRAY[
    'routine_assigned'::text, 'issue_status'::text, 'admin_message'::text,
    'follow'::text, 'follow_request'::text, 'follow_accepted'::text, 'follow_rejected'::text,
    'verification_approved'::text, 'verification_rejected'::text,
    'subscription_request'::text, 'subscription_accepted'::text, 'subscription_rejected'::text,
    'like'::text, 'comment'::text, 'repost'::text, 'quote'::text, 'mention'::text
  ]));

alter table public.profiles
  alter column notification_prefs set default '{"likes": true, "follows": true, "comments": true, "mentions": true, "reposts": true}'::jsonb;

update public.profiles
set notification_prefs = notification_prefs || '{"reposts": true}'::jsonb
where not notification_prefs ? 'reposts';

create or replace function public.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_author_id uuid;
  v_liker_username text;
  v_notify boolean;
begin
  select author_id into v_author_id from public.posts where id = new.post_id;
  if v_author_id is null or v_author_id = new.user_id then
    return new;
  end if;

  select coalesce((notification_prefs->>'likes')::boolean, true) into v_notify
    from public.profiles where id = v_author_id;
  if not coalesce(v_notify, true) then
    return new;
  end if;

  select username into v_liker_username from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_author_id, 'like', 'Nuevo me gusta',
    coalesce(v_liker_username, 'Alguien') || ' le dio me gusta a tu Rep',
    'post.html?id=' || new.post_id
  );
  return new;
end;
$$;

create trigger post_likes_notify
after insert on public.post_likes
for each row execute function public.notify_post_like();

create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_author_id uuid;
  v_commenter_username text;
  v_notify boolean;
begin
  select author_id into v_author_id from public.posts where id = new.post_id;
  if v_author_id is null or v_author_id = new.author_id then
    return new;
  end if;

  select coalesce((notification_prefs->>'comments')::boolean, true) into v_notify
    from public.profiles where id = v_author_id;
  if not coalesce(v_notify, true) then
    return new;
  end if;

  select username into v_commenter_username from public.profiles where id = new.author_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_author_id, 'comment', 'Nuevo comentario',
    coalesce(v_commenter_username, 'Alguien') || ' comento tu Rep',
    'post.html?id=' || new.post_id
  );
  return new;
end;
$$;

create trigger post_comments_notify
after insert on public.post_comments
for each row execute function public.notify_post_comment();

create or replace function public.notify_post_repost()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_author_id uuid;
  v_reposter_username text;
  v_notify boolean;
begin
  select author_id into v_author_id from public.posts where id = new.post_id;
  if v_author_id is null or v_author_id = new.user_id then
    return new;
  end if;

  select coalesce((notification_prefs->>'reposts')::boolean, true) into v_notify
    from public.profiles where id = v_author_id;
  if not coalesce(v_notify, true) then
    return new;
  end if;

  select username into v_reposter_username from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_author_id, 'repost', 'Nuevo repost',
    coalesce(v_reposter_username, 'Alguien') || ' reposteo tu Rep',
    'post.html?id=' || new.post_id
  );
  return new;
end;
$$;

create trigger post_reposts_notify
after insert on public.post_reposts
for each row execute function public.notify_post_repost();

create or replace function public.notify_post_quote()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_author_id uuid;
  v_quoter_username text;
  v_notify boolean;
begin
  if new.quoted_post_id is null then
    return new;
  end if;
  select author_id into v_author_id from public.posts where id = new.quoted_post_id;
  if v_author_id is null or v_author_id = new.author_id then
    return new;
  end if;

  select coalesce((notification_prefs->>'reposts')::boolean, true) into v_notify
    from public.profiles where id = v_author_id;
  if not coalesce(v_notify, true) then
    return new;
  end if;

  select username into v_quoter_username from public.profiles where id = new.author_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_author_id, 'quote', 'Nueva cita',
    coalesce(v_quoter_username, 'Alguien') || ' cito tu Rep',
    'post.html?id=' || new.id
  );
  return new;
end;
$$;

create trigger posts_notify_quote
after insert on public.posts
for each row execute function public.notify_post_quote();

-- ---------------------------------------------------------------------------
-- 5b. Etiquetar usuarios con @usuario en un Rep (post.service.ts parsea el texto
-- y resuelve los @usuario contra profiles_public; el trigger de abajo notifica).
-- ---------------------------------------------------------------------------

create table public.post_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, mentioned_user_id)
);

create index post_mentions_user_idx on public.post_mentions(mentioned_user_id);

alter table public.post_mentions enable row level security;

create policy post_mentions_select on public.post_mentions
  for select using (
    exists (select 1 from public.posts p where p.id = post_mentions.post_id and public.is_profile_public(p.author_id))
  );

create policy post_mentions_insert on public.post_mentions
  for insert with check (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

create or replace function public.notify_post_mention()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_author_id uuid;
  v_author_username text;
  v_notify boolean;
begin
  select author_id into v_author_id from public.posts where id = new.post_id;
  if v_author_id is null or v_author_id = new.mentioned_user_id then
    return new;
  end if;

  select coalesce((notification_prefs->>'mentions')::boolean, true) into v_notify
    from public.profiles where id = new.mentioned_user_id;
  if not coalesce(v_notify, true) then
    return new;
  end if;

  select username into v_author_username from public.profiles where id = v_author_id;

  insert into public.notifications (user_id, type, title, body, link, actor_id)
  values (
    new.mentioned_user_id, 'mention', 'Te etiquetaron',
    coalesce(v_author_username, 'Alguien') || ' te etiquetó en un Rep',
    'post.html?id=' || new.post_id, v_author_id
  );
  return new;
end;
$$;

create trigger post_mentions_notify
after insert on public.post_mentions
for each row execute function public.notify_post_mention();

-- ---------------------------------------------------------------------------
-- 6. Storage: bucket publico para media de Reps (imagen o video)
-- ---------------------------------------------------------------------------
-- Mismo patron carpeta-por-usuario que avatars/exercise-images, extendido a
-- imagen+video. Limite de 300MB pensado para videos de hasta 2 min (validados
-- en el cliente, ver validatePostVideoDuration en post.service.ts) en buena
-- calidad, para que el peso del archivo no termine siendo la traba.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  314572800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/x-msvideo', 'video/x-matroska', 'video/mpeg', 'video/ogg']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy post_media_own_select on storage.objects
  for select using (
    bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy post_media_own_insert on storage.objects
  for insert with check (
    bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy post_media_own_update on storage.objects
  for update using (
    bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy post_media_own_delete on storage.objects
  for delete using (
    bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 7. Compartir un Rep dentro de una conversacion de chat existente
-- ---------------------------------------------------------------------------

alter table public.messages
  add column shared_post_id uuid references public.posts(id) on delete set null;

create index messages_shared_post_idx on public.messages(shared_post_id) where shared_post_id is not null;

alter table public.messages drop constraint messages_has_content;
alter table public.messages add constraint messages_has_content
  check (content is not null or attachment_path is not null or shared_post_id is not null);

-- send_message() se reemplaza agregando p_shared_post_id con default null al final
-- de la firma -- compatible con llamadas existentes que no lo mandan. OJO: "create or
-- replace function" en Postgres NO reemplaza una funcion si le cambia la firma de
-- parametros -- crea una segunda funcion sobrecargada y deja las dos, lo que rompe
-- la resolucion de PostgREST ("Could not choose the best candidate function"). Hay
-- que borrar la version vieja de 5 parametros antes de crear la nueva.
drop function if exists public.send_message(uuid, text, text, text, integer);

create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text default null,
  p_attachment_path text default null,
  p_attachment_type text default null,
  p_attachment_duration_seconds integer default null,
  p_shared_post_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path to 'public'
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
    raise exception 'El mensaje esta vacio';
  end if;
  -- Solo se puede compartir un Rep que el usuario puede ver (misma regla que la RLS de posts).
  if p_shared_post_id is not null and not exists (
    select 1 from public.posts p where p.id = p_shared_post_id and public.is_profile_public(p.author_id)
  ) then
    raise exception 'No podes compartir este Rep';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if v_conv.id is null then
    raise exception 'Conversacion no encontrada';
  end if;
  if v_me <> v_conv.user1_id and v_me <> v_conv.user2_id then
    raise exception 'No participas de esta conversacion';
  end if;

  v_other := case when v_conv.user1_id = v_me then v_conv.user2_id else v_conv.user1_id end;
  select get_block_status(v_other) into v_block_status;
  if v_block_status <> 'none' then
    raise exception 'No podes enviarle mensajes a este usuario';
  end if;

  insert into public.messages (conversation_id, sender_id, content, attachment_path, attachment_type, attachment_duration_seconds, shared_post_id)
  values (p_conversation_id, v_me, nullif(trim(p_content), ''), p_attachment_path, p_attachment_type, p_attachment_duration_seconds, p_shared_post_id)
  returning * into v_msg;

  v_preview := case
    when p_attachment_type = 'image' then '📷 Foto'
    when p_attachment_type = 'audio' then '🎤 Audio'
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

grant execute on function public.send_message(uuid, text, text, text, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime
-- ---------------------------------------------------------------------------
-- Solo posts/post_comments -- likes/reposts se reflejan via los contadores
-- denormalizados en posts, no hace falta un canal aparte para eso.

alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_comments;

-- ---------------------------------------------------------------------------
-- 9. Respuestas anidadas a comentarios (hilos de comentarios)
-- ---------------------------------------------------------------------------
-- parent_comment_id permite responder a un comentario puntual (no solo al Rep),
-- formando arbol/hilo de comentarios. on delete cascade: borrar un comentario
-- borra tambien sus respuestas. La RLS de post_comments no cambia (ya alcanza
-- con el chequeo de visibilidad del post); un trigger valida que el comentario
-- padre pertenezca al mismo post_id.

alter table public.post_comments
  add column parent_comment_id uuid references public.post_comments(id) on delete cascade;

create index post_comments_parent_idx on public.post_comments(parent_comment_id);

create or replace function public.enforce_comment_parent_same_post()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_parent_post_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select post_id into v_parent_post_id from public.post_comments where id = new.parent_comment_id;
  if v_parent_post_id is null then
    raise exception 'El comentario padre no existe';
  end if;
  if v_parent_post_id <> new.post_id then
    raise exception 'El comentario padre pertenece a otro Rep';
  end if;

  return new;
end;
$$;

create trigger post_comments_enforce_parent_same_post
before insert on public.post_comments
for each row execute function public.enforce_comment_parent_same_post();

-- notify_post_comment ahora tambien avisa al autor del comentario padre (si es
-- una respuesta a un comentario), ademas de al autor del Rep -- sin duplicar el
-- aviso si es la misma persona o si el que responde es el propio autor.
create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_post_author_id uuid;
  v_parent_author_id uuid;
  v_commenter_username text;
  v_notify boolean;
begin
  select author_id into v_post_author_id from public.posts where id = new.post_id;
  select username into v_commenter_username from public.profiles where id = new.author_id;

  if v_post_author_id is not null and v_post_author_id <> new.author_id then
    select coalesce((notification_prefs->>'comments')::boolean, true) into v_notify
      from public.profiles where id = v_post_author_id;
    if coalesce(v_notify, true) then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_post_author_id, 'comment', 'Nuevo comentario',
        coalesce(v_commenter_username, 'Alguien') || ' comento tu Rep',
        'post.html?id=' || new.post_id
      );
    end if;
  end if;

  if new.parent_comment_id is not null then
    select author_id into v_parent_author_id from public.post_comments where id = new.parent_comment_id;
    if v_parent_author_id is not null and v_parent_author_id <> new.author_id and v_parent_author_id <> v_post_author_id then
      select coalesce((notification_prefs->>'comments')::boolean, true) into v_notify
        from public.profiles where id = v_parent_author_id;
      if coalesce(v_notify, true) then
        insert into public.notifications (user_id, type, title, body, link)
        values (
          v_parent_author_id, 'comment', 'Nueva respuesta',
          coalesce(v_commenter_username, 'Alguien') || ' respondio tu comentario',
          'post.html?id=' || new.post_id
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- El tipo 'message_reaction' (alguien reacciona con un emoji a tu mensaje de chat) se agrega
-- a notifications_type_check en sql/chat.sql, sección 6 -- se dispara desde react_to_message,
-- no desde un trigger acá, porque esa función ya sabe con certeza si la llamada agrega una
-- reacción nueva o solo la saca.
