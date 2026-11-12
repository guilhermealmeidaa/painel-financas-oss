import { AddDialog } from "@/components/add-dialog";
import { createClient } from "@/lib/supabase/server";
import { monthOf } from "@/lib/dates";
import { serverToday } from "@/lib/today";
import { DEMO } from "@/lib/demo-flag";

/** Carrega o mínimo para o "+": cartões e o meio padrão do mês atual. */
export async function AddEntry() {
  const today = await serverToday();
  if (DEMO)
    return (
      <AddDialog
        today={today}
        defaultMethod="credito"
        cards={[
          { id: "card-nu", name: "Nubank" },
          { id: "card-inter", name: "Inter" },
          { id: "card-mp", name: "Mercado Pago" },
        ]}
      />
    );
  const supabase = await createClient();
  const [{ data: accounts }, { data: budget }] = await Promise.all([
    supabase.from("accounts").select("id, name").eq("kind", "credit_card").order("name"),
    supabase.from("monthly_budgets").select("method").eq("month", monthOf(today)).maybeSingle(),
  ]);
  return (
    <AddDialog
      today={today}
      defaultMethod={budget?.method === "credito" ? "credito" : "pix"}
      cards={accounts ?? []}
    />
  );
}
