import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;

const parseCookies = (cookieHeader = "") => {
  const cookies = {};
  cookieHeader.split(";").forEach((part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return;
    cookies[key] = decodeURIComponent(rest.join("="));
  });
  return cookies;
};

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        const isProd = process.env.NODE_ENV === "production";
        const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
        if (!origin) return callback(null, true);
        if (origin === allowedOrigin) return callback(null, true);
        if (!isProd) {
          if (
            origin.startsWith("http://localhost:") ||
            origin.startsWith("http://127.0.0.1:")
          ) {
            return callback(null, true);
          }
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie || "");
      const token = cookies.token;
      if (!token) return next(new Error("Unauthorized"));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload?._id || payload?.id;
      if (!socket.userId) return next(new Error("Unauthorized"));
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    if (socket.userId) {
      socket.join(socket.userId.toString());
    }

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }

  return io;
};
