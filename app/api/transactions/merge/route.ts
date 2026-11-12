import { NextResponse } from "next/server";
import { mergeManual, unmergeManual } from "@/lib/merge-writer";
import { requireUser } from "@/lib/supabase/user";

/**
 * POST { manualId, bankIds: [...] }   junta 1 lançamento manual com N transações do banco (não apaga nada)
 * POST { manualId, bankId }           atalho para 1:1
 * POST { manualId, undo: true }       desfaz a junção
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const manualId = String(body?.manualId ?? "");
  try {
    if (body?.undo) {
      await unmergeManual(supabase, userId, manualId);
      return NextResponse.json({ ok: true });
    }
    const bankIds: string[] = Array.isArray(body?.bankIds) ? body.bankIds.map(String) : body?.bankId ? [String(body.bankId)] : [];
    if (!manualId || !bankIds.length || bankIds.length > 6) return NextResponse.json({ error: "Par inválido" }, { status: 400 });
    await mergeManual(supabase, userId, manualId, bankIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
