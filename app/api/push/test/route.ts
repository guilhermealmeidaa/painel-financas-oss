import { NextResponse } from "next/server";
import { pushConfigured, sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/user";

/** Notificação de teste para os aparelhos do usuário logado. */
export async function POST() {
  const { userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Faltam as chaves VAPID no servidor." }, { status: 503 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "servidor sem service role" }, { status: 503 });
  const sent = await sendPush(admin, userId, { title: "Painel de finanças", body: "Notificações ligadas. Os avisos chegam assim.", url: "/notificacoes", tag: "teste" });
  if (!sent) return NextResponse.json({ error: "Nenhum aparelho recebeu. Ative de novo neste aparelho." }, { status: 404 });
  return NextResponse.json({ sent });
}
