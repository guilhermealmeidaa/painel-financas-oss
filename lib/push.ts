import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Admin = SupabaseClient<Database>;

export interface PushPayload {
  title: string;
  body: string;
  /** página que abre ao tocar */
  url?: string;
  /** mesma tag substitui a notificação anterior no aparelho */
  tag?: string;
}

let configured: boolean | null = null;
/** Chaves VAPID só no servidor (a pública também é servida por /api/push/key). */
export function pushConfigured(): boolean {
  if (configured != null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  // "subject" do VAPID: o endereço do seu painel (VAPID_SUBJECT ou APP_URL; não precisa de e-mail)
  const subject = process.env.VAPID_SUBJECT ?? process.env.APP_URL;
  if (!subject) return (configured = false);
  webpush.setVapidDetails(subject, pub, priv);
  return (configured = true);
}

/**
 * Envia para todos os aparelhos do usuário. Assinatura que o navegador diz que acabou (404/410) é removida;
 * outras falhas só contam. Devolve quantos aparelhos receberam. Nunca loga o conteúdo.
 */
export async function sendPush(admin: Admin, userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, fail_count").eq("user_id", userId);
  let ok = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
      ok++;
      await admin.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("id", s.id);
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else await admin.from("push_subscriptions").update({ fail_count: s.fail_count + 1 }).eq("id", s.id);
      console.warn(JSON.stringify({ evt: "push_falhou", status: code ?? null }));
    }
  }
  return ok;
}

/**
 * Envia uma vez só por chave (notification_log). Sem aparelho cadastrado, não grava: avisa quando houver.
 */
export async function notifyOnce(admin: Admin, userId: string, key: string, payload: PushPayload): Promise<boolean> {
  const { data: seen } = await admin.from("notification_log").select("key").eq("user_id", userId).eq("key", key).maybeSingle();
  if (seen) return false;
  const sent = await sendPush(admin, userId, { tag: key, ...payload });
  if (!sent) return false;
  await admin.from("notification_log").upsert({ user_id: userId, key });
  return true;
}
