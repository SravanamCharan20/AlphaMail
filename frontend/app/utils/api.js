export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:9000";

let warnedOffline = false;

export const apiFetch = async (path, options = {}) => {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const merged = {
    credentials: "include",
    ...options,
  };

  try {
    return await fetch(url, merged);
  } catch (error) {
    if (!warnedOffline) {
      console.warn(
        "API unreachable. Check that the backend is running and CORS is configured.",
        error
      );
      warnedOffline = true;
    }
    return new Response(
      JSON.stringify({ message: "API_UNREACHABLE" }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      }
    );
  }
};
