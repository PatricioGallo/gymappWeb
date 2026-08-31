// send-contact-reply
// ----------------------------------------------------------------------------
// Manda un mail de respuesta al autor de un mensaje del formulario de contacto
// (public.contact_messages), usando el MISMO SMTP que Supabase Auth usa para los
// mails de registro / recupero de contraseña. Deja el registro en
// public.contact_message_replies para el hilo que se ve en el panel (pestaña Mail).
//
// Solo lo puede invocar un usuario staff (admin / colaborador) -- se valida con
// el JWT del que llama + la RPC public.is_staff().
//
// Secrets que necesita la funcion (Dashboard > Edge Functions > send-contact-reply
// > Secrets, o `npx supabase secrets set ...`):
//   SMTP_HOST       ej: smtp.resend.com  /  smtp.gmail.com  /  el que uses en Auth
//   SMTP_PORT       465 (TLS implicito) o 587 (STARTTLS). Default: 465
//   SMTP_USERNAME   usuario SMTP
//   SMTP_PASSWORD   password / api-key SMTP
//   SMTP_FROM       casilla remitente, la MISMA que "Sender email" en Auth > SMTP
//   SMTP_FROM_NAME  nombre visible del remitente. Default: "Gym Social"
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function paragraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderHtml(replyBody: string, originalMessage: string, fromName: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0c0f;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#14171c;border:1px solid #262b33;border-radius:16px;overflow:hidden;">
        <tr><td align="center" style="padding:32px 32px 0 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
            <td style="background:#ffffff;border-radius:12px;padding:16px 22px;">
              <img src="https://gymsocial.com.ar/images/logo.png" alt="Gym Social" width="150" style="display:block;max-width:150px;height:auto;">
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 32px 0 32px;color:#f4f5f6;font-size:15px;line-height:1.6;">
          ${paragraphs(replyBody)}
        </td></tr>
        <tr><td style="padding:4px 32px 0 32px;color:#9aa1ac;font-size:13px;line-height:1.6;">
          — ${escapeHtml(fromName)}
        </td></tr>
        <tr><td style="padding:20px 32px 32px 32px;border-top:1px solid #262b33;color:#9aa1ac;font-size:12px;line-height:1.6;">
          <strong style="color:#f4f5f6;">En respuesta a tu mensaje:</strong><br>
          <span style="color:#9aa1ac;">${paragraphs(originalMessage)}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "No autenticado." }, 401);

  // 1. Identidad del que llama.
  //    `verify_jwt = true` (config.toml) => la plataforma YA validó la firma del JWT
  //    antes de que corra este código, así que podemos confiar en los claims.
  //    (auth.getUser() del SDK no sirve acá: tira "Auth session missing" en el edge runtime.)
  let claims: { sub?: string; role?: string };
  try {
    const part = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
  } catch {
    return json({ error: "Token inválido." }, 401);
  }
  const userId = claims.sub ?? "";
  if (claims.role !== "authenticated" || !userId) {
    return json({ error: "No autenticado." }, 401);
  }

  // 2. Permiso: is_staff() lee auth.uid() del token que PostgREST recibe en el header.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isStaff, error: staffErr } = await asUser.rpc("is_staff");
  if (staffErr) console.error("is_staff rpc failed:", staffErr.message);
  if (staffErr || !isStaff) return json({ error: "No tenés permiso para responder mensajes." }, 403);

  // 3. Payload
  let payload: { contact_message_id?: string; body?: string; subject?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  const contactMessageId = (payload.contact_message_id ?? "").trim();
  const replyBody = (payload.body ?? "").trim();
  const customSubject = (payload.subject ?? "").trim().slice(0, 150);

  if (!contactMessageId) return json({ error: "Falta el mensaje de contacto." }, 400);
  if (replyBody.length < 10) return json({ error: "La respuesta es muy corta (mínimo 10 caracteres)." }, 400);
  if (replyBody.length > 5000) return json({ error: "La respuesta es muy larga (máximo 5000 caracteres)." }, 400);

  // 4. Traer el mensaje original (service_role: bypassea RLS)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: msg, error: msgErr } = await admin
    .from("contact_messages")
    .select("id, name, email, message")
    .eq("id", contactMessageId)
    .single();

  if (msgErr || !msg) return json({ error: "No encontramos ese mensaje de contacto." }, 404);

  // 4. Enviar el mail por el SMTP de Auth
  const SMTP_HOST = Deno.env.get("SMTP_HOST");
  const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const SMTP_USERNAME = Deno.env.get("SMTP_USERNAME");
  const SMTP_PASSWORD = Deno.env.get("SMTP_PASSWORD");
  const SMTP_FROM = Deno.env.get("SMTP_FROM");
  const SMTP_FROM_NAME = Deno.env.get("SMTP_FROM_NAME") ?? "Gym Social";

  if (!SMTP_HOST || !SMTP_USERNAME || !SMTP_PASSWORD || !SMTP_FROM) {
    return json({ error: "El envío de mails no está configurado (faltan los secrets SMTP de la función)." }, 500);
  }

  const subject = customSubject || "Re: tu mensaje a Gym Social";
  const textBody = `${replyBody}\n\n— ${SMTP_FROM_NAME}\n\n---\nEn respuesta a tu mensaje:\n${msg.message}`;

  const smtp = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: SMTP_PORT === 465,
      auth: { username: SMTP_USERNAME, password: SMTP_PASSWORD },
    },
  });

  try {
    await smtp.send({
      from: `${SMTP_FROM_NAME} <${SMTP_FROM}>`,
      to: `${msg.name} <${msg.email}>`,
      replyTo: SMTP_FROM,
      subject,
      content: textBody,
      html: renderHtml(replyBody, msg.message, SMTP_FROM_NAME),
    });
  } catch (e) {
    console.error("SMTP send failed:", e);
    return json({ error: "No se pudo enviar el mail. Revisá la configuración SMTP de la función." }, 502);
  } finally {
    try {
      await smtp.close();
    } catch (_) {
      // noop
    }
  }

  // 5. Guardar la respuesta en el hilo + marcar el mensaje como leído
  const { data: reply, error: replyErr } = await admin
    .from("contact_message_replies")
    .insert({
      contact_message_id: msg.id,
      sent_by: userId,
      to_email: msg.email,
      subject,
      body: replyBody,
    })
    .select("id, contact_message_id, to_email, subject, body, sent_by, created_at")
    .single();

  if (replyErr) {
    console.error("reply insert failed:", replyErr);
    return json({ error: "El mail salió, pero no se pudo guardar en el historial." }, 500);
  }

  await admin
    .from("contact_messages")
    .update({ is_read: true, read_by: userId })
    .eq("id", msg.id)
    .eq("is_read", false);

  return json({ ok: true, reply });
});
