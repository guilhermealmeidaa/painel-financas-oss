import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/user";

/** Cadastra este aparelho para receber notificações (assinatura Web Push do navegador). */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; device?: string } | null;
  const sub = body?.subscription;
  const endpoint = sub?.endpoint ?? "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !sub?.keys?.p256dh || !sub.keys.auth) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 });
  }
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: String(body?.device ?? "").slice(0, 60) || null, fail_count: 0 },
      { onConflict: "endpoint" },
    );
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Remove este aparelho. */
export async function DELETE(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "endpoint obrigatório" }, { status: 400 });
  await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
