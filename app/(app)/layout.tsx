import { cache, Suspense } from "react";
import { connection } from "next/server";
import { AddEntry } from "@/components/add-entry";
import { BottomNav } from "@/components/bottom-nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo-flag";
import { LabelsProvider } from "@/components/labels-provider";
import { bucketLabels } from "@/lib/labels";

/** Uma consulta por request, compartilhada entre sidebar e topo. */
const chromeData = cache(async () => {
  await connection();
  if (DEMO) return { email: "voce@exemplo.com", triageCount: 0, labels: bucketLabels(null) };
  const supabase = await createClient();
  const [{ data }, { count }, { data: settings }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("bucket", "sem_categoria"),
    supabase.from("settings").select("label_lazer, label_mercado").maybeSingle(),
  ]);
  return { email: (data?.claims?.email as string | undefined) ?? "", triageCount: count ?? 0, labels: bucketLabels(settings) };
});

async function SidebarWithUser() {
  const { email, triageCount } = await chromeData();
  return <Sidebar email={email} triageCount={triageCount} />;
}

async function TopBarWithCount() {
  const { triageCount } = await chromeData();
  return <MobileTopBar triageCount={triageCount} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <LabelsProvider labels={chromeData().then((d) => d.labels)}>
    <div className="mx-auto flex max-w-[1440px] gap-4 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
      <Suspense fallback={<div className="hidden w-[232px] shrink-0 lg:block" />}>
        <SidebarWithUser />
      </Suspense>
      <div className="min-w-0 flex-1">
        <Suspense fallback={<MobileTopBar />}>
          <TopBarWithCount />
        </Suspense>
        <main className="flex flex-col gap-4 pb-28 lg:pb-6">{children}</main>
      </div>
      <BottomNav />
      <Suspense>
        <AddEntry />
      </Suspense>
    </div>
    </LabelsProvider>
  );
}
