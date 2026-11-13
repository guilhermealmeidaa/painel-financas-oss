import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { billsForMonth } from "@/lib/bills";
import { budgetStatus } from "@/lib/budget";
import { bankBalance, invoiceInputs, loadAllFor, runProjection, type AllData } from "@/lib/data";
import { addDays, addMonths, monthOf, monthRange, monthsBetween, todayISO } from "@/lib/dates";
import { installmentsFromInvoices, invoicesForMonth, prepareInvoices } from "@/lib/invoices";
import { METHOD_LABEL, bucketLabels } from "@/lib/labels";
import { countsInDaily, installmentAmountInMonth, installmentEndMonth } from "@/lib/projection";
import { createAdminClient } from "@/lib/supabase/admin";
import { findDuplicates } from "@/lib/duplicates";
import { dailyDetail, healthReport, invoiceDetail } from "@/lib/mcp/views";
import { billCyclePayments } from "@/lib/cards";
import { decodeCursor, encodeCursor, incomesReport, matches, subscriptionStats, upcomingDue, type DueItem } from "@/lib/mcp/phase2";
import { simulatePurchase } from "@/lib/simulate";
import { monthSchedule } from "@/lib/schedule";
import { buildGasto, remainingFor, scopesOf } from "@/lib/mcp/write";

/**
 * Ferramentas para o Claude responder perguntas sobre as finanças. Todas são SOMENTE LEITURA, exceto
 * lancar_gasto (exige token com escopo "write"), que só CRIA um lançamento manual: nunca edita nem apaga.
 * Valores em reais (número com 2 casas).
 */

const reais = (cents: number) => Math.round(cents) / 100;
const MONTH = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "use AAAA-MM")
  .describe("Mês no formato AAAA-MM (ex.: 2026-12). Padrão: mês atual em São Paulo.");

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

function userOf(ctx: Ctx) {
  const userId = ctx.http?.authInfo?.extra?.userId;
  if (typeof userId !== "string") throw new Error("não autorizado");
  const admin = createAdminClient();
  if (!admin) throw new Error("servidor sem SUPABASE_SERVICE_ROLE_KEY");
  return { userId, admin };
}

async function dataFor(ctx: Ctx): Promise<AllData> {
  const { userId, admin } = userOf(ctx);
  return loadAllFor(admin, userId);
}

/** Versão no ar: commit (Vercel) + data do build. */
export function versao() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  return `${sha} (${(process.env.BUILD_TIME ?? "").slice(0, 16).replace("T", " ") || "dev"} UTC)`;
}
/** Agora em São Paulo, AAAA-MM-DDTHH:mm:ss-03:00. */
function geradoEm() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}-03:00`;
}
const json = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(
        value && typeof value === "object" && !Array.isArray(value) ? { gerado_em: geradoEm(), versao: versao(), ...value } : value,
        null,
        2,
      ),
    },
  ],
});
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
/**
 * Cartão pelo nome que você deu OU pelo nome original da Pluggy (ex.: "GOLD" → "Cartão do dia a dia").
 * Igualdade exata primeiro, depois "contém".
 */
function matchCardId(accounts: { id: string; name: string; pluggy_name?: string | null }[], query: string): string | null {
  const q = query.trim().toLowerCase();
  const names = (a: (typeof accounts)[number]) => [a.name, a.pluggy_name ?? ""].map((n) => n.trim().toLowerCase()).filter(Boolean);
  return (accounts.find((a) => names(a).includes(q)) ?? accounts.find((a) => names(a).some((n) => n.includes(q))))?.id ?? null;
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");
const toMonth = (m?: string) => (m ? `${m}-01` : monthOf(todayISO()));

export function registerFinanceTools(server: McpServer) {
  registerDiagnosticTools(server);
  registerDailyTools(server);
  registerWriteTools(server);

  server.registerTool(
    "resumo_do_mes",
    {
      title: "Resumo do mês",
      description:
        "Visão geral de um mês: saldo previsto no fim do mês, entradas, fixos, fatura do crédito, parcelas, " +
        "dia a dia (teto, gasto, sobra por bucket lazer/mercado, ritmo por fim de semana) e contas a pagar. " +
        "Use para perguntas como 'quanto ainda posso gastar?' ou 'como fecha dezembro?'.",
      inputSchema: z.object({ mes: MONTH.optional() }),
      annotations: READ_ONLY,
    },
    async ({ mes }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const today = todayISO();
      const month = toMonth(mes);
      const rows = runProjection(d);
      const row = rows.find((r) => r.month === month);
      const budget = d.budgets.find((b) => b.month === month);
      const status = budget ? budgetStatus(budget, d.transactions, today) : null;
      const { bills, total, paidTotal } = billsForMonth({ ...invoiceInputs(d), month, payments: d.payments });
      const pending = d.transactions.filter((t) => monthOf(t.occurred_on) === month && t.bucket === "sem_categoria");
      return json({
        mes: month.slice(0, 7),
        hoje: today,
        valores_em: "reais",
        projecao: row
          ? {
              ...(row.opening != null
                ? {
                    saldo_hoje_nas_contas: reais(row.opening),
                    como_calcula:
                      "mês atual: saldo de hoje + entradas que ainda não caíram − fixos e faturas não pagos − dia a dia no débito/Pix que falta",
                  }
                : {}),
              saldo_no_fim_do_mes: reais(row.balance),
              resultado_do_mes_sozinho: reais(row.net),
              entradas: reais(row.income),
              fixos_fora_do_cartao: reais(row.fixed),
              faturas_dos_cartoes: reais(row.creditInvoice),
              fixos_avulsos_e_assinaturas_na_conta: reais(row.extras),
              dia_a_dia_debito_pix: reais(row.daily),
              alertas: { mes_negativo: row.alerts.negativeMonth, saldo_abaixo_de_500: row.alerts.lowBalance },
            }
          : "mês fora do período da projeção",
        dia_a_dia: status
          ? {
              meio: budget!.method === "credito" ? "crédito (vai pra fatura do mês seguinte)" : "débito/Pix",
              conta_a_partir_de: budget!.control_start ?? month,
              regra: "lazer e mercado, do início do controle até hoje (compras com data futura ainda não contam)",
              teto: reais(status.cap),
              gasto: reais(status.spent),
              ainda_posso_gastar: reais(status.remaining),
              por_bucket: status.buckets.map((b) => ({
                bucket: bucketLabels(d.settings)[b.bucket],
                orcado: reais(b.budgeted),
                gasto: reais(b.spent),
                sobra: reais(b.remaining),
              })),
              ...(status.periods.length
                ? {
                    periodos_especiais: status.periods.map((p) => ({
                      nome: p.name,
                      de: p.start,
                      ate: p.end,
                      teto: reais(p.cap),
                      gasto: reais(p.spent),
                      sobra: reais(p.remaining),
                    })),
                    fora_dos_periodos: {
                      ainda_posso_gastar: reais(status.normalRemaining),
                      regra: "teto do mês − tetos dos períodos − gasto fora deles − o que os períodos estouraram; os fins de semana dos períodos não entram no ritmo",
                    },
                  }
                : {}),
              fins_de_semana_restantes: status.weekends,
              ...(budget!.skipped_weekends.length ? { fins_de_semana_sem_gasto: budget!.skipped_weekends } : {}),
              por_fim_de_semana: status.perWeekend ? reais(status.perWeekend.total) : null,
              ...(status.perWeekend
                ? { por_fim_de_semana_por_bucket: Object.fromEntries(Object.entries(status.perWeekend.byBucket).map(([k, v]) => [bucketLabels(d.settings)[k as keyof ReturnType<typeof bucketLabels>], reais(v ?? 0)])) }
                : {}),
            }
          : "sem orçamento cadastrado para o mês",
        sem_categoria_fora_da_conta: {
          aviso: "gastos do banco ainda não classificados; NÃO entram no dia a dia nem na projeção até serem classificados",
          quantidade: pending.length,
          total: reais(pending.reduce((s, t) => s + t.amount_cents, 0)),
        },
        contas_a_pagar: {
          total: reais(total),
          ja_pagas: reais(paidTotal),
          itens: bills.map((b) => ({ nome: b.name, valor: reais(b.cents), paga: b.paid })),
        },
      });
    },
  );

  server.registerTool(
    "projecao",
    {
      title: "Projeção mês a mês",
      description:
        "Saldo projetado na conta mês a mês (entradas, fixos, faturas dos cartões, dia a dia no débito/Pix, " +
        "resultado do mês e saldo acumulado), com alertas de mês negativo e saldo abaixo de R$ 500.",
      inputSchema: z.object({
        incluir_planejadas: z.boolean().optional().describe("Incluir compras ainda só planejadas (ex.: presente)."),
      }),
      annotations: READ_ONLY,
    },
    async ({ incluir_planejadas }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const rows = runProjection(d, incluir_planejadas ?? false);
      return json({
        valores_em: "reais",
        incluiu_planejadas: incluir_planejadas ?? false,
        planejadas: d.installments.filter((i) => i.status === "planejada").map((i) => i.name),
        meses: rows.map((r) => ({
          mes: r.month.slice(0, 7),
          ...(r.opening != null ? { saldo_hoje_nas_contas: reais(r.opening), observacao: "mês atual: só o que ainda falta acontecer" } : {}),
          entradas: reais(r.income),
          fixos_fora_do_cartao: reais(r.fixed),
          faturas_dos_cartoes: reais(r.creditInvoice),
          fixos_avulsos_e_assinaturas_na_conta: reais(r.extras),
          dia_a_dia_debito_pix: reais(r.daily),
          dia_a_dia_no_credito: reais(r.dailyOnCredit),
          resultado_do_mes: reais(r.net),
          saldo_no_fim: reais(r.balance),
          mes_negativo: r.alerts.negativeMonth,
          saldo_abaixo_de_500: r.alerts.lowBalance,
        })),
      });
    },
  );

  server.registerTool(
    "transacoes",
    {
      title: "Transações",
      description:
        "Lista gastos e lançamentos (manuais e do banco), do mais recente para o mais antigo, com paginação (cursor). " +
        "Filtros: período, bucket, texto, conta, origem (manual/pluggy), valor mínimo/máximo, status do banco e parcelas futuras. " +
        "Cada item traz motivo_auto (o que o painel decidiu sozinho) e juntado_com (ids ligados). Use para conferir gastos item a item.",
      inputSchema: z.object({
        de: DATE.optional().describe("Data inicial AAAA-MM-DD"),
        ate: DATE.optional().describe("Data final AAAA-MM-DD"),
        bucket: z.enum(["lazer", "mercado", "fixo", "assinatura", "parcela", "ignorar", "sem_categoria"]).optional(),
        busca: z.string().max(60).optional().describe("Trecho da descrição (sem acento e sem diferenciar maiúsculas)"),
        conta: z.string().max(60).optional().describe("Conta ou cartão (nome ou parte do nome)"),
        origem: z.enum(["manual", "pluggy"]).optional().describe("manual = lançado por você; pluggy = veio do banco"),
        valor_min: z.number().min(0).optional().describe("Valor mínimo em reais"),
        valor_max: z.number().min(0).optional().describe("Valor máximo em reais"),
        status: z.enum(["PENDING", "POSTED"]).optional().describe("Status no banco"),
        incluir_futuras: z.boolean().optional().describe("Incluir lançamentos com data depois de hoje, como parcelas futuras (padrão: não)"),
        limite: z.number().int().min(1).max(300).optional().describe("Itens por página (padrão 100, máximo 300)"),
        cursor: z.string().max(40).optional().describe("Valor de proximo_cursor da página anterior"),
      }),
      annotations: READ_ONLY,
    },
    async ({ de, ate, bucket, busca, conta, origem, valor_min, valor_max, status, incluir_futuras, limite, cursor }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const names = new Map(d.accounts.map((a) => [a.id, a.name.trim()]));
      const hoje = todayISO();
      const contaIds = conta ? new Set(d.accounts.filter((a) => matches(a.name, conta)).map((a) => a.id)) : null;
      const min = valor_min != null ? Math.round(valor_min * 100) : null;
      const max = valor_max != null ? Math.round(valor_max * 100) : null;
      const list = d.transactions.filter(
        (t) =>
          (!de || t.occurred_on >= de) &&
          (!ate || t.occurred_on <= ate) &&
          (incluir_futuras || t.occurred_on <= hoje) &&
          (!bucket || t.bucket === bucket) &&
          matches(t.description, busca) &&
          (!contaIds || (t.account_id != null && contaIds.has(t.account_id))) &&
          (!origem || t.source === origem) &&
          (min == null || t.amount_cents >= min) &&
          (max == null || t.amount_cents <= max) &&
          (!status || t.pluggy_status === status),
      );
      const pageSize = limite ?? 100;
      const offset = decodeCursor(cursor);
      const shown = list.slice(offset, offset + pageSize);
      const next = offset + pageSize < list.length ? encodeCursor(offset + pageSize) : null;
      // ligações: banco → manual (manual_id) e manual → bancos que apontam para ele; Pix no crédito/pagamentos (linked_tx_id)
      const byManual = new Map<string, string[]>();
      for (const t of d.transactions) if (t.manual_id) byManual.set(t.manual_id, [...(byManual.get(t.manual_id) ?? []), t.id]);
      const linkedTo = new Map<string, string[]>();
      for (const t of d.transactions) if (t.linked_tx_id) linkedTo.set(t.linked_tx_id, [...(linkedTo.get(t.linked_tx_id) ?? []), t.id]);
      const counts = (t: (typeof list)[number]) => {
        const m = monthOf(t.occurred_on);
        const b = d.budgets.find((x) => x.month === m);
        return countsInDaily(t, { month: m, controlStart: b?.control_start ?? null, today: hoje });
      };
      return json({
        valores_em: "reais",
        total_encontrado: list.length,
        pagina: { inicio: offset, itens: shown.length, proximo_cursor: next },
        soma: reais(list.filter((t) => !t.is_inflow).reduce((s, t) => s + t.amount_cents, 0)),
        soma_que_conta_no_dia_a_dia: reais(list.filter(counts).reduce((s, t) => s + t.amount_cents, 0)),
        itens: shown.map((t) => {
          const juntado = [...new Set([...(t.manual_id ? [t.manual_id] : []), ...(byManual.get(t.id) ?? []), ...(t.linked_tx_id ? [t.linked_tx_id] : []), ...(linkedTo.get(t.id) ?? [])])];
          return {
            id: t.id,
            data: t.occurred_on,
            descricao: t.description,
            valor: reais(t.amount_cents),
            entrada: t.is_inflow,
            meio: METHOD_LABEL[t.method],
            bucket: bucketLabels(d.settings)[t.bucket],
            conta: t.account_id ? (names.get(t.account_id) ?? null) : null,
            parcela: t.total_installments ? `${t.installment_number ?? "?"}/${t.total_installments}` : null,
            // origem "manual" + do_banco=true: lançamento seu já juntado com a compra do banco (conta 1 vez)
            origem: t.source,
            do_banco: Boolean(t.external_id),
            status: t.pluggy_status,
            motivo_auto: t.auto_reason ?? null,
            juntado_com: juntado,
            conta_no_dia_a_dia: counts(t),
            criado_em: t.created_at,
          };
        }),
      });
    },
  );

  server.registerTool(
    "possiveis_duplicatas",
    {
      title: "Possíveis gastos repetidos",
      description:
        "Procura pares de transações que parecem o MESMO gasto contado duas vezes: mesmo valor (até 2% ou R$ 1 de diferença), " +
        "datas a até 3 dias, ambas saídas e não ignoradas. Mostra por que cada par é suspeito " +
        "(manual × banco, mesmo id no banco, PENDING × POSTED, contas diferentes). Use para investigar números estranhos.",
      inputSchema: z.object({
        de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Data inicial AAAA-MM-DD (padrão: 1º dia do mês atual)"),
        ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Data final AAAA-MM-DD"),
        incluir_parcelas: z.boolean().optional().describe("Incluir bucket 'parcela' (padrão: não)"),
      }),
      annotations: READ_ONLY,
    },
    async ({ de, ate, incluir_parcelas }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const names = new Map(d.accounts.map((a) => [a.id, a.name]));
      const from = de ?? monthOf(todayISO());
      const txs = d.transactions.filter(
        (t) =>
          t.occurred_on >= from &&
          (!ate || t.occurred_on <= ate) &&
          !t.is_inflow &&
          t.bucket !== "ignorar" &&
          (incluir_parcelas || t.bucket !== "parcela"),
      );
      const view = (t: (typeof txs)[number]) => ({
        id: t.id,
        data: t.occurred_on,
        descricao: t.description,
        valor: reais(t.amount_cents),
        bucket: bucketLabels(d.settings)[t.bucket],
        meio: METHOD_LABEL[t.method],
        conta: t.account_id ? (names.get(t.account_id) ?? null) : null,
        origem: t.source,
        do_banco: Boolean(t.external_id),
        status: t.pluggy_status,
        parcela: t.total_installments ? `${t.installment_number ?? "?"}/${t.total_installments}` : null,
      });
      // regra 8: só pares com evidência forte; Pix no crédito, juntados e substituídos ficam de fora
      const pares = findDuplicates(txs, { includeInstallments: incluir_parcelas }).map((p) => ({
        diferenca: reais(p.diff),
        motivos: p.reasons,
        a: view(p.a as (typeof txs)[number]),
        b: view(p.b as (typeof txs)[number]),
      }));
      return json({
        periodo: { de: from, ate: ate ?? null },
        transacoes_analisadas: txs.length,
        pares_suspeitos: pares.length,
        observacao:
          "Só aparecem pares com evidência forte: mesma pessoa/loja, manual × banco, mesmo id ou PENDING × POSTED na mesma conta. " +
          "Pix no crédito (conta × cartão) já é tratado automaticamente e não aparece aqui.",
        pares: pares.slice(0, 100),
      });
    },
  );

  server.registerTool(
    "faturas",
    {
      title: "Faturas dos cartões",
      description:
        "Fatura prevista (ou real, quando o banco já fechou) de cada cartão num mês de vencimento, com as linhas que compõem o valor, " +
        "além do limite disponível quando vem da Pluggy. Aceita filtrar por um cartão (nome ou nome original da Pluggy).",
      inputSchema: z.object({
        mes: MONTH.optional(),
        cartao: z.string().optional().describe("Só este cartão (nome ou nome original da Pluggy)"),
      }),
      annotations: READ_ONLY,
    },
    async ({ mes, cartao }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const month = toMonth(mes);
      const all = invoicesForMonth({ ...invoiceInputs(d), month });
      const only = cartao ? matchCardId(d.accounts, cartao) : null;
      const inv = cartao ? { ...all, cards: all.cards.filter((c) => c.accountId === only), total: all.cards.filter((c) => c.accountId === only).reduce((s, c) => s + c.total, 0) } : all;
      return json({
        mes_de_vencimento: month.slice(0, 7),
        valores_em: "reais",
        total: reais(inv.total),
        alertas: [
          ...(inv.unlinkedSeedCards.length
            ? [`Cartões não ligados ao banco: ${inv.unlinkedSeedCards.join(", ")}. A estimativa deles NÃO entra; só o dado real dos cartões do banco.`]
            : []),
          ...(inv.seedNotFound.length ? [`Parcelas do plano ainda sem par no banco (entram como estimativa até casar): ${inv.seedNotFound.join(", ")}.`] : []),
        ],
        cartoes: inv.cards.map((c) => {
          const acc = d.accounts.find((a) => a.id === c.accountId);
          return {
            cartao: c.name,
            nome_no_banco: acc?.pluggy_name ?? null,
            total: reais(c.total),
            valor_real_do_banco: Boolean(c.real),
            origem: c.accountId === "reserva" ? "reserva do teto (estimativa; some quando o mês fechar)" : c.accountId === "plano" ? "parcelas do plano sem par no banco (estimativa)" : c.real ? "fatura fechada do banco" : c.fromBank ? "compras reais do banco (fatura aberta)" : "estimativa (sem banco conectado)",
            composicao: c.lines.map((l) => ({ item: l.label, valor: reais(l.cents) })),
            limite_disponivel: acc?.available_limit_cents != null ? reais(acc.available_limit_cents) : null,
            limite_total: acc?.credit_limit_cents != null ? reais(acc.credit_limit_cents) : null,
            vencimento: acc?.bill_due_date ?? null,
          };
        }),
      });
    },
  );

  server.registerTool(
    "parcelas",
    {
      title: "Compras parceladas",
      description: "Compras parceladas (ativas e planejadas): valor da parcela, cartão, quantas faltam, mês em que terminam e o total comprometido nos próximos 12 meses.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const month = monthOf(todayISO());
      const names = new Map(d.accounts.map((a) => [a.id, a.name]));
      const active = d.installments.filter((p) => p.status === "ativa" && !p.covered_by_bank);
      const inputs = invoiceInputs(d);
      const prep = prepareInvoices(inputs);
      return json({
        valores_em: "reais",
        compras: d.installments
          .filter((p) => p.status !== "quitada")
          .map((p) => {
            const paid = Math.max(0, Math.min(p.installments_count, monthsBetween(p.first_invoice_month, month)));
            return {
              nome: p.name,
              status: p.status,
              coberta_pelo_banco: p.covered_by_bank,
              cartao: p.account_id ? (names.get(p.account_id) ?? null) : "não informado",
              parcela: reais(p.installment_cents),
              parcelas: p.installments_count,
              restantes: p.installments_count - paid,
              primeira_fatura: p.first_invoice_month.slice(0, 7),
              ultima_fatura: installmentEndMonth(p).slice(0, 7),
              observacao: p.notes,
            };
          }),
        // mesma fonte das faturas: parcelas reais do banco (e calculadas); estimativa só sem banco conectado
        proximos_12_meses: monthRange(month, addMonths(month, 11)).map((m) => {
          const inv = invoicesForMonth({ ...inputs, month: m }, prep);
          return { mes: m.slice(0, 7), parcelas_nos_cartoes: reais(installmentsFromInvoices(inv)), parcelas_do_plano_ativas: reais(active.reduce((s, p) => s + installmentAmountInMonth(p, m), 0)) };
        }),
      });
    },
  );

  server.registerTool(
    "contas",
    {
      title: "Contas e cartões",
      description: "Contas e cartões cadastrados, com saldo, limite e datas de fechamento/vencimento quando vêm do banco (Pluggy).",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => {
      const d = await dataFor(ctx as Ctx);
      return json({
        valores_em: "reais",
        contas: d.accounts.map((a) => ({
          nome: a.name,
          tipo: a.kind === "credit_card" ? "cartão" : "conta",
          conectada_ao_banco: Boolean(a.pluggy_account_id),
          saldo: a.balance_cents != null ? reais(a.balance_cents) : null,
          limite_total: a.credit_limit_cents != null ? reais(a.credit_limit_cents) : null,
          limite_disponivel: a.available_limit_cents != null ? reais(a.available_limit_cents) : null,
          fechamento: a.bill_close_date,
          vencimento: a.bill_due_date,
          atualizado_em: a.synced_at,
        })),
      });
    },
  );
}

// ================= Fase 1: diagnóstico e transparência =================

function registerDiagnosticTools(server: McpServer) {
  server.registerTool(
    "saude",
    {
      title: "Saúde dos dados",
      description:
        "Diagnóstico do painel: versão no ar, último sync de cada conta (ok/erro/atrasado), gastos sem categoria, " +
        "parcelas do plano sem par no banco, lançamentos manuais sem a transação do banco e faturas já pagas cujo valor " +
        "reconstruído não bate com o pago. USE PRIMEIRO quando um número parecer estranho ou antes de uma análise longa.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => {
      const { userId, admin } = userOf(ctx as Ctx);
      const [d, { data: items }] = await Promise.all([
        loadAllFor(admin, userId),
        admin.from("pluggy_items").select("item_id, connector_name, status, last_synced_at").eq("user_id", userId),
      ]);
      const today = todayISO();
      const inputs = invoiceInputs(d);
      const prep = prepareInvoices(inputs);
      const since = addMonths(monthOf(today), -3);
      const cardPayments = d.transactions.filter((t) => t.is_inflow && t.auto_reason === "pagamento_fatura");
      const paidBills = d.cardBills
        .filter((b) => b.status === "paga" && b.due_date >= since)
        .map((b) => {
          const prevDue =
            d.cardBills
              .filter((x) => x.account_id === b.account_id && x.due_date < b.due_date)
              .map((x) => x.due_date)
              .sort()
              .at(-1) ?? null;
          const pays = billCyclePayments(b, prevDue, cardPayments.filter((p) => p.account_id === b.account_id));
          const month = monthOf(b.due_date);
          const card = invoicesForMonth({ ...inputs, month }, prep).cards.find((c) => c.accountId === b.account_id);
          const reconstructed = (card?.lines ?? [])
            .flatMap((l) => l.items ?? [])
            .filter((i) => i.origin === "banco" && i.id)
            .reduce((s, i) => s + i.cents, 0);
          const paid = pays.length ? pays.reduce((s, p) => s + p.amount_cents, 0) : (b.paid_cents ?? 0);
          return {
            account_id: b.account_id,
            due_date: b.due_date,
            paid_cents: paid,
            reconstructed_cents: reconstructed,
            payments: pays.map((p) => ({ id: p.id, data: p.occurred_on, valor: reais(p.amount_cents) })),
          };
        });
      // sem pagamento encontrado no ciclo (fatura zerada ou anterior à janela do sync): não diz nada
      const paidBillsWithPayment = paidBills.filter((b) => b.paid_cents > 0);
      return json({
        hoje: today,
        valores_em: "reais",
        ...healthReport({
          now: new Date(),
          today,
          accounts: d.accounts,
          items: items ?? [],
          transactions: d.transactions,
          installments: d.installments,
          coveredInstallmentIds: new Set(prep.covered.keys()),
          paidBills: paidBillsWithPayment,
        }),
      });
    },
  );

  server.registerTool(
    "detalhe_fatura",
    {
      title: "Detalhe da fatura de um cartão",
      description:
        "Abre a fatura de UM cartão num mês de vencimento: para cada linha da composição (Compras, Parcelas, Parcelas calculadas, " +
        "Assinaturas projetadas, Parcelas do plano, Reserva do teto) lista os itens com id, data, descrição, valor, parcela n/total e " +
        "origem (banco/calculada/projetada/plano/estimativa). Os itens somam exatamente a linha. Traz também o valor que o banco " +
        "informou, se a fatura está paga e os ids dos pagamentos casados. Use quando perguntarem 'de onde vem esse valor?'.",
      inputSchema: z.object({
        cartao: z.string().min(1).describe("Nome do cartão ou parte dele — aceita também o nome original da Pluggy (ex.: GOLD, PLATINUM)"),
        mes: MONTH.optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ cartao, mes }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const month = toMonth(mes);
      const inputs = invoiceInputs(d);
      const inv = invoicesForMonth({ ...inputs, month });
      const accId = matchCardId(d.accounts, cartao);
      const q = cartao.trim().toLowerCase();
      const card = (accId ? inv.cards.find((c) => c.accountId === accId) : undefined) ?? inv.cards.find((c) => c.name.toLowerCase().includes(q));
      if (!card) {
        return json({ mes_de_vencimento: month.slice(0, 7), erro: `Nenhuma fatura de "${cartao}" neste mês.`, cartoes_com_fatura: inv.cards.map((c) => c.name) });
      }
      const bills = d.cardBills.filter((b) => b.account_id === card.accountId && b.due_date.startsWith(month.slice(0, 7)));
      const { bills: due } = billsForMonth({ ...inputs, month, payments: d.payments });
      const key = `card:${card.accountId ?? "none"}`;
      const paymentIds = [
        ...bills.map((b) => b.payment_tx_id).filter((x): x is string => Boolean(x)),
        ...d.payments.filter((p) => p.month === month && p.key === key && p.transaction_id).map((p) => p.transaction_id!),
      ];
      return json({
        mes_de_vencimento: month.slice(0, 7),
        valores_em: "reais",
        ...invoiceDetail(card, { bills, paid: due.find((b) => b.key === key)?.paid ?? false, paymentIds: [...new Set(paymentIds)] }),
      });
    },
  );

  server.registerTool(
    "detalhe_dia_a_dia",
    {
      title: "Detalhe do dia a dia",
      description:
        "Lista TODAS as transações que entram no gasto do dia a dia (lazer/mercado) do mês, com id, data, descrição, valor, conta, " +
        "meio e origem, e o total por bucket. O total é exatamente o 'gasto' do resumo_do_mes. Use para explicar o 'ainda posso gastar' " +
        "ou achar um gasto que não deveria contar.",
      inputSchema: z.object({ mes: MONTH.optional() }),
      annotations: READ_ONLY,
    },
    async ({ mes }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const month = toMonth(mes);
      const names = new Map(d.accounts.map((a) => [a.id, a.name]));
      const budget = d.budgets.find((b) => b.month === month) ?? null;
      return json({
        valores_em: "reais",
        ...dailyDetail(
          {
            month,
            today: todayISO(),
            budget,
            transactions: d.transactions,
            accountName: (id) => (id ? (names.get(id) ?? null) : null),
          },
          bucketLabels(d.settings),
        ),
      });
    },
  );
}

// ================= Fase 2: perguntas do dia a dia =================


function findCard(d: AllData, name?: string) {
  if (!name) return null;
  const cards = d.accounts.filter((a) => a.kind === "credit_card");
  const id = matchCardId(cards, name);
  return id ? cards.find((a) => a.id === id) : undefined;
}

function registerDailyTools(server: McpServer) {
  server.registerTool(
    "simular_compra",
    {
      title: "Simular uma compra",
      description:
        "Responde 'cabe comprar X?' SEM gravar nada. À vista (parcelas=1): impacto no 'ainda posso gastar' do mês e na projeção. " +
        "Parcelado: aloca as parcelas nas faturas do cartão (pelo fechamento) e devolve a projeção antes × depois mês a mês, " +
        "meses negativos e meses abaixo de R$ 500 no cenário depois (e quais são novos). Parcelado exige o cartão.",
      inputSchema: z.object({
        valor_total: z.number().positive().max(1_000_000).describe("Valor total da compra em reais"),
        parcelas: z.number().int().min(1).max(48).describe("Número de parcelas (1 = à vista)"),
        cartao: z.string().optional().describe("Cartão (nome ou parte). Sem cartão = débito/Pix"),
        data: DATE.optional().describe("Data da compra AAAA-MM-DD (padrão: hoje)"),
        bucket: z.enum(["lazer", "mercado", "fixo", "assinatura", "parcela"]).optional().describe("Categoria (padrão: lazer à vista, parcela se parcelado)"),
      }),
      annotations: READ_ONLY,
    },
    async ({ valor_total, parcelas, cartao, data, bucket }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const card = findCard(d, cartao);
      if (cartao && !card) return json({ erro: `Cartão "${cartao}" não encontrado.`, cartoes: d.accounts.filter((a) => a.kind === "credit_card").map((a) => a.name.trim()) });
      if (parcelas > 1 && !card) return json({ erro: "Compra parcelada precisa do cartão." });
      const today = todayISO();
      return json({
        valores_em: "reais",
        aviso: "simulação: nada foi gravado",
        ...simulatePurchase(d, {
          totalCents: Math.round(valor_total * 100),
          parcelas,
          cardId: card?.id ?? null,
          date: data ?? today,
          bucket: bucket ?? (parcelas > 1 ? "parcela" : "lazer"),
          today,
        }),
      });
    },
  );

  server.registerTool(
    "proximos_vencimentos",
    {
      title: "Próximos vencimentos",
      description:
        "Fixos e faturas NÃO pagos que vencem nos próximos dias, em ordem de data: valor, vencimento, se é débito automático e " +
        "saldo_cobre (saldo de hoje + entradas previstas até a data − vencimentos anteriores). Quando não cobre, diz quanto falta. " +
        "Use para 'tenho dinheiro para pagar as contas da semana?'.",
      inputSchema: z.object({ dias: z.number().int().min(1).max(62).optional().describe("Quantos dias à frente (padrão 7)") }),
      annotations: READ_ONLY,
    },
    async ({ dias }, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const today = todayISO();
      const until = addDays(today, dias ?? 7);
      // mesma agenda do Calendário (lib/schedule): faturas e fixos não pagos; entradas previstas com data provável
      const items: DueItem[] = [];
      for (const month of [...new Set([monthOf(today), monthOf(until)])]) {
        for (const x of monthSchedule(d, month, today)) {
          if (x.type === "saida" && !x.paid) items.push({ name: x.name, cents: x.cents, due: x.date, autoDebit: x.autoDebit, kind: x.kind as DueItem["kind"] });
        }
      }
      const incomes = monthSchedule(d, monthOf(today), today)
        .filter((x) => x.type === "entrada" && !x.paid)
        .map((x) => ({ description: x.name, cents: x.cents, date: x.date && x.date >= today ? x.date : null }));
      const bal = bankBalance(d);
      return json({
        hoje: today,
        valores_em: "reais",
        observacao: "entradas sem data conhecida não entram no 'saldo_cobre' (conta conservadora)",
        ...upcomingDue({ today, days: dias ?? 7, balanceCents: bal?.cents ?? 0, items, incomes }),
      });
    },
  );

  server.registerTool(
    "assinaturas",
    {
      title: "Assinaturas",
      description:
        "Assinaturas detectadas nos últimos 120 dias em QUALQUER categoria (inclusive Ignorar e lançamentos manuais juntados): " +
        "serviços conhecidos (ChatGPT, Claude, Spotify, Apple, Amazon Prime…) e cobranças que se repetem todo mês. " +
        "Nome, último débito e valor, valor médio, cartão, frequência, total mensal, quais AUMENTARAM de preço e cobranças avulsas. " +
        "Use para 'quanto gasto com assinaturas?' ou 'alguma ficou mais cara?'.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => {
      const d = await dataFor(ctx as Ctx);
      const names = new Map(d.accounts.map((a) => [a.id, a.name.trim()]));
      const today = todayISO();
      const charges = d.transactions.map((t) => ({
        id: t.id,
        occurred_on: t.occurred_on,
        description: t.description,
        amount_cents: t.amount_cents,
        account: t.account_id ? (names.get(t.account_id) ?? null) : null,
        auto_reason: t.auto_reason,
        bucket: t.bucket,
        is_inflow: t.is_inflow,
        total_installments: t.total_installments,
      }));
      return json({ valores_em: "reais", ...subscriptionStats(charges, today) });
    },
  );

  server.registerTool(
    "entradas",
    {
      title: "Entradas do mês",
      description:
        "Entradas previstas (salário, 13º, cadastradas) × recebidas (banco), com status recebida/pendente e quanto falta receber. " +
        "Entradas do banco sem par ainda não confirmadas aparecem separadas. Use para 'o salário já caiu?'.",
      inputSchema: z.object({ mes: MONTH.optional() }),
      annotations: READ_ONLY,
    },
    async ({ mes }, ctx) => {
      const { userId, admin } = userOf(ctx as Ctx);
      const month = toMonth(mes);
      const [d, { data: rows }] = await Promise.all([
        loadAllFor(admin, userId),
        admin.from("incomes").select("id, description, amount_cents, kind, source, status, transaction_id").eq("user_id", userId).eq("month", month),
      ]);
      const txById = new Map(d.transactions.map((t) => [t.id, t]));
      return json({
        mes: month.slice(0, 7),
        valores_em: "reais",
        ...incomesReport(
          (rows ?? []).filter((r) => r.status !== "substituida"),
          (id) => (id ? (txById.get(id)?.occurred_on ?? null) : null),
        ),
      });
    },
  );
}

function registerWriteTools(server: McpServer) {
  server.registerTool(
    "lancar_gasto",
    {
      title: "Lançar um gasto",
      description:
        "ÚNICA ferramenta que grava: cria UM lançamento manual de gasto (como o '+ Gasto' do painel). Não edita nem apaga nada. " +
        "Use só quando o usuário pedir para lançar/anotar um gasto que JÁ aconteceu; para 'cabe comprar?' use simular_compra. " +
        "Exige token com permissão de escrita. Passe sempre uma 'chave' única por gasto (ex.: um UUID): repetir a mesma chave " +
        "não duplica, devolve o lançamento já feito. Quando a compra aparecer no banco, o painel junta os dois sozinho. " +
        "Devolve o novo 'ainda posso gastar' do mês.",
      inputSchema: z.object({
        valor: z.number().positive().max(100_000).describe("Valor em reais"),
        descricao: z.string().min(1).max(120).describe("O que foi (ex.: 'Almoço de domingo')"),
        data: DATE.optional().describe("Data do gasto AAAA-MM-DD (padrão: hoje; não aceita futuro nem mais de 90 dias atrás)"),
        bucket: z.enum(["lazer", "mercado", "fixo", "assinatura"]).optional().describe("Categoria (padrão: lazer)"),
        meio: z.enum(["credito", "debito", "pix"]).optional().describe("Meio de pagamento (padrão: o do dia a dia do mês)"),
        cartao: z.string().max(60).optional().describe("Cartão (nome ou parte); só no crédito"),
        chave: z.string().min(8).max(100).optional().describe("Chave de idempotência: a mesma chave nunca cria dois lançamentos"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      if (!scopesOf(ctx as never).includes("write")) {
        return {
          ...json({ erro: "Este token é só leitura. Gere um token com permissão de escrita em Acesso do Claude para lançar gastos." }),
          isError: true,
        };
      }
      const { userId, admin } = userOf(ctx as Ctx);
      const today = todayISO();
      const d = await loadAllFor(admin, userId);

      const existing = async () =>
        input.chave
          ? (
              await admin
                .from("transactions")
                .select("id, occurred_on, description, amount_cents, bucket, method")
                .eq("user_id", userId)
                .eq("idempotency_key", input.chave.trim())
                .maybeSingle()
            ).data
          : null;
      const already = (t: NonNullable<Awaited<ReturnType<typeof existing>>>) => {
        const r = remainingFor(d, t.occurred_on, today);
        return json({
          ja_lancado: true,
          aviso: "essa chave já foi usada: nada novo foi gravado",
          lancamento: { id: t.id, data: t.occurred_on, descricao: t.description, valor: reais(t.amount_cents), bucket: t.bucket, meio: METHOD_LABEL[t.method] ?? t.method },
          ...(r ? { mes: r.mes, ainda_posso_gastar: reais(r.cents) } : {}),
        });
      };
      const prev = await existing();
      if (prev) return already(prev);

      const built = buildGasto(d, input, today, (name) => findCard(d, name));
      if ("erro" in built) return { ...json(built), isError: true };
      const before = remainingFor(d, built.row.occurred_on, today);

      const { data: created, error } = await admin
        .from("transactions")
        .insert({ ...built.row, user_id: userId, source: "manual" })
        .select("id")
        .single();
      if (error) {
        // corrida com a mesma chave: devolve o que entrou primeiro
        if (error.code === "23505") {
          const dup = await existing();
          if (dup) return already(dup);
        }
        return { ...json({ erro: "Não foi possível salvar o gasto." }), isError: true };
      }

      const after = remainingFor(await loadAllFor(admin, userId), built.row.occurred_on, today);
      const daily = built.row.bucket === "lazer" || built.row.bucket === "mercado";
      return json({
        lancado: true,
        lancamento: {
          id: created.id,
          data: built.row.occurred_on,
          descricao: built.row.description,
          valor: reais(built.row.amount_cents),
          bucket: built.row.bucket,
          meio: METHOD_LABEL[built.row.method] ?? built.row.method,
          cartao: built.cartao,
        },
        ...(before && after
          ? {
              dia_a_dia: {
                mes: after.mes,
                ainda_posso_gastar_antes: reais(before.cents),
                ainda_posso_gastar: reais(after.cents),
                ...(after.cents < 0 ? { passou_do_teto_em: reais(-after.cents) } : {}),
                ...(after.period ? { periodo: { nome: after.period.name, teto: reais(after.period.cap), gasto: reais(after.period.spent), sobra: reais(after.period.remaining) } } : {}),
                ...(after.periods.length ? { ainda_posso_gastar_fora_dos_periodos: reais(after.normalRemaining) } : {}),
                fins_de_semana_restantes: after.weekends,
                por_fim_de_semana: after.perWeekend ? reais(after.perWeekend.total) : null,
              },
            }
          : {}),
        ...(daily ? {} : { observacao: "fora do dia a dia (lazer/mercado): não muda o 'ainda posso gastar'" }),
        desfazer: "para apagar, use o painel (Transações); o Claude não apaga lançamentos",
      });
    },
  );
}
