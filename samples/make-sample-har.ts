// Regenerates samples/basic.har: `node samples/make-sample-har.ts`.
// Bodies are written with transit-js's own writer so they contain real Transit (key caching, tags).
import { writeFileSync } from "node:fs";
import transit from "transit-js";

const kw = transit.keyword;
const tmap = (...kvs: unknown[]) => transit.map(kvs);
const write = (value: unknown) => transit.writer("json").write(value);

const order = (id: number, total: string, sku: string) =>
  tmap(
    kw("order/id"),
    id,
    kw("order/total"),
    transit.bigDec(total),
    kw("order/status"),
    kw("order.status/shipped"),
    kw("order/items"),
    [tmap(kw("item/sku"), sku, kw("item/qty"), 2, kw("item/price"), transit.bigDec("9.99"))],
  );

const user = tmap(
  kw("user/id"),
  transit.uuid("550e8400-e29b-41d4-a716-446655440000"),
  kw("user/name"),
  "Ada Lovelace",
  kw("user/email"),
  "ada@example.com",
  kw("user/roles"),
  transit.set([kw("admin"), kw("dev")]),
  kw("user/created-at"),
  new Date("2026-10-05T09:30:00.000Z"),
  kw("user/big-id"),
  transit.integer("9007199254740993"),
  kw("user/balance"),
  transit.bigDec("1234.56"),
  kw("user/score"),
  9.5,
  kw("user/active?"),
  true,
  kw("user/nickname"),
  null,
  kw("user/homepage"),
  transit.uri("https://example.com/ada"),
  kw("user/initial"),
  transit.tagged("c", "A"),
  kw("user/favorite-fn"),
  transit.symbol("clojure.core/juxt"),
  kw("user/bio"),
  "Wrote the first published algorithm intended for a machine. ".repeat(12).trim(),
  kw("user/orders"),
  [order(1001, "19.98", "A-1"), order(1002, "5.00", "B-7"), order(1003, "120.00", "C-3")],
);

const search = tmap(
  kw("search/query"),
  "transit",
  kw("search/ratio"),
  transit.tagged("ratio", [transit.bigInt("1"), transit.bigInt("3")]),
  kw("search/price"),
  transit.tagged("money/amount", tmap(kw("currency"), "EUR", kw("cents"), 1999)),
  kw("search/by-point"),
  transit.map([tmap(kw("x"), 1, kw("y"), 2), "origin-ish"]),
  kw("search/history"),
  transit.list(["first", "second"]),
  kw("search/total"),
  transit.bigInt("123456789012345678901234567890"),
);

// A JVM stack trace as servers send it: line breaks and tabs that the EDN view shows escaped.
const stacktrace = [
  'clojure.lang.ExceptionInfo: Card declined: "insufficient_funds" {:payment/amount 10.00M, :payment/currency :EUR}',
  "\tat shop.payments.gateway$charge_BANG_.invokeStatic(gateway.clj:88)",
  "\tat shop.payments.gateway$charge_BANG_.invoke(gateway.clj:71)",
  "\tat shop.payments.api$create_payment.invokeStatic(api.clj:42)",
  "\tat shop.payments.api$create_payment.invoke(api.clj:35)",
  "\tat reitit.ring$ring_handler$fn__1234.invoke(ring.cljc:329)",
  "\tat ring.middleware.params$wrap_params$fn__5678.invoke(params.clj:67)",
  "\tat clojure.lang.AFn.applyToHelper(AFn.java:154)",
  "\tat java.base/java.lang.Thread.run(Thread.java:1583)",
  "Caused by: java.net.SocketTimeoutException: Read timed out",
  "\tat java.base/sun.nio.ch.NioSocketImpl.timedRead(NioSocketImpl.java:288)",
  "\tat shop.payments.gateway$post_BANG_.invokeStatic(gateway.clj:120)",
  "\t... 7 more",
].join("\n");

interface Spec {
  method: string;
  url: string;
  type?: string;
  status?: number;
  statusText?: string;
  requestMime?: string;
  requestBody?: string;
  responseMime?: string;
  responseBody?: string;
  encoding?: string;
  error?: string;
}

const specs: Spec[] = [
  { method: "GET", url: "/api/users/42", responseMime: "application/transit+json", responseBody: write(user) },
  {
    method: "POST",
    url: "/api/orders",
    status: 201,
    statusText: "Created",
    requestMime: "application/transit+json",
    requestBody: write(tmap(kw("order/items"), [tmap(kw("item/sku"), "A-1", kw("item/qty"), 2)])),
    responseMime: "application/transit+json",
    responseBody: write(order(1004, "19.98", "A-1")),
  },
  {
    method: "GET",
    url: "/api/feed?page=2&size=20",
    type: "xhr",
    responseMime: "application/json",
    responseBody: write([order(7, "1.00", "Z-9"), order(8, "2.00", "Z-8")]),
  },
  {
    method: "GET",
    url: "/api/config",
    responseMime: "application/json",
    responseBody: '{"theme":"dark","features":["a","b"]}',
  },
  { method: "GET", url: "/api/health", responseMime: "text/plain", responseBody: "ok" },
  {
    method: "GET",
    url: "/api/archive",
    responseMime: "application/transit+msgpack",
    responseBody: "gqFhAaFiAg==",
    encoding: "base64",
  },
  {
    method: "GET",
    url: "/api/search?q=transit&limit=50",
    responseMime: "application/transit+json;charset=UTF-8",
    responseBody: write(search),
  },
  {
    method: "GET",
    url: "/api/users/999",
    status: 404,
    statusText: "Not Found",
    responseMime: "application/transit+json",
    responseBody: write(tmap(kw("error/code"), kw("not-found"), kw("error/message"), "No user with id 999")),
  },
  {
    method: "POST",
    url: "/api/payments",
    status: 500,
    statusText: "Internal Server Error",
    requestMime: "application/transit+json",
    requestBody: write(tmap(kw("payment/amount"), transit.bigDec("10.00"), kw("payment/currency"), kw("EUR"))),
    responseMime: "application/transit+json",
    responseBody: write(
      tmap(
        kw("error/code"),
        kw("internal"),
        kw("error/trace-id"),
        transit.uuid("0b6f6a4e-8c1d-4f3e-9a7b-2c5d8e1f0a3b"),
        kw("error/message"),
        'Card declined: "insufficient_funds"',
        kw("error/stacktrace"),
        stacktrace,
      ),
    ),
  },
  { method: "GET", url: "/api/stream", status: 0, statusText: "", error: "net::ERR_CONNECTION_REFUSED" },
  {
    method: "GET",
    url: "/api/broken",
    responseMime: "application/transit+json",
    responseBody: '["^ ","~:a",1,"~:b",[1,2',
  },
  {
    method: "GET",
    url: "/static/logo.png",
    type: "image",
    responseMime: "image/png",
    responseBody: "iVBORw0KGgo=",
    encoding: "base64",
  },
  {
    method: "POST",
    url: "/api/events",
    requestMime: "application/json",
    requestBody: '{"event":"click"}',
    responseMime: "application/transit+json",
    responseBody: write(tmap(kw("ok?"), true)),
  },
];

const origin = "https://app.example.com";
const start = Date.parse("2026-10-05T10:00:00.000Z");
const header = (name: string, value: string) => ({ name, value });

const entries = specs.map((s, i) => {
  const url = new URL(s.url, origin);
  return {
    _resourceType: s.type ?? "fetch",
    startedDateTime: new Date(start + i * 137).toISOString(),
    time: 40 + ((i * 53) % 300),
    request: {
      method: s.method,
      url: url.href,
      httpVersion: "HTTP/1.1",
      headers: s.requestMime ? [header("content-type", s.requestMime)] : [],
      queryString: [...url.searchParams].map(([name, value]) => ({ name, value })),
      cookies: [],
      headersSize: -1,
      bodySize: s.requestBody?.length ?? 0,
      ...(s.requestBody ? { postData: { mimeType: s.requestMime ?? "", text: s.requestBody } } : {}),
    },
    response: {
      status: s.status ?? 200,
      statusText: s.statusText ?? "OK",
      httpVersion: "HTTP/1.1",
      headers: s.responseMime ? [header("content-type", s.responseMime)] : [],
      cookies: [],
      content: {
        size: s.responseBody?.length ?? 0,
        mimeType: s.responseMime?.split(";")[0] ?? "x-unknown",
        ...(s.responseBody !== undefined ? { text: s.responseBody } : {}),
        ...(s.encoding ? { encoding: s.encoding } : {}),
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: s.responseBody?.length ?? 0,
      ...(s.error ? { _error: s.error } : {}),
    },
    cache: {},
    timings: { send: 1, wait: 30, receive: 5 },
  };
});

const har = { log: { version: "1.2", creator: { name: "transit-inspector sample generator", version: "1" }, entries } };
writeFileSync(new URL("basic.har", import.meta.url), `${JSON.stringify(har, null, 2)}\n`);
console.log(`wrote ${entries.length} entries to samples/basic.har`);
