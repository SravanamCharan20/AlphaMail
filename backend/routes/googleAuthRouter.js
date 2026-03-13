import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import User from "../models/User.js";
import EmailAccount from "../models/EmailAccount.js";
import userAuth from "../middlewares/auth.js";
import { SCOPES, createOAuth2Client } from "./constants.js";
dotenv.config();

const googleAuthRouter = express.Router();

// user starts OAuth; must be authenticated
googleAuthRouter.get("/google", userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user);
    if (!user) {
      return res.status(404).json({ message: "User not Found!!" });
    }

    const oauth2Client = createOAuth2Client();
    // console.log("GOOGLE_REDIRECT_URI in use:", process.env.GOOGLE_REDIRECT_URI);

    // create signed state so callback can trust userId
    const state = jwt.sign(
      { userId: user._id.toString(), timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    // creating AuthUrl
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
      state,
    });

    res.redirect(authUrl);
  } catch (err) {
    console.error("Error starting OAuth:", err);
    res.status(500).send("Failed to start OAuth");
  }
});

googleAuthRouter.get("/google/callback", async (req, res) => {
  try {
    const { state, code } = req.query;
    if (!code) {
      return res.status(400).json({ message: "Missing OAuth Code!!" });
    }
    if (!state) {
      return res.status(400).json({ message: "Missing OAuth state" });
    }

    // verify state
    let stateData = null;
    try {
      stateData = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "Invalid OAuth state" });
    }

    const stateUserId = stateData?.userId;
    if (!stateUserId) {
      return res.status(400).json({ message: "Invalid OAuth state payload" });
    }

    const user = await User.findById(stateUserId);
    if (!user) {
      return res.status(404).json({ message: "User not Found!!" });
    }

    // Exchange "CODE" for "TOKENS"
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // get gmail profile
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const gmailAddress = profile?.data?.emailAddress;

    if (!gmailAddress) {
      return res.status(400).json({ message: "Unable to read Gmail address" });
    }

    const update = {
      userId: user._id,
      provider: "gmail",
      email: gmailAddress,
      scopes: tokens.scope ? tokens.scope.split(" ") : SCOPES,
    };
    if (tokens.access_token) update.accessToken = tokens.access_token;
    if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) update.tokenExpiry = new Date(tokens.expiry_date);
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split(".")[1], "base64").toString("utf-8")
        );
        if (payload?.sub) update.googleId = payload.sub;
      } catch {
        // ignore malformed id_token
      }
    }

    await EmailAccount.findOneAndUpdate(
      { userId: user._id, email: gmailAddress },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const successUrl = `http://localhost:3000/oauth/success?provider=gmail&email=${encodeURIComponent(
      gmailAddress
    )}`;
    return res.redirect(successUrl);

  } catch (err) {
    console.error("Error in OAuth callback:", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });
    res
      .status(500)
      .send(`OAuth callback failed: ${err?.message || "Unknown error"}`);
  }
});

googleAuthRouter.get("/accounts", userAuth, async (req, res) => {
  try {
    const accounts = await EmailAccount.find({ userId: req.user })
      .select("provider email scopes tokenExpiry createdAt updatedAt")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ accounts });
  } catch (err) {
    console.error("Error fetching connected accounts:", err);
    return res.status(500).json({ message: "Failed to fetch accounts" });
  }
});

export default googleAuthRouter;
