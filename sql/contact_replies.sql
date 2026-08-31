-- ============================================================================
-- contact_message_replies
-- ----------------------------------------------------------------------------
-- Registro / hilo de las respuestas por email que un admin o colaborador manda
-- a un mensaje del formulario de contacto (public.contact_messages).
--
-- El envio real del mail lo hace la Edge Function `send-contact-reply`, que usa
-- el mismo SMTP que Supabase Auth (los mails de registro / recupero). Esta tabla
-- es solo el historial que se ve en el panel de administracion, pestaña "Mail".
--
-- Aplicar con: Supabase Dashboard > SQL Editor, o `mcp__supabase__apply_migration`.
-- ============================================================================

create table if not exists public.contact_message_replies (
  id                 uuid primary key default gen_random_uuid(),
  contact_message_id uuid not null references public.contact_messages (id) on delete cascade,
  sent_by            uuid references public.profiles (id) on delete set null,
  to_email           text not null,
  subject            text not null,
  body               text not null,
  created_at         timestamptz not null default now()
);

create index if not exists contact_message_replies_message_idx
  on public.contact_message_replies (contact_message_id, created_at);

alter table public.contact_message_replies enable row level security;

-- Solo staff (admin / colaborador) puede leer el hilo de respuestas.
drop policy if exists "staff reads contact replies" on public.contact_message_replies;
create policy "staff reads contact replies"
  on public.contact_message_replies
  for select
  to authenticated
  using ((select public.is_staff()));

-- El insert real viaja por la Edge Function con service_role (bypassea RLS).
-- Esta policy queda por consistencia si alguna vez se inserta desde el cliente.
drop policy if exists "staff writes contact replies" on public.contact_message_replies;
create policy "staff writes contact replies"
  on public.contact_message_replies
  for insert
  to authenticated
  with check ((select public.is_staff()) and sent_by = (select auth.uid()));

grant select, insert on public.contact_message_replies to authenticated;
