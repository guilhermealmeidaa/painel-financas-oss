"use client";

import { createContext, use, useContext } from "react";
import { BUCKET_LABEL } from "@/lib/labels";

type Labels = typeof BUCKET_LABEL;
const LabelsContext = createContext<Promise<Labels> | Labels>(BUCKET_LABEL);

/**
 * Nomes das categorias (os dois do dia a dia são editáveis no Planejamento).
 * Recebe a promessa do layout sem esperar por ela: só quem usa o rótulo espera.
 */
export function LabelsProvider({ labels, children }: { labels: Promise<Labels>; children: React.ReactNode }) {
  return <LabelsContext.Provider value={labels}>{children}</LabelsContext.Provider>;
}

export function useBucketLabels(): Labels {
  const v = useContext(LabelsContext);
  return v instanceof Promise ? use(v) : v;
}
