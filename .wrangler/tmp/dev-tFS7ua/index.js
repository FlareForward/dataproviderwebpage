var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.ts
var IDENTITY_ADDRESS = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";
var EXPLORER_BASE = "https://flare-systems-explorer-backend.flare.network/api/v0";
var CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600";
function pct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value * 100;
}
__name(pct, "pct");
function normalizeWindow(w) {
  return {
    availability: pct(w?.availability),
    primary: pct(w?.primary),
    secondary: pct(w?.secondary)
  };
}
__name(normalizeWindow, "normalizeWindow");
function normalizeFeeds(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    feed: r.feed?.representation ?? "",
    feed_id: r.feed?.feed_name ?? "",
    is_rewarded: r.feed?.is_rewarded ?? false,
    availability: pct(r.availability),
    primary: pct(r.primary),
    secondary: pct(r.secondary)
  }));
}
__name(normalizeFeeds, "normalizeFeeds");
async function fetchExplorerJson(path) {
  const res = await fetch(`${EXPLORER_BASE}${path}`, {
    headers: { Accept: "application/json" },
    // Let Cloudflare cache the upstream fetch briefly to spread out load.
    cf: { cacheTtl: 120, cacheEverything: true }
  });
  if (!res.ok) {
    throw new Error(`Explorer ${path} -> ${res.status}`);
  }
  return res.json();
}
__name(fetchExplorerJson, "fetchExplorerJson");
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Same-origin in prod; `*` keeps the VITE_ACCURACY_URL override usable
      // from a local dev server pointing at a deployed worker.
      "access-control-allow-origin": "*",
      "cache-control": status === 200 ? CACHE_CONTROL : "public, max-age=30"
    }
  });
}
__name(jsonResponse, "jsonResponse");
async function handleFtso(feedsOnly) {
  try {
    const [ftso, feeds] = await Promise.all([
      fetchExplorerJson(`/entity/${IDENTITY_ADDRESS}/ftso`),
      fetchExplorerJson(
        `/entity/${IDENTITY_ADDRESS}/feeds?limit=100`
      )
    ]);
    const normalizedFeeds = normalizeFeeds(feeds?.results);
    const generated_at_unix = Math.floor(Date.now() / 1e3);
    if (feedsOnly) {
      return jsonResponse({
        generated_at_unix,
        identity_address: IDENTITY_ADDRESS,
        feeds_count: normalizedFeeds.length,
        feeds: normalizedFeeds
      });
    }
    const perEpoch = (ftso?.per_reward_epoch ?? []).map((e) => ({
      reward_epoch: typeof e.reward_epoch_id === "number" ? e.reward_epoch_id : null,
      availability: pct(e.availability),
      primary: pct(e.primary),
      secondary: pct(e.secondary)
    })).filter((e) => e.reward_epoch !== null).sort((a, b) => a.reward_epoch - b.reward_epoch);
    return jsonResponse({
      generated_at_unix,
      identity_address: IDENTITY_ADDRESS,
      feeds_count: normalizedFeeds.length,
      last_6h: normalizeWindow(ftso?.last_6h),
      last_24h: normalizeWindow(ftso?.last_24h),
      per_reward_epoch: perEpoch,
      feeds: normalizedFeeds
    });
  } catch (err) {
    return jsonResponse(
      { error: "Failed to load Flare Systems Explorer data", detail: String(err) },
      502
    );
  }
}
__name(handleFtso, "handleFtso");
var STAKE_DECIMALS = 1e9;
var REWARD_DECIMALS = 1e18;
var FEE_DIVISOR = 1e4;
var EPOCHS_PER_YEAR = 365 / 3.5;
function flr(raw, decimals) {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / decimals;
}
__name(flr, "flr");
async function handleValidator() {
  try {
    const entity = await fetchExplorerJson(
      `/entity?query=${IDENTITY_ADDRESS}`
    );
    const e = entity.results?.[0];
    const nodeIds = new Set(e?.denormalizedentity?.node_ids ?? []);
    const rewards = e?.entityrewardslatest ?? null;
    let row;
    const first = await fetchExplorerJson(
      `/validators?limit=100&offset=0`
    );
    const count = first.count ?? 0;
    row = first.results?.find((r) => r.node_id && nodeIds.has(r.node_id));
    for (let off = 100; !row && off < count && off <= 500; off += 100) {
      const pg = await fetchExplorerJson(
        `/validators?limit=100&offset=${off}`
      );
      row = pg.results?.find((r) => r.node_id && nodeIds.has(r.node_id));
    }
    const generated_at_unix = Math.floor(Date.now() / 1e3);
    const nodeId = [...nodeIds][0] ?? null;
    if (!row) {
      return jsonResponse({
        generated_at_unix,
        identity_address: IDENTITY_ADDRESS,
        node_id: nodeId,
        has_validator: false
      });
    }
    const selfBond = flr(row.self_bond, STAKE_DECIMALS);
    const delegated = flr(row.delegated, STAKE_DECIMALS);
    const capacity = flr(row.total_available_stake, STAKE_DECIMALS);
    const total = selfBond != null && delegated != null ? selfBond + delegated : null;
    const capacityUsedPct = total != null && capacity != null && capacity > 0 ? total / capacity * 100 : null;
    const feePct = typeof row.fee_percentage === "number" ? row.fee_percentage / FEE_DIVISOR : null;
    const rateEpochPct = typeof rewards?.reward_rate_total_mirror === "number" ? rewards.reward_rate_total_mirror * 100 : null;
    return jsonResponse({
      generated_at_unix,
      identity_address: IDENTITY_ADDRESS,
      node_id: row.node_id ?? nodeId,
      has_validator: true,
      self_bond_flr: selfBond,
      delegated_flr: delegated,
      total_stake_flr: total,
      capacity_flr: capacity,
      capacity_used_pct: capacityUsedPct,
      delegators_count: Array.isArray(row.delegators) ? row.delegators.length : null,
      fee_pct: feePct,
      active_end_unix: typeof row.end_time === "number" ? Math.floor(row.end_time) : null,
      rewards: {
        reward_epoch: rewards?.reward_epoch ?? null,
        self_bond_earnings_flr: flr(rewards?.self_bond_earnings, REWARD_DECIMALS),
        total_flr: flr(rewards?.total_mirror, REWARD_DECIMALS),
        reward_rate_epoch_pct: rateEpochPct,
        reward_rate_annual_pct: rateEpochPct != null ? rateEpochPct * EPOCHS_PER_YEAR : null
      }
    });
  } catch (err) {
    return jsonResponse(
      { error: "Failed to load validator staking data", detail: String(err) },
      502
    );
  }
}
__name(handleValidator, "handleValidator");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === "/api/ftso" || pathname === "/api/ftso/") {
      return handleFtso(false);
    }
    if (pathname === "/api/ftso/feeds") {
      return handleFtso(true);
    }
    if (pathname === "/api/validator" || pathname === "/api/validator/") {
      return handleValidator();
    }
    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  }
};

// ../../../../../private/var/folders/5q/5js6hrl16fvfsb2_zp9s5s380000gn/T/cursor-sandbox-cache/65b297e2fc3a550414d0a7713808bbe4/npm/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../private/var/folders/5q/5js6hrl16fvfsb2_zp9s5s380000gn/T/cursor-sandbox-cache/65b297e2fc3a550414d0a7713808bbe4/npm/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-WESeHA/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../../private/var/folders/5q/5js6hrl16fvfsb2_zp9s5s380000gn/T/cursor-sandbox-cache/65b297e2fc3a550414d0a7713808bbe4/npm/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-WESeHA/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
