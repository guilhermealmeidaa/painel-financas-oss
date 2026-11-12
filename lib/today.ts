import "server-only";
import { connection } from "next/server";
import { todayISO } from "./dates";

/** "Hoje" no servidor: marca a renderização como dinâmica antes de ler o relógio. */
export async function serverToday(): Promise<string> {
  await connection();
  return todayISO();
}
