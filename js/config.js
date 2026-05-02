const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

window.APP_CONFIG = {
  // Local development uses Vercel dev server.
  // For production, replace with your deployed backend URL.
  API_BASE_URL: isLocalHost ? "http://localhost:3000" : "https://your-vercel-backend.vercel.app"
};
