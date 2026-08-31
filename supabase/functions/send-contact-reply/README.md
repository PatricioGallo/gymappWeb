# send-contact-reply

Manda el mail de respuesta a un mensaje del formulario de contacto, usando el
**mismo SMTP que Supabase Auth** (el de los mails de registro / recupero).
Guarda el registro en `public.contact_message_replies` para el hilo que se ve en
el panel de administración → pestaña **Mail**.

## 1. Aplicar la migración

`sql/contact_replies.sql` (crea la tabla `contact_message_replies` + RLS).
Correr en **Supabase Dashboard → SQL Editor**.

## 2. Cargar los secrets SMTP

Son los MISMOS valores de **Dashboard → Authentication → Emails → SMTP Settings**.
El proyecto usa **Resend** como SMTP de Auth, así que:

```powershell
npx supabase login
npx supabase secrets set SMTP_HOST="smtp.resend.com" SMTP_PORT="465" SMTP_USERNAME="resend" SMTP_PASSWORD="re_TU_API_KEY" SMTP_FROM="no-reply@gymsocial.com.ar" SMTP_FROM_NAME="GYM SOCIAL" --project-ref nxyxuthkhvzticqwtaar
```

- `SMTP_PASSWORD` = API key de Resend (`re_...`). Resend no deja re-ver una key
  existente; si no la tenés guardada, creá una nueva en https://resend.com/api-keys
  (permiso *Sending access*). Podés tener varias, no rompe la de Auth.
- `SMTP_FROM` = el "Sender email address" de Auth (`no-reply@gymsocial.com.ar`),
  dominio verificado en Resend.
- `SMTP_PORT`: `465` = TLS implícito, `587` = STARTTLS.

## 3. Deployar la función

```bash
npx supabase functions deploy send-contact-reply --project-ref nxyxuthkhvzticqwtaar
```

`verify_jwt = true` (config.toml) → solo entra con sesión iniciada; además la
función chequea `is_staff()` sobre el que llama.

## Probar

Desde el panel: **Administrar → Mail → Responder** en cualquier mensaje.
Logs: `npx supabase functions logs send-contact-reply --project-ref nxyxuthkhvzticqwtaar`
