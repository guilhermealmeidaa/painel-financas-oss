import "server-only";

/**
 * O que falta configurar no servidor (só diz SE a variável existe, nunca o valor).
 * Usado na tela de primeiros passos e em Conexões.
 */
export function serverSetup() {
  const has = (k: string) => Boolean(process.env[k]?.trim());
  const items = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Endereço do Supabase", ok: has("NEXT_PUBLIC_SUPABASE_URL"), required: true },
    { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", label: "Chave pública do Supabase", ok: has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), required: true },
    { key: "PLUGGY_CLIENT_ID", label: "Client ID da Pluggy", ok: has("PLUGGY_CLIENT_ID"), required: true },
    { key: "PLUGGY_CLIENT_SECRET", label: "Client Secret da Pluggy", ok: has("PLUGGY_CLIENT_SECRET"), required: true },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Chave secreta do Supabase (sync automático e acesso do Claude)", ok: has("SUPABASE_SERVICE_ROLE_KEY"), required: false },
    { key: "CRON_SECRET", label: "Segredo do sync automático", ok: has("CRON_SECRET"), required: false },
  ];
  return { items, missingRequired: items.filter((i) => i.required && !i.ok), missingOptional: items.filter((i) => !i.required && !i.ok) };
}
