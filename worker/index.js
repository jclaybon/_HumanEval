const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const ALLOWED_EVAL_TYPES = new Set([
  "prompt_faithfulness",
  "style_faithfulness",
  "monk_skin_tone",
  "overall_vibe_check"
]);
const ALLOWED_VERDICTS = new Set(["like", "super_like", "not_like", "skip"]);

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

function normalizeHasPerson(value) {
  return value === 1 || value === "1" || value === true ? 1 : 0;
}

function normalizeEvalResult(result) {
  const evalType = result.eval_type;
  const verdict = result.verdict;

  if (!ALLOWED_EVAL_TYPES.has(evalType)) {
    throw new Error(`Invalid eval_type: ${evalType}`);
  }
  if (!ALLOWED_VERDICTS.has(verdict)) {
    throw new Error(`Invalid verdict: ${verdict}`);
  }

  return {
    ...result,
    eval_type: evalType,
    verdict,
    failure_points: result.failure_points ?? null,
    mask_binary: result.mask_binary ?? "no",
    masked_areas: result.masked_areas ?? 0,
    mask_data_url: result.mask_data_url ?? null,
    notes: result.notes ?? ""
  };
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

    if ((pathname === "/prd" || pathname === "/prd/") && env.ASSETS) {
      const prdUrl = new URL("/prd/index.html", request.url);
      return env.ASSETS.fetch(new Request(prdUrl, request));
    }

    if (pathname === "/api/bootstrap" && request.method === "GET") {
      try {
        const [records, metadataResult] = await Promise.all([
          listImages(env.R2_BUCKET),
          env.humaneval_db
            .prepare(`
              SELECT id, name, r2_key, COALESCE(has_person, 0) AS has_person,
                     created_from_prompt, style_name, style_description_keyword
              FROM image_metadata
            `)
            .all()
            .catch(() => ({ results: [] }))
        ]);
        const metadataRows = metadataResult.results || [];
        const metadataById = new Map(metadataRows.map((row) => [row.id, row]));
        const metadataByName = new Map(metadataRows.map((row) => [row.name, row]));
        const metadataByKey = new Map(metadataRows.map((row) => [row.r2_key, row]));

        return json({
          batch_name: "underscorehumaneval",
          image_dir: "r2://underscorehumaneval",
          source_type: "r2",
          output_path: "cloudflare-d1",
          images: records.map(({ id, key, name, url }) => {
            const metadata =
              metadataById.get(id) ||
              metadataByKey.get(key) ||
              metadataByName.get(name);

            return {
              id,
              name,
              url,
              has_person: normalizeHasPerson(metadata?.has_person),
              created_from_prompt: metadata?.created_from_prompt ?? null,
              style_name: metadata?.style_name ?? null,
              style_description_keyword: metadata?.style_description_keyword ?? null,
            };
          }),
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
        const results = Array.isArray(body.results)
          ? body.results.map(normalizeEvalResult)
          : [];
        const batchName = body.batch_name || "underscorehumaneval";
        const reviewerName = body.reviewer_name || null;
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
              (image_id, eval_type, verdict, failure_points, mask_binary, masked_areas, mask_data_url, notes, batch_name, reviewer_name, reviewed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(image_id, eval_type, batch_name, reviewer_name) DO UPDATE SET
              verdict = excluded.verdict,
              failure_points = excluded.failure_points,
              mask_binary = excluded.mask_binary,
              masked_areas = excluded.masked_areas,
              mask_data_url = excluded.mask_data_url,
              notes = excluded.notes,
              reviewed_at = excluded.reviewed_at
          `).bind(
            r.id, r.eval_type, r.verdict, r.failure_points,
            r.mask_binary, r.masked_areas,
            r.mask_data_url, r.notes,
            batchName, reviewerName, reviewedAt
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
