const WORKER_URL =
  "https://smartbooks-promoter-ai.festusjohn012.workers.dev";

const FRONTEND =
  "https://smartbooks-promoter-ai.pages.dev";

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function encode(data) {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decode(text) {
  return Uint8Array.from(
    atob(text.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  );
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
}

async function validSession(request, secret) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/__Host-autopilot_session=([^;]+)/);

  if (!match) return false;

  try {
    const parts = match[1].split(".");
    if (parts.length !== 2) return false;

    const payload = parts[0];
    const signature = decode(parts[1]);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(payload)
    );

    if (!valid) return false;

    const data = JSON.parse(
      new TextDecoder().decode(decode(payload))
    );

    return data.exp > Date.now();

  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.AUTOPILOT_SECRET ||
      !env.AUTOPILOT_LOGIN_PASSWORD) {
    return json({
      success: false,
      message: "Autopilot security configuration is missing."
    }, 500);
  }

  const url = new URL(request.url);
  const route = url.pathname.replace("/api/autopilot/", "");

  if (request.headers.get("Origin") &&
      request.headers.get("Origin") !== FRONTEND) {
    return json({ success: false, message: "Request not allowed." }, 403);
  }

  if (route === "login" && request.method === "POST") {
    try {
      const body = await request.json();

      if (typeof body.password !== "string" ||
          body.password.length > 200 ||
          body.password !== env.AUTOPILOT_LOGIN_PASSWORD) {
        return json({
          success: false,
          message: "Incorrect Autopilot password."
        }, 401);
      }

      const payload = encode(
        new TextEncoder().encode(JSON.stringify({
          exp: Date.now() + 8 * 60 * 60 * 1000
        }))
      );

      const signature = encode(
        await sign(payload, env.AUTOPILOT_LOGIN_PASSWORD)
      );

      return json(
        { success: true, message: "Autopilot login successful." },
        200,
        {
          "Set-Cookie":
            `__Host-autopilot_session=${payload}.${signature}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`
        }
      );

    } catch {
      return json({ success: false, message: "Invalid login request." }, 400);
    }
  }

  if (route === "logout" && request.method === "POST") {
    return json(
      { success: true },
      200,
      {
        "Set-Cookie":
          "__Host-autopilot_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0"
      }
    );
  }

  const allowedRoutes = {
    schedule: "POST",
    queue: "GET",
    cancel: "POST",
    pause: "POST"
  };

  if (!allowedRoutes[route] ||
      allowedRoutes[route] !== request.method) {
    return json({
      success: false,
      message: "Autopilot route not allowed."
    }, 405);
  }

  if (!await validSession(request, env.AUTOPILOT_LOGIN_PASSWORD)) {
    return json({
      success: false,
      message: "Please log in to use Facebook Autopilot."
    }, 401);
  }

  try {
    const target = new URL(
      "/api/autopilot/" + route,
      WORKER_URL
    );

    target.search = url.search;

    const headers = new Headers({
      Authorization: "Bearer " + env.AUTOPILOT_SECRET
    });

    if (request.headers.get("Content-Type")) {
      headers.set("Content-Type", request.headers.get("Content-Type"));
    }

    const options = {
      method: request.method,
      headers
    };

    if (request.method !== "GET") {
      options.body = await request.arrayBuffer();
    }

    const response = await fetch(target.toString(), options);

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });

  } catch {
    return json({
      success: false,
      message: "Unable to contact the Autopilot server."
    }, 502);
  }
}
