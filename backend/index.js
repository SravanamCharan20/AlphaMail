import express from "express";
import { connectDB } from "./config/db.js";
import dotenv from "dotenv";
import userAuthRouter from "./routes/userAuthRouter.js";
dotenv.config();
import cookieParser from "cookie-parser";
import cors from "cors";
import googleAuthRouter from "./routes/googleAuthRouter.js";
import gmailRouter from "./routes/gmailRouter.js";

// CONSTANTS
const app = express();
const PORT = process.env.PORT || 9000;

// Middlewares
app.use(cookieParser());
app.use(express.json());
const isProd = process.env.NODE_ENV === "production";
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin(origin, callback) {
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
  })
);

// Routes
// Production Health Checking Routes
app.get("/health", (req, res) => {
  res.send("Backend is Working");
});
app.get("/", (req, res) => {
  res.send("Backend is Working");
});

// Actual Routes
app.use("/auth", userAuthRouter);
app.use("/googleAuth", googleAuthRouter);
app.use('/gmail',gmailRouter);


// DB Connection
connectDB(() => {
  console.log("DB Connection Successful..");
  app.listen(PORT, () => {
    console.log(`server is running at ${PORT}`);
  });
});
