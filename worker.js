export default {
  async fetch(request, env) {
        const corsHeaders = {
      "Access-Control-Allow-Origin": "https://smartbooks-promoter-ai.pages.dev",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    if (url.pathname === "/debug-config") {
  return Response.json({
    facebook_app_id_found: !!env.FACEBOOK_APP_ID,
    facebook_app_id_length: env.FACEBOOK_APP_ID?.length || 0,
    facebook_secret_found: !!env.FACEBOOK_APP_SECRET,
    allowed_user_id_found: !!env.FACEBOOK_ALLOWED_USER_ID
  });
    }
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
    // AI CONTENT GENERATION
if (url.pathname === "/api/generate" && request.method === "POST") {
  try {
    if (!env.GEMINI_API_KEY) {
      throw new Error("Gemini API key is not configured.");
    }

    const body = await request.json();
    const prompt = body.prompt;

    if (!prompt || typeof prompt !== "string") {
      return Response.json(
        { error: "Please provide a valid prompt." },
        { status: 400, headers: corsHeaders }
      );
    }

    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      }
    );

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      return Response.json(
        { error: aiData.error?.message || "Gemini generation failed." },
        { status: aiResponse.status, headers: corsHeaders }
      );
    }

    const generatedContent =
      aiData.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

    return Response.json(
      { success: true, generatedContent },
      { headers: corsHeaders }
    );

  } catch (error) {
    return Response.json(
      { error: error.message || "AI generation failed." },
      { status: 500, headers: corsHeaders }
    );
  }
      }
// Facebook OAuth Callback
if (url.pathname === "/auth/facebook/callback") {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = await env.FB_TOKENS.get("oauth_state");

  if (!code || !state || state !== savedState) {
    return new Response("Invalid Facebook login session.", {
      status: 400
    });
  }

  await env.FB_TOKENS.delete("oauth_state");

  try {
    const redirectUri =
      "https://smartbooks-promoter-ai.festusjohn012.workers.dev/auth/facebook/callback";

    const tokenUrl = new URL(
      "https://graph.facebook.com/v26.0/oauth/access_token"
    );

    tokenUrl.searchParams.set("client_id", env.FACEBOOK_APP_ID);
    tokenUrl.searchParams.set("client_secret", env.FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return new Response("Facebook token exchange failed.", {
        status: 400
      });
    }

    const profileUrl = new URL(
      "https://graph.facebook.com/v26.0/me"
    );

    profileUrl.searchParams.set("fields", "id,name");
    profileUrl.searchParams.set("access_token", tokenData.access_token);

    const profileResponse = await fetch(profileUrl);
    const profile = await profileResponse.json();

    if (
      !profile.id ||
      profile.id !== env.FACEBOOK_ALLOWED_USER_ID
    ) {
      return new Response("Facebook account not authorized.", {
        status: 403
      });
    }

    await env.FB_TOKENS.put(
      "facebook_user_token",
      JSON.stringify({
        access_token: tokenData.access_token,
        user_id: profile.id,
        name: profile.name,
        expires_in: tokenData.expires_in || null
      })
    );

    return new Response(
      "Facebook connected successfully! You can close this page.",
      { status: 200 }
    );

  } catch (error) {
    return new Response("Facebook connection failed. Please try again.", {
      status: 500
    });
  }
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
