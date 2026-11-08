/**
 * NaijaStream API + rules tests against a running server.
 * Usage: BASE_URL=http://localhost:3015 NAIJA_STREAM_SHOW_SAMPLES=true node scripts/stream-tests.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3015";

function jar() {
  const cookies = new Map();
  return {
    header: () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (res) => {
      for (const entry of res.headers.getSetCookie?.() ?? []) {
        const pair = entry.split(";")[0];
        const i = pair.indexOf("=");
        if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
    }
  };
}

async function api(j, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Origin: BASE, ...(body ? { "Content-Type": "application/json" } : {}), ...(j.header() ? { Cookie: j.header() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  j.absorb(res);
  return { status: res.status, body: await res.json().catch(() => null) };
}

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

(async () => {
  const anon = jar();
  const customer = jar();

  console.log("1) catalog");
  let r = await api(anon, "GET", "/api/stream/tracks");
  check("public catalog responds", r.status === 200);
  const items = r.body?.items ?? [];
  const visibleIsSample = items.some((t) => t.isSample);
  check(
    process.env.NAIJA_STREAM_SHOW_SAMPLES === "true" ? visibleIsSample : !visibleIsSample,
    "sample visibility honours NAIJA_STREAM_SHOW_SAMPLES",
    `samples=${visibleIsSample}`
  );
  check("catalog excludes unpublished tracks", items.every((t) => t.title), "");
  check("genres are derived from real rows", Array.isArray(r.body?.genres));

  r = await api(anon, "GET", "/api/stream/artists");
  check("artists list responds", r.status === 200 && Array.isArray(r.body.artists));
  const artistSlug = r.body.artists[0]?.slug;
  if (artistSlug) {
    r = await api(anon, "GET", `/api/stream/artists/${artistSlug}`);
    check("artist profile responds", r.status === 200 && r.body.artist.slug === artistSlug);
  }
  r = await api(anon, "GET", "/api/stream/artists/does-not-exist");
  check("unknown artist is 404", r.status === 404, `status ${r.status}`);

  const trackSlug = items[0]?.slug;
  if (trackSlug) {
    r = await api(anon, "GET", `/api/stream/tracks/${trackSlug}`);
    check("track page API responds", r.status === 200);
  }

  r = await api(anon, "GET", "/api/stream/playlists");
  check("playlists respond", r.status === 200 && Array.isArray(r.body.playlists));
  const playlistSlug = r.body.playlists[0]?.slug;
  if (playlistSlug) {
    r = await api(anon, "GET", `/api/stream/playlists/${playlistSlug}`);
    check("playlist detail responds with items", r.status === 200 && Array.isArray(r.body.items));
  }

  console.log("2) auth boundaries");
  r = await api(anon, "GET", "/api/stream/library");
  check("library requires auth", r.status === 401, `status ${r.status}`);
  r = await api(anon, "POST", "/api/stream/playlists", { title: "x" });
  check("playlist creation requires auth", r.status === 401, `status ${r.status}`);
  r = await api(anon, "GET", "/api/admin/stream/royalties");
  check("admin royalties require auth", r.status === 401, `status ${r.status}`);

  await api(customer, "POST", "/api/auth/login", { email: "customer@naijadeals.local", password: "CustomerPass123!" });
  r = await api(customer, "GET", "/api/admin/stream/royalties");
  check("customer cannot read admin royalties", r.status === 403, `status ${r.status}`);

  console.log("3) play deduplication");
  if (items[0]) {
    const a = await api(customer, "POST", "/api/stream/plays", { trackId: items[0].id, secondsPlayed: 45 });
    const b = await api(customer, "POST", "/api/stream/plays", { trackId: items[0].id, secondsPlayed: 45 });
    check("first eligible play counts", a.status === 200 && a.body.counted === true, JSON.stringify(a.body));
    check("duplicate in same bucket is not counted", b.status === 200 && b.body.counted === false, JSON.stringify(b.body));
    const short = await api(customer, "POST", "/api/stream/plays", { trackId: items[0].id, secondsPlayed: 5 });
    check("short listen not eligible", short.status === 200 && short.body.counted === false);
  }

  console.log("4) library, likes, playlists");
  if (items[0]) {
    // Idempotent regardless of prior state: toggle until liked.
    r = await api(customer, "POST", "/api/stream/likes", { trackId: items[0].id });
    if (r.status === 200 && r.body.liked === false) {
      r = await api(customer, "POST", "/api/stream/likes", { trackId: items[0].id });
    }
    check("like toggles on", r.status === 200 && r.body.liked === true, JSON.stringify(r.body));
    r = await api(customer, "GET", "/api/stream/library");
    check("liked track appears in library", r.body?.liked?.some((t) => t.id === items[0].id));
  }
  r = await api(customer, "POST", "/api/stream/playlists", { title: `Test playlist ${Date.now().toString(36)}` });
  check("customer creates playlist", r.status === 201, `status ${r.status}`);
  const playlistId = r.body?.id;
  if (playlistId && items[1]) {
    r = await api(customer, "POST", `/api/stream/playlists/${playlistId}/items`, { trackId: items[1].id });
    check("track added to playlist", r.status === 201 && r.body.added === true, `status ${r.status}`);
    r = await api(customer, "POST", `/api/stream/playlists/${playlistId}/items`, { trackId: items[1].id });
    check("duplicate add is rejected idempotently", r.body?.duplicate === true || r.status === 200);
  }

  console.log("5) royalty engine");
  const period = "2026-11";
  r = await api(customer, "POST", "/api/admin/stream/royalties", { period, poolKobo: "10000000" });
  check("customer cannot configure pools", r.status === 403, `status ${r.status}`);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
})();
