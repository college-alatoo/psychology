// Supabase Edge Function: password-gated API for consent statuses.
// Configure secrets in Supabase Functions settings:
// APP_PASSWORD = a strong shared password (never commit it)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://college-alatoo.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-password",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("APP_PASSWORD");
  const supplied = req.headers.get("x-app-password");
  if (!expected || !supplied || supplied.length > 256 || supplied !== expected) {
    return reply({ error: "Неверный пароль" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply({ error: "Сервер не настроен" }, 500);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (req.method === "GET") {
    const { data, error } = await db
      .from("consent_statuses")
      .select("student_key, consent, updated_at");
    if (error) return reply({ error: "Не удалось загрузить отметки" }, 500);
    return reply({ statuses: data ?? [] });
  }

  let payload: { student_key?: unknown; consent?: unknown };
  try { payload = await req.json(); } catch { return reply({ error: "Некорректный JSON" }, 400); }
  const key = typeof payload.student_key === "string" ? payload.student_key.trim() : "";
  if (!key || key.length > 500 || !(payload.consent === true || payload.consent === false)) {
    return reply({ error: "Нужны student_key и consent (true/false)" }, 400);
  }

  const { data, error } = await db.from("consent_statuses").upsert({
    student_key: key,
    consent: payload.consent,
    updated_at: new Date().toISOString(),
    updated_by: null,
  }, { onConflict: "student_key" }).select("student_key, consent, updated_at").single();

  if (error) return reply({ error: "Не удалось сохранить отметку" }, 500);
  return reply({ status: data });
});
