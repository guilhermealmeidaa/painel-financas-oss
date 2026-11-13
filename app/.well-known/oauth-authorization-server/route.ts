import { authServerMetadata, jsonResponse, originOf, preflight } from "@/lib/oauth";

/** RFC 8414: metadados do servidor de autorização. Público, com CORS. */
export function GET(req: Request) {
  return jsonResponse(authServerMetadata(originOf(req)), 200, { "cache-control": "public, max-age=300" });
}
export const OPTIONS = preflight;
