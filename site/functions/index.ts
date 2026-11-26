import { handleGenerate, handleHealth } from "./generate.ts";

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/app/, "") || "/";
  try {
    if (request.method === "GET" && (path === "/" || path === "/health")) return handleHealth();
    if (request.method === "POST" && path === "/generate") return await handleGenerate(request, url);
    return Response.json({ ok: false, code: "not_found" }, { status: 404 });
  } catch {
    return Response.json({ ok: false, code: "internal_error" }, { status: 500 });
  }
});