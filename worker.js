export default {
  async fetch(request, env) {

    const url = new URL(request.url);

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
