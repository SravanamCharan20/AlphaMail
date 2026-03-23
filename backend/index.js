import express from "express";
import { connectDB } from "./config/db.js";
import dotenv from "dotenv";
import userAuthRouter from "./routes/userAuthRouter.js";
dotenv.config();
import cookieParser from "cookie-parser";
import cors from "cors";
import googleAuthRouter from "./routes/googleAuthRouter.js";
import gmailRouter from "./routes/gmailRouter.js";
import http from 'http';
import { initSocket } from "./config/socketServer.js";
import { initSocketSubscriber } from "./services/socketPubSub.js";
import { isAllowedOrigin } from "./config/app.js";

// CONSTANTS
const app = express();
const PORT = process.env.PORT || 9000;
const server = http.createServer(app);
const io = initSocket(server);
initSocketSubscriber(io);


// Middlewares
app.use(cookieParser());
app.use(express.json());

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error(`Not allowed by CORS: ${origin || "unknown"}`));
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
  server.listen(PORT, () => {
    console.log(`server is running at ${PORT}`);
  });
});
