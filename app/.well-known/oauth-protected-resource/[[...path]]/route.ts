import { jsonResponse, originOf, preflight, protectedResourceMetadata } from "@/lib/oauth";

/** RFC 9728: na raiz e com o caminho do recurso (/.well-known/oauth-protected-resource/api/mcp). Público, com CORS. */
export function GET(req: Request) {
  return jsonResponse(protectedResourceMetadata(originOf(req)), 200, { "cache-control": "public, max-age=300" });
}
export const OPTIONS = preflight;
