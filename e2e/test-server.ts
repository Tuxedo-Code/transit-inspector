import http from "node:http";
import type { AddressInfo } from "node:net";

/** A Transit map: {:user/id #uuid "550e8400-...", :tags #{"a" "b"}} */
export const TRANSIT_BODY = '["^ ","~:user/id","~u550e8400-e29b-41d4-a716-446655440000","~:tags",["~#set",["a","b"]]]';

/** How long `/api/slow` waits before responding, and `/api/drip` before sending the rest of its body. */
export const IN_FLIGHT_MS = 1000;

/** On load, the test page makes the requests the panel is expected to see (and one image it must ignore). */
const PAGE = `<!doctype html>
<html lang="en">
<title>Transit test page</title>
<h1>Transit test page</h1>
<img src="/img.png" alt="">
<script>
fetch("/api/transit");
const xhr = new XMLHttpRequest();
xhr.open("GET", "/api/transit-as-json");
xhr.send();
fetch("/api/plain");
fetch("/api/echo", { method: "POST", headers: { "content-type": "application/transit+json" }, body: ${JSON.stringify(TRANSIT_BODY)} });
window.later = () => fetch("/api/later");
window.spa = () => history.pushState({}, "", "/spa-route");
// Requests in flight while the page changes route: one still waiting for its response, one downloading.
window.spaThenSlow = () => {
  history.pushState({}, "", "/spa-route-2");
  return fetch("/api/slow", { method: "POST", headers: { "content-type": "application/transit+json" }, body: '["^ ","~:query","~:user"]' }).then((r) => r.text());
};
window.dripThenSpa = async () => {
  const body = fetch("/api/drip").then((r) => r.text());
  await new Promise((resolve) => setTimeout(resolve, 300));
  history.pushState({}, "", "/spa-route-3");
  return body;
};
</script>
</html>`;

export interface TestServer {
  url: string;
  /** Path of every request received, in arrival order. */
  requests: string[];
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url ?? "");
    const send = (type: string, body: string) => {
      res.writeHead(200, { "content-type": type });
      res.end(body);
    };
    switch (req.url) {
      case "/":
      case "/spa-route":
      case "/spa-route-2":
      case "/spa-route-3":
        return send("text/html", PAGE);
      case "/api/transit":
      case "/api/later":
        return send("application/transit+json", TRANSIT_BODY);
      case "/api/transit-as-json":
        return send("application/json", TRANSIT_BODY);
      case "/api/plain":
        return send("application/json", '{"plain":true}');
      case "/api/echo": {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => send("application/transit+json", body));
        return;
      }
      case "/api/slow":
        req.resume();
        setTimeout(() => send("application/transit+json", TRANSIT_BODY), IN_FLIGHT_MS);
        return;
      case "/api/drip":
        res.writeHead(200, { "content-type": "application/transit+json" });
        res.write(TRANSIT_BODY.slice(0, 20));
        setTimeout(() => res.end(TRANSIT_BODY.slice(20)), IN_FLIGHT_MS);
        return;
      default:
        res.writeHead(404);
        res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
