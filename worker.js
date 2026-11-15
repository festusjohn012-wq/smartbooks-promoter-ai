export default {
  async fetch(request, env) {

    const FRONTEND = "https://smartbooks-promoter-ai.pages.dev";
    const WORKER =
      "https://smartbooks-promoter-ai.festusjohn012.workers.dev";

    const corsHeaders = {
      "Access-Control-Allow-Origin": FRONTEND,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    const json = (data, status = 200) =>
      Response.json(data, {
        status,
        headers: corsHeaders
      });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // CONFIGURATION CHECK
    if (path === "/debug-config") {
      return json({
        facebook_app_id_found: !!env.FACEBOOK_APP_ID,
        facebook_secret_found: !!env.FACEBOOK_APP_SECRET,
        allowed_user_id_found: !!env.FACEBOOK_ALLOWED_USER_ID,
        gemini_key_found: !!env.GEMINI_API_KEY,
        facebook_storage_found: !!env.FB_TOKENS
      });
    }

    // FACEBOOK LOGIN
    if (path === "/auth/facebook") {
      if (!env.FACEBOOK_APP_ID || !env.FB_TOKENS) {
        return new Response("Facebook configuration is incomplete.", {
          status: 500
        });
      }

      const state = crypto.randomUUID();

      await env.FB_TOKENS.put(
        "oauth_state",
        state,
        { expirationTtl: 600 }
      );

      const redirectUri =
        WORKER + "/auth/facebook/callback";

      const loginUrl = new URL(
        "https://www.facebook.com/v26.0/dialog/oauth"
      );

      loginUrl.searchParams.set("client_id", env.FACEBOOK_APP_ID);
      loginUrl.searchParams.set("redirect_uri", redirectUri);
      loginUrl.searchParams.set("state", state);
      loginUrl.searchParams.set("response_type", "code");

      loginUrl.searchParams.set(
        "scope",
        "public_profile,pages_show_list,pages_read_engagement,pages_manage_posts"
      );

      return Response.redirect(loginUrl.toString(), 302);
    }

    // TEST KV STORAGE
    if (path === "/test-kv") {
      try {
        await env.FB_TOKENS.put(
          "connection_test",
          "KV is working"
        );

        const result =
          await env.FB_TOKENS.get("connection_test");

        return json({
          success: true,
          kv_status: result
        });

      } catch (error) {
        return json({
          success: false,
          message: error.message
        }, 500);
      }
    }

    // BACKEND HEALTH
    if (path === "/health") {
      return json({
        success: true,
        service: "Festus Smartbooks Marketing Copilot",
        backend: "active",
        facebook: "available",
        ai: env.GEMINI_API_KEY ? "configured" : "not_configured"
      });
    }

    // AI CONTENT GENERATION
    if (path === "/api/generate" && request.method === "POST") {
      try {
        if (!env.GEMINI_API_KEY) {
          throw new Error("Gemini API key is not configured.");
        }

        const body = await request.json();

        // Support both the old prompt format and the current frontend format.
        const prompt = body.prompt || [
          "You are SmartBook AI, an expert publishing and book marketing assistant.",
          "",
          "BOOK TITLE: " + (body.title || "Not provided"),
          "BOOK DESCRIPTION: " + (body.description || "Not provided"),
          "BOOK NICHE: " + (body.niche || "Not provided"),
          "PLATFORM: " + (body.platform || "Not provided"),
          "TARGET AUDIENCE: " + (body.audience || "Not provided"),
          "AMAZON LINK: " + (body.amazonLink || "Not provided"),
          "CONTENT TYPE: " + (body.contentType || "Not specified"),
          "",
          "TASK AND INSTRUCTIONS:",
          body.instructions || "Create useful, original publishing content.",
          "",
          "Write clearly and professionally. Avoid generic filler. Make the result practical and ready to use."
        ].join("\n");

        if (typeof prompt !== "string" || !prompt.trim()) {
          return json({
            success: false,
            message: "Please provide valid instructions."
          }, 400);
        }

        if (prompt.length > 30000) {
          return json({
            success: false,
            message: "Your request is too long. Please shorten it."
          }, 400);
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
          return json({
            success: false,
            message:
              aiData.error?.message ||
              "Gemini generation failed."
          }, aiResponse.status);
        }

        const generatedContent =
          aiData.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("") || "";

        if (!generatedContent.trim()) {
          return json({
            success: false,
            message: "The AI returned an empty response."
          }, 502);
        }

        return json({
          success: true,
          generatedContent
        });

      } catch (error) {
        return json({
          success: false,
          message: error.message || "AI generation failed."
        }, 500);
      }
    }

    // FACEBOOK OAUTH CALLBACK
    if (path === "/auth/facebook/callback") {

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      const savedState =
        await env.FB_TOKENS.get("oauth_state");

      if (!code || !state || state !== savedState) {
        return new Response(
          "Invalid Facebook login session.",
          { status: 400 }
        );
      }

      await env.FB_TOKENS.delete("oauth_state");

      try {
        const redirectUri =
          WORKER + "/auth/facebook/callback";

        const tokenUrl = new URL(
          "https://graph.facebook.com/v26.0/oauth/access_token"
        );

        tokenUrl.searchParams.set(
          "client_id",
          env.FACEBOOK_APP_ID
        );

        tokenUrl.searchParams.set(
          "client_secret",
          env.FACEBOOK_APP_SECRET
        );

        tokenUrl.searchParams.set(
          "redirect_uri",
          redirectUri
        );

        tokenUrl.searchParams.set("code", code);

        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenData.access_token) {
          return new Response(
            "Facebook token exchange failed.",
            { status: 400 }
          );
        }

        const profileUrl = new URL(
          "https://graph.facebook.com/v26.0/me"
        );

        profileUrl.searchParams.set("fields", "id,name");
        profileUrl.searchParams.set(
          "access_token",
          tokenData.access_token
        );

        const profileResponse = await fetch(profileUrl);
        const profile = await profileResponse.json();

        if (
          !profile.id ||
          profile.id !== env.FACEBOOK_ALLOWED_USER_ID
        ) {
          return new Response(
            "Facebook account not authorized.",
            { status: 403 }
          );
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
        return new Response(
          "Facebook connection failed. Please try again.",
          { status: 500 }
        );
      }
    }

    // FACEBOOK CONNECTION STATUS
    if (
      path === "/api/facebook/status" &&
      request.method === "GET"
    ) {
      try {
        const savedToken =
          await env.FB_TOKENS.get("facebook_user_token");

        if (!savedToken) {
          return json({ connected: false });
        }

        const account = JSON.parse(savedToken);

        return json({
          connected: true,
          name: account.name || "Facebook User",
          user_id: account.user_id
        });

      } catch (error) {
        return json({
          connected: false,
          message: "Unable to check Facebook connection."
        }, 500);
      }
    }

    // FACEBOOK PAGE DETECTION
    if (
      path === "/api/facebook/pages" &&
      request.method === "GET"
    ) {
      try {
        const savedToken =
          await env.FB_TOKENS.get("facebook_user_token");

        if (!savedToken) {
          return json({
            success: false,
            message: "Facebook is not connected."
          }, 401);
        }

        const account = JSON.parse(savedToken);

        const pagesUrl = new URL(
          "https://graph.facebook.com/v26.0/me/accounts"
        );

        pagesUrl.searchParams.set(
          "fields",
          "id,name,access_token"
        );

        pagesUrl.searchParams.set(
          "access_token",
          account.access_token
        );

        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (!pagesResponse.ok) {
          return json({
            success: false,
            message:
              pagesData.error?.message ||
              "Facebook Page detection failed."
          }, 400);
        }

        const pages = pagesData.data || [];

        for (const page of pages) {
          await env.FB_TOKENS.put(
            "facebook_page_" + page.id,
            JSON.stringify({
              id: page.id,
              name: page.name,
              access_token: page.access_token
            })
          );
        }

        return json({
          success: true,
          pages: pages.map(page => ({
            id: page.id,
            name: page.name
          }))
        });

      } catch (error) {
        return json({
          success: false,
          message: "Facebook Page detection failed."
        }, 500);
      }
    }

    // FACEBOOK MANUAL PUBLISHING
    if (
      path === "/api/facebook/publish" &&
      request.method === "POST"
    ) {
      try {

        // Only accept browser requests from the SmartBook website.
        if (request.headers.get("Origin") !== FRONTEND) {
          return json({
            success: false,
            message: "This publishing request is not authorized."
          }, 403);
        }

        const body = await request.json();

        const pageId = String(body.pageId || "").trim();
        const message = String(body.message || "").trim();
        const imageUrl = String(body.imageUrl || "").trim();
        const imageData = body.imageData || "";

        if (!/^\d+$/.test(pageId)) {
          return json({
            success: false,
            message: "Please select a valid Facebook Page."
          }, 400);
        }

        if (!message) {
          return json({
            success: false,
            message: "Please enter your Facebook post text."
          }, 400);
        }

        if (message.length > 5000) {
          return json({
            success: false,
            message: "Your post is too long."
          }, 400);
        }

        // Confirm that this page belongs to the connected account.
        const savedPage = await env.FB_TOKENS.get(
  "facebook_page_" + pageId
);

if (!savedPage) {
  return json({
    success: false,
    message: "This Facebook Page is not connected. Reload your Pages."
  }, 403);
}

const page = JSON.parse(savedPage);

if (!page.access_token) {
  return json({
    success: false,
    message: "Facebook Page token unavailable. Reconnect Facebook."
  }, 401);
}
        let publishUrl;
        let form = new FormData();

        form.append("access_token", page.access_token);

        // IMAGE POST
        if (imageData || imageUrl) {

          publishUrl =
            "https://graph.facebook.com/v26.0/" +
            pageId + "/photos";

          form.append("caption", message);

          if (imageData) {

            const match = String(imageData).match(
              /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/
            );

            if (!match) {
              return json({
                success: false,
                message: "Please provide a valid JPG or PNG book-cover image."
              }, 400);
            }

            const mime = match[1] === "jpg"
              ? "image/jpeg"
              : "image/" + match[1];

            const binary = atob(match[2]);

            if (binary.length > 8 * 1024 * 1024) {
              return json({
                success: false,
                message: "Please use an image smaller than 8 MB."
              }, 400);
            }

            const bytes = new Uint8Array(binary.length);

            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            const blob = new Blob([bytes], { type: mime });

            form.append(
              "source",
              blob,
              "book-cover." + (match[1] === "jpg" ? "jpg" : match[1])
            );

          } else {

            if (!imageUrl.startsWith("https://")) {
              return json({
                success: false,
                message: "The image URL must use HTTPS."
              }, 400);
            }

            form.append("url", imageUrl);
          }

        } else {

          // TEXT-ONLY POST
          publishUrl =
            "https://graph.facebook.com/v26.0/" +
            pageId + "/feed";

          form.append("message", message);
        }

        const publishResponse = await fetch(
          publishUrl,
          {
            method: "POST",
            body: form
          }
        );

        const publishData = await publishResponse.json();

        if (!publishResponse.ok || publishData.error) {
          return json({
            success: false,
            message:
              publishData.error?.message ||
              "Facebook could not publish this post."
          }, 400);
        }

        return json({
          success: true,
          message: "Your post was successfully published to Facebook.",
          post_id: publishData.id || null,
          post: publishData
        });

      } catch (error) {
        return json({
          success: false,
          message:
            error.message ||
            "Facebook publishing failed. Please try again."
        }, 500);
      }
    }
    // APPROVAL-FIRST AUTOMATIC PUBLISHING: QUEUE API

    // SCHEDULE AN APPROVED POST
    if (
      path === "/api/autopilot/schedule" &&
      request.method === "POST"
    ) {
      try {
        if (
  !env.AUTOPILOT_SECRET ||
  request.headers.get("Authorization") !==
    "Bearer " + env.AUTOPILOT_SECRET
) {
          return json({
            success: false,
            message: "Unauthorized scheduling request."
          }, 403);
        }

        if (!env.FB_TOKENS) {
          throw new Error("Publishing storage is unavailable.");
        }

        const body = await request.json();

        const pageId = String(body.pageId || "").trim();
        const message = String(body.message || "").trim();
        const imageData = body.imageData || "";
        const imageUrl = String(body.imageUrl || "").trim();
        const scheduledAt = new Date(body.scheduledAt).getTime();

        if (!/^\d+$/.test(pageId)) {
          return json({
            success: false,
            message: "Please select a valid Facebook Page."
          }, 400);
        }

        if (!message || message.length > 5000) {
          return json({
            success: false,
            message: "Please enter valid post text (maximum 5,000 characters)."
          }, 400);
        }

        if (!Number.isFinite(scheduledAt) || scheduledAt < Date.now() + 60000) {
          return json({
            success: false,
            message: "Choose a publishing time at least one minute in the future."
          }, 400);
        }

        const savedPage = await env.FB_TOKENS.get(
          "facebook_page_" + pageId
        );

        if (!savedPage) {
          return json({
            success: false,
            message: "This Facebook Page is not connected. Reload your Pages."
          }, 403);
        }

        if (imageData) {
          const match = String(imageData).match(
            /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/
          );

          if (!match || atob(match[2]).length > 8 * 1024 * 1024) {
            return json({
              success: false,
              message: "Please use a valid JPG or PNG image smaller than 8 MB."
            }, 400);
          }
        } else if (imageUrl && !imageUrl.startsWith("https://")) {
          return json({
            success: false,
            message: "The image URL must use HTTPS."
          }, 400);
        }

        const id = crypto.randomUUID();

        const post = {
          id,
          pageId,
          message,
          imageData,
          imageUrl,
          scheduledAt,
          status: "pending",
          createdAt: Date.now(),
          publishedAt: null,
          error: null
        };

        await env.FB_TOKENS.put(
          "autopost:" + id,
          JSON.stringify(post)
        );

        return json({
          success: true,
          message: "Your approved post has been added to the publishing queue.",
          post
        });

      } catch (error) {
        return json({
          success: false,
          message: error.message || "Unable to schedule this post."
        }, 500);
      }
    }

    // VIEW THE PUBLISHING QUEUE
    if (
      path === "/api/autopilot/queue" &&
      request.method === "GET"
    ) {
      try {
        if (
  !env.AUTOPILOT_SECRET ||
  request.headers.get("Authorization") !==
    "Bearer " + env.AUTOPILOT_SECRET
) {
          return json({
            success: false,
            message: "Unauthorized request."
          }, 403);
        }

        const result = await env.FB_TOKENS.list({
          prefix: "autopost:",
          limit: 1000
        });

        const posts = [];

        for (const item of result.keys) {
          const saved = await env.FB_TOKENS.get(item.name);

          if (saved) {
            posts.push(JSON.parse(saved));
          }
        }

        posts.sort((a, b) => a.scheduledAt - b.scheduledAt);

        const paused =
          (await env.FB_TOKENS.get("autopost_paused")) === "true";

        return json({
          success: true,
          paused,
          posts
        });

      } catch (error) {
        return json({
          success: false,
          message: "Unable to load the publishing queue."
        }, 500);
      }
    }

    // CANCEL A PENDING POST
    if (
      path === "/api/autopilot/cancel" &&
      request.method === "POST"
    ) {
      try {
        if (request.headers.get("Origin") !== FRONTEND) {
          return json({
            success: false,
            message: "Unauthorized request."
          }, 403);
        }

        const body = await request.json();
        const id = String(body.id || "").trim();

        if (!id) {
          return json({
            success: false,
            message: "Missing post ID."
          }, 400);
        }

        const key = "autopost:" + id;
        const saved = await env.FB_TOKENS.get(key);

        if (!saved) {
          return json({
            success: false,
            message: "Scheduled post not found."
          }, 404);
        }

        const post = JSON.parse(saved);

        if (post.status !== "pending") {
          return json({
            success: false,
            message: "Only pending posts can be cancelled."
          }, 400);
        }

        post.status = "cancelled";
        post.cancelledAt = Date.now();

        await env.FB_TOKENS.put(key, JSON.stringify(post));

        return json({
          success: true,
          message: "Scheduled post cancelled."
        });

      } catch (error) {
        return json({
          success: false,
          message: "Unable to cancel this post."
        }, 500);
      }
    }

    // PAUSE OR RESUME AUTOMATIC PUBLISHING
    if (
      path === "/api/autopilot/pause" &&
      request.method === "POST"
    ) {
      try {
        if (request.headers.get("Origin") !== FRONTEND) {
          return json({
            success: false,
            message: "Unauthorized request."
          }, 403);
        }

        const body = await request.json();
        const paused = body.paused === true;

        await env.FB_TOKENS.put(
          "autopost_paused",
          paused ? "true" : "false"
        );

        return json({
          success: true,
          paused,
          message: paused
            ? "Automatic publishing paused."
            : "Automatic publishing resumed."
        });

      } catch (error) {
        return json({
          success: false,
          message: "Unable to update publishing settings."
        }, 500);
      }
                      }
    // SERVE EXISTING WEBSITE FILES
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Festus Smartbooks Marketing Copilot backend is running.", {
      status: 200,
      headers: corsHeaders
    });
  },

  // AUTOMATIC FACEBOOK PUBLISHING ENGINE
  async scheduled(controller, env, ctx) {
    try {
      if (!env.FB_TOKENS) return;

      const paused =
        (await env.FB_TOKENS.get("autopost_paused")) === "true";

      if (paused) return;

      const result = await env.FB_TOKENS.list({
        prefix: "autopost:",
        limit: 1000
      });

      for (const item of result.keys) {
        const key = item.name;
        const saved = await env.FB_TOKENS.get(key);

        if (!saved) continue;

        const post = JSON.parse(saved);

        if (
          post.status !== "pending" ||
          post.scheduledAt > Date.now()
        ) continue;

        // Mark before publishing to reduce duplicate attempts.
        post.status = "publishing";
        post.attemptedAt = Date.now();

        await env.FB_TOKENS.put(key, JSON.stringify(post));

        try {
          const savedPage = await env.FB_TOKENS.get(
            "facebook_page_" + post.pageId
          );

          if (!savedPage) {
            throw new Error("Facebook Page is no longer connected.");
          }

          const page = JSON.parse(savedPage);

          if (!page.access_token) {
            throw new Error("Facebook Page access token is missing.");
          }

          let publishUrl;
          const form = new FormData();

          form.append("access_token", page.access_token);

          if (post.imageData || post.imageUrl) {
            publishUrl =
              "https://graph.facebook.com/v26.0/" +
              post.pageId + "/photos";

            form.append("caption", post.message);

            if (post.imageData) {
              const match = String(post.imageData).match(
                /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/
              );

              if (!match) {
                throw new Error("Scheduled image is invalid.");
              }

              const binary = atob(match[2]);
              const bytes = new Uint8Array(binary.length);

              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }

              const mime =
                match[1] === "jpg" ? "image/jpeg" :
                "image/" + match[1];

              const blob = new Blob([bytes], { type: mime });

              form.append(
                "source",
                blob,
                "scheduled-image." + match[1]
              );

            } else {
              if (!post.imageUrl.startsWith("https://")) {
                throw new Error("Scheduled image URL is invalid.");
              }

              form.append("url", post.imageUrl);
            }

          } else {
            publishUrl =
              "https://graph.facebook.com/v26.0/" +
              post.pageId + "/feed";

            form.append("message", post.message);
          }

          const response = await fetch(publishUrl, {
            method: "POST",
            body: form
          });

          const data = await response.json();

          if (!response.ok || data.error) {
            throw new Error(
              data.error?.message ||
              "Facebook could not publish the scheduled post."
            );
          }

          post.status = "published";
          post.publishedAt = Date.now();
          post.facebookPostId = data.id || null;
          post.result = data;
          post.error = null;

        } catch (error) {
          post.status = "failed";
          post.error = error.message || "Automatic publishing failed.";
          post.failedAt = Date.now();
        }

        await env.FB_TOKENS.put(key, JSON.stringify(post));
      }

    } catch (error) {
      console.error("Automatic publishing engine error:", error);
    }
  }
};
