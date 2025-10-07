// analytics-worker.js
const analyticsWorkerDefault = {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Send POST with TTFB data", { status: 405 });
    }
    try {
      const data = await request.json();
      env["analytics-engine"].writeDataPoint({
        blobs: data.blobs,   // [url, location, client, cid]
        doubles: data.doubles // [ttfb, status, bytes]
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
export {
  analyticsWorkerDefault as default
};
