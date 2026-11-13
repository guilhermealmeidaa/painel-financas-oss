import { Suspense } from "react";
import { connection } from "next/server";
import { BellRing } from "lucide-react";
import { PageHeader } from "@/components/month-header";
import { NotificationsPanel } from "@/components/notifications-panel";
import { Panel } from "@/components/panel";
import { createClient } from "@/lib/supabase/server";

async function Content() {
  await connection();
  const supabase = await createClient();
  const [{ data: settings }, { count }] = await Promise.all([
    supabase.from("settings").select("notifications").maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
  ]);
  return (
    <Panel title="Avisos no celular" subtitle="contas, ritmo do dia a dia, bancos, assinaturas e o resumo das 21h" icon={BellRing}>
      <NotificationsPanel prefs={(settings?.notifications ?? {}) as Record<string, boolean>} devices={count ?? 0} />
    </Panel>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Notificações" />
      <Suspense fallback={<div className="surface h-64 animate-pulse" />}>
        <Content />
      </Suspense>
    </>
  );
}
