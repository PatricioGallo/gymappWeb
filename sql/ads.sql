-- ============================================================================
-- Publicidad: sponsored posts en el feed de Reps
-- ============================================================================
-- Ya aplicado en producción vía mcp__supabase__apply_migration (proyecto
-- nxyxuthkhvzticqwtaar): ads_platform_tables, ads_platform_rpcs_and_bucket,
-- ads_rpcs_revoke_anon, ads_events_viewer_id_index, ads_get_feed_ads_add_advertiser_id.
-- Este archivo documenta el estado final, mismo formato que sql/social_feed.sql / sql/chat.sql.
--
-- Modelo: un ANUNCIANTE (advertisers) paga una CAMPAÑA (ad_campaigns) para que un
-- creativo aparezca en el feed de gente que matchea un targeting simple. El anunciante
-- puede ser un perfil de la app (gimnasio/entrenador) o una marca externa (proteínas,
-- ropa deportiva) que NO tiene perfil -- en ese caso el admin carga nombre/logo/links.
--
-- Precio: plano por día, pago único por campaña, lo lleva el admin a mano (price_total
-- + billing_notes, informativo). No hay subasta, ni CPM, ni créditos. El admin activa
-- la campaña seteando status='active'.
--
-- Entrega: get_feed_ads() (abajo). NO toca get_personalized_feed (que devuelve SETOF
-- posts). El cliente intercala: cada ~5 Reps orgánicos -> 1 anuncio.
--
-- Asume que ya existen: public.profiles (con provincia/ciudad/user_type), public.posts,
-- public.follows, public.is_staff(), public.is_profile_public(uuid), public.set_updated_at().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table public.advertisers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('profile', 'external')),
  -- kind='profile': FK al perfil (gimnasio/entrenador). kind='external': null.
  profile_id uuid references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  logo_url text,
  website_url text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advertisers_profile_pair check (
    (kind = 'profile'  and profile_id is not null) or
    (kind = 'external' and profile_id is null)
  )
);

-- Un perfil no puede tener dos fichas de anunciante.
create unique index advertisers_profile_uniq on public.advertisers(profile_id) where profile_id is not null;

create trigger advertisers_touch_updated_at
before update on public.advertisers
for each row execute function public.set_updated_at();

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,

  -- creativo: 'post' reusa un Rep real (solo anunciante interno, mantiene like/coment);
  -- 'standalone' es un creativo propio (marcas externas), card sin engagement.
  creative_kind text not null check (creative_kind in ('post', 'standalone')),
  post_id uuid references public.posts(id) on delete cascade,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  headline text check (headline is null or char_length(headline) <= 80),
  body_text text check (body_text is null or char_length(body_text) <= 200),
  cta_label text check (cta_label is null or char_length(cta_label) <= 30),
  cta_url text,  -- externo (abre pestaña nueva) o interno (lo resuelve el router del cliente)

  -- targeting: null / '{}' = sin filtro.
  target_provincia text,
  target_ciudad text,
  target_user_types text[] not null default '{}',  -- valores del enum user_type

  -- frecuencia: máximo de impresiones por usuario por día para esta campaña.
  daily_impression_cap_per_user smallint not null default 3 check (daily_impression_cap_per_user between 1 and 20),

  -- billing (plano por día, informativo, lo carga el admin).
  price_total numeric(12, 2),
  billing_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ad_campaigns_dates check (ends_at > starts_at),
  constraint ad_campaigns_creative_post check (creative_kind <> 'post' or post_id is not null),
  constraint ad_campaigns_creative_standalone check (
    creative_kind <> 'standalone' or (media_url is not null and media_type is not null and cta_url is not null)
  ),
  constraint ad_campaigns_media_pair check ((media_url is null) = (media_type is null))
);

create index ad_campaigns_active_idx on public.ad_campaigns(status, starts_at, ends_at) where status = 'active';
create index ad_campaigns_advertiser_idx on public.ad_campaigns(advertiser_id);
create index ad_campaigns_post_idx on public.ad_campaigns(post_id) where post_id is not null;

create trigger ad_campaigns_touch_updated_at
before update on public.ad_campaigns
for each row execute function public.set_updated_at();

-- Impresiones + clics: sirven para el tope de frecuencia y las métricas del panel.
-- NO se usan para cobrar (el precio es plano por campaña). Fila por evento -- ok a esta
-- escala; si crece, migrar a un agregado diario (campaign_id, viewer_id, day, impressions).
create table public.ad_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('impression', 'click')),
  created_at timestamptz not null default now()
);

create index ad_events_campaign_kind_idx on public.ad_events(campaign_id, kind, created_at);
create index ad_events_freq_idx on public.ad_events(campaign_id, viewer_id, created_at);
create index ad_events_viewer_idx on public.ad_events(viewer_id);  -- cubre el FK (cascade delete al borrar un perfil)

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------------
-- La entrega al feed va 100% por get_feed_ads() (SECURITY DEFINER); los clientes
-- normales no necesitan SELECT directo sobre estas tablas. Solo el staff las maneja.

alter table public.advertisers  enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_events    enable row level security;

create policy advertisers_staff_all on public.advertisers
  for all using (public.is_staff()) with check (public.is_staff());

create policy ad_campaigns_staff_all on public.ad_campaigns
  for all using (public.is_staff()) with check (public.is_staff());

-- El staff ve todos los eventos (stats). La escritura va por record_ad_event()
-- (SECURITY DEFINER) -- sin policy de insert, un insert directo del cliente rebota.
create policy ad_events_staff_select on public.ad_events
  for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 3. get_feed_ads: candidatos de anuncio para el viewer actual
-- ---------------------------------------------------------------------------
-- El cliente los intercala en el feed. Mismo truco de jitter estable por seed
-- (hashtext) que get_personalized_feed, para que un mismo scroll no repita ni saltee.
-- Orden: la campaña que hace más tiempo que no se le muestra a este usuario primero,
-- y entre esas, al azar (rand01). No hay competencia por puja.

create or replace function public.get_feed_ads(p_limit integer default 3, p_seed text default null)
returns table (
  campaign_id uuid,
  advertiser_id uuid,
  advertiser_name text,
  advertiser_logo_url text,
  advertiser_kind text,
  advertiser_username text,
  advertiser_user_type text,
  creative_kind text,
  post_id uuid,
  media_url text,
  media_type text,
  headline text,
  body_text text,
  cta_label text,
  cta_url text
)
language sql
security definer
set search_path to 'public'
as $$
  with me as (
    select id, user_type::text as user_type, provincia, ciudad
    from public.profiles where id = auth.uid()
  ),
  eligible as (
    select
      c.id,
      a.id    as advertiser_id,
      a.name  as advertiser_name,
      a.logo_url as advertiser_logo_url,
      a.kind  as advertiser_kind,
      pr.username as advertiser_username,
      pr.user_type::text as advertiser_user_type,
      c.creative_kind, c.post_id, c.media_url, c.media_type,
      c.headline, c.body_text, c.cta_label, c.cta_url,
      ((hashtext(coalesce(p_seed, '') || c.id::text)::bigint + 2147483648) / 4294967295.0) as rand01,
      coalesce(
        (select max(e.created_at) from public.ad_events e
         where e.campaign_id = c.id and e.viewer_id = (select id from me) and e.kind = 'impression'),
        'epoch'::timestamptz
      ) as last_shown
    from public.ad_campaigns c
    join public.advertisers a on a.id = c.advertiser_id
    left join public.profiles pr on pr.id = a.profile_id
    where c.status = 'active'
      and now() between c.starts_at and c.ends_at
      and (select id from me) is not null
      -- no le mostramos el anuncio al propio dueño del perfil anunciante
      and (a.profile_id is null or a.profile_id <> (select id from me))
      -- targeting por tipo de usuario ('{}' = todos)
      and (cardinality(c.target_user_types) = 0 or (select user_type from me) = any(c.target_user_types))
      -- targeting geográfico (si la campaña lo fijó, tiene que matchear)
      and (c.target_provincia is null or c.target_provincia = (select provincia from me))
      and (c.target_ciudad   is null or c.target_ciudad   = (select ciudad from me))
      -- anunciante interno: no mostrar a quien ya lo sigue (lo ve orgánico)
      and not (a.kind = 'profile' and exists (
        select 1 from public.follows f
        where f.follower_id = (select id from me) and f.followed_id = a.profile_id and f.status = 'accepted'
      ))
      -- tope de impresiones por usuario por día
      and (
        select count(*) from public.ad_events e
        where e.campaign_id = c.id and e.viewer_id = (select id from me)
          and e.kind = 'impression' and e.created_at >= date_trunc('day', now())
      ) < c.daily_impression_cap_per_user
      -- creativo 'post': el Rep promocionado tiene que seguir visible
      and (c.creative_kind <> 'post' or exists (
        select 1 from public.posts p where p.id = c.post_id and public.is_profile_public(p.author_id)
      ))
  )
  select
    id, advertiser_id, advertiser_name, advertiser_logo_url, advertiser_kind,
    advertiser_username, advertiser_user_type,
    creative_kind, post_id, media_url, media_type, headline, body_text, cta_label, cta_url
  from eligible
  order by last_shown asc, rand01 desc
  limit greatest(p_limit, 0);
$$;

grant execute on function public.get_feed_ads(integer, text) to authenticated;
revoke execute on function public.get_feed_ads(integer, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 4. record_ad_event: registra impresión / clic del viewer actual
-- ---------------------------------------------------------------------------
-- Solo si la campaña existe y está activa (no gastamos filas en campañas muertas).

create or replace function public.record_ad_event(p_campaign_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_kind not in ('impression', 'click') then
    raise exception 'kind invalido: %', p_kind;
  end if;
  if not exists (select 1 from public.ad_campaigns c where c.id = p_campaign_id and c.status = 'active') then
    return;
  end if;
  insert into public.ad_events (campaign_id, viewer_id, kind)
  values (p_campaign_id, auth.uid(), p_kind);
end;
$$;

grant execute on function public.record_ad_event(uuid, text) to authenticated;
revoke execute on function public.record_ad_event(uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 4b. get_ad_stats: métricas por campaña para el panel admin (staff-only)
-- ---------------------------------------------------------------------------
create or replace function public.get_ad_stats()
returns table (
  campaign_id uuid,
  impressions bigint,
  clicks bigint,
  unique_viewers bigint
)
language sql
security definer
set search_path to 'public'
as $$
  select
    c.id as campaign_id,
    count(*) filter (where e.kind = 'impression') as impressions,
    count(*) filter (where e.kind = 'click') as clicks,
    count(distinct e.viewer_id) filter (where e.kind = 'impression') as unique_viewers
  from public.ad_campaigns c
  left join public.ad_events e on e.campaign_id = c.id
  where public.is_staff()
  group by c.id;
$$;

grant execute on function public.get_ad_stats() to authenticated;
revoke execute on function public.get_ad_stats() from public, anon;

-- ---------------------------------------------------------------------------
-- 5. Storage: bucket público para creativos standalone (marcas externas) + logos
-- ---------------------------------------------------------------------------
-- Escritura solo staff (el admin sube todo desde el panel).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-media', 'ad-media', true, 314572800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy ad_media_public_select on storage.objects
  for select using (bucket_id = 'ad-media');

create policy ad_media_staff_insert on storage.objects
  for insert with check (bucket_id = 'ad-media' and public.is_staff());

create policy ad_media_staff_update on storage.objects
  for update using (bucket_id = 'ad-media' and public.is_staff())
  with check (bucket_id = 'ad-media' and public.is_staff());

create policy ad_media_staff_delete on storage.objects
  for delete using (bucket_id = 'ad-media' and public.is_staff());
