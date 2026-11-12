export default {
  async fetch(request, env) {

    const url = new URL(request.url);
    // Facebook Login
if (url.pathname === "/auth/facebook") {
  const state = crypto.randomUUID();

  await env.FB_TOKENS.put(
    "oauth_state",
    state,
    { expirationTtl: 600 }
  );

  const redirectUri =
    "https://smartbooks-promoter-ai.festusjohn012.workers.dev/auth/facebook/callback";

  const loginUrl = new URL(
    "https://www.facebook.com/v26.0/dialog/oauth"
  );

  loginUrl.searchParams.set("client_id", env.FACEBOOK_APP_ID);
  loginUrl.searchParams.set("redirect_uri", redirectUri);
  loginUrl.searchParams.set("state", state);
  loginUrl.searchParams.set("response_type", "code");
  loginUrl.searchParams.set(
    "scope",
    "public_profile,pages_show_list"
  );

  return Response.redirect(loginUrl.toString(), 302);
}
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
