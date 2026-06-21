const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function isSupported(name) {
  const lower = name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function makeNumericId(seed) {
  let hash = 0n;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31n + BigInt(seed.charCodeAt(i))) % (10n ** 12n);
  }
  return hash.toString().padStart(12, "0");
}

function extMimeType(name) {
  const ext = name.toLowerCase().split(".").pop();
  const map = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  return map[ext] || "application/octet-stream";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

async function listImages(bucket, prefix = "") {
  const records = [];
  let cursor;
  do {
    const opts = { limit: 1000, cursor };
    if (prefix) opts.prefix = prefix.endsWith("/") ? prefix : prefix + "/";
    const listed = await bucket.list(opts);
    for (const obj of listed.objects) {
      if (!isSupported(obj.key)) continue;
      records.push({
        id: makeNumericId(`${obj.key}:${obj.size}:${obj.uploaded}`),
        name: obj.key,
        key: obj.key,
        url: `/images/${encodeURIComponent(obj.key)}`,
      });
    }
    cursor = listed.truncated ? listed.cursor : null;
  } while (cursor);
  records.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return records;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (pathname === "/api/bootstrap" && request.method === "GET") {
      try {
        const records = await listImages(env.R2_BUCKET);
        return json({
          batch_name: "underscorehumaneval",
          image_dir: "r2://underscorehumaneval",
          source_type: "r2",
          output_path: "cloudflare-d1",
          images: records.map(({ id, name, url }) => ({ id, name, url })),
        });
      } catch (err) {
        return json({ error: err.message }, 502);
      }
    }

    if (pathname.startsWith("/images/") && request.method === "GET") {
      const key = decodeURIComponent(pathname.replace("/images/", ""));
      if (!key) return json({ error: "Image key missing." }, 400);
      const obj = await env.R2_BUCKET.get(key);
      if (!obj) return json({ error: "Image not found." }, 404);
      const headers = new Headers();
      headers.set("Content-Type", obj.httpMetadata?.contentType || extMimeType(key));
      headers.set("Cache-Control", "public, max-age=86400");
      Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
      return new Response(obj.body, { headers });
    }

    if (pathname === "/api/save-results" && request.method === "POST") {
      try {
        const body = await request.json();
        const results = body.results || [];
        const batchName = body.batch_name || "underscorehumaneval";
        const reviewedAt = new Date().toISOString();

        const rated = results.filter((r) => r.verdict !== "skip");
        const likes = rated.filter((r) => r.verdict === "like" || r.verdict === "super_like").length;
        const superLikes = rated.filter((r) => r.verdict === "super_like").length;
        const notLikes = rated.filter((r) => r.verdict === "not_like").length;
        const markedIssues = rated.filter((r) => r.failure_points === "mark").length;

        const stmts = results.flatMap((r) => [
          env.humaneval_db.prepare(`
            INSERT INTO image_metadata (id, name, r2_key)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO NOTHING
          `).bind(r.id, r.name, r.name),
          env.humaneval_db.prepare(`
            INSERT INTO eval_logs
              (image_id, eval_type, verdict, failure_points, mask_binary, masked_areas, mask_data_url, notes, batch_name, reviewed_at)
            VALUES (?, 'style_checker', ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            r.id, r.verdict, r.failure_points ?? null,
            r.mask_binary ?? "no", r.masked_areas ?? 0,
            r.mask_data_url ?? null, r.notes ?? "",
            batchName, reviewedAt
          ),
        ]);

        await env.humaneval_db.batch(stmts);

        return json({
          app: "vibe_check",
          saved_at: reviewedAt,
          batch_name: batchName,
          image_dir: body.image_dir || "r2://underscorehumaneval",
          source_type: "r2",
          output_path: "cloudflare-d1",
          reviewed_count: rated.length,
          likes,
          super_likes: superLikes,
          not_likes: notLikes,
          marked_issues: markedIssues,
          results,
        });
      } catch (err) {
        return json({ error: err.message }, 400);
      }
    }

    if (pathname === "/health") {
      return json({ ok: true });
    }

    return json({ error: "Not found." }, 404);
  },
};
