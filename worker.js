export default {
  async fetch(request, env) {

    const url = new URL(request.url);
// Test Facebook KV storage
if (url.pathname === "/test-kv") {
  try {
    await env.FB_TOKENS.put("connection_test", "KV is working");

    const result = await env.FB_TOKENS.get("connection_test");

    return Response.json({
      success: true,
      kv_status: result
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    });
  }
}
    // Backend health check
    if (url.pathname === "/health") {
      return Response.json({
        success: true,
        service: "Festus Smartbooks Marketing Copilot",
        backend: "active",
        facebook: "setup_pending"
      });
    }

    // Serve the existing website files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Backend is running", {
      status: 200
    });
  }
};
