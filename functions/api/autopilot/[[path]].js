const WORKER_URL =
  "https://smartbooks-promoter-ai.festusjohn012.workers.dev";

export async function onRequest(context) {
  const { request, env } = context;

  // Check the private secret stored in Cloudflare Pages.
  if (!env.AUTOPILOT_SECRET) {
    return Response.json({
      success: false,
      message: "Autopilot security configuration is missing."
    }, { status: 500 });
  }

  const url = new URL(request.url);
  const route = url.pathname.replace("/api/autopilot/", "");

  // Only allow approved Autopilot routes.
  const allowedRoutes = {
    "schedule": ["POST"],
    "queue": ["GET"],
    "cancel": ["POST"],
    "pause": ["POST"]
  };

  if (!allowedRoutes[route] ||
      !allowedRoutes[route].includes(request.method)) {
    return Response.json({
      success: false,
      message: "Autopilot route not allowed."
    }, { status: 405 });
  }

  try {
    const target = new URL(
      "/api/autopilot/" + route,
      WORKER_URL
    );

    target.search = url.search;

    const headers = new Headers();

    headers.set(
      "Authorization",
      "Bearer " + env.AUTOPILOT_SECRET
    );

    if (request.headers.get("Content-Type")) {
      headers.set(
        "Content-Type",
        request.headers.get("Content-Type")
      );
    }

    const options = {
      method: request.method,
      headers
    };

    if (request.method !== "GET") {
      options.body = await request.arrayBuffer();
    }

    const response = await fetch(target.toString(), options);

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (error) {
    return Response.json({
      success: false,
      message: "Unable to contact the Autopilot server."
    }, { status: 502 });
  }
}
