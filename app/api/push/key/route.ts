import { NextResponse } from "next/server";
import { connection } from "next/server";

/** Chave pública VAPID (é pública por definição: o navegador precisa dela para assinar). Lida a cada pedido. */
export async function GET() {
  await connection();
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return NextResponse.json({ error: "Notificações ainda não configuradas no servidor (VAPID_PUBLIC_KEY)." }, { status: 503 });
  return NextResponse.json({ publicKey });
}
