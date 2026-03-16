import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import User from "../models/User.js";
import EmailAccount from "../models/EmailAccount.js";
import Email from "../models/Email.js";
import userAuth from "../middlewares/auth.js";
import { SCOPES, createOAuth2Client } from "./constants.js";
import { emailQueue } from "../queues/emailQueue.js";
import { watchMailboxForAccount } from "../services/gmailService.js";
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

    let idTokenPayload = null;
    if (tokens.id_token) {
      try {
        idTokenPayload = JSON.parse(
          Buffer.from(tokens.id_token.split(".")[1], "base64").toString("utf-8")
        );
      } catch {
        idTokenPayload = null;
      }
    }

    let gmailAddress = idTokenPayload?.email || null;
    if (!gmailAddress) {
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      gmailAddress = profile?.data?.emailAddress || null;
    }

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
    if (idTokenPayload?.sub) {
      update.googleId = idTokenPayload.sub;
    }

    const savedAccount = await EmailAccount.findOneAndUpdate(
      { userId: user._id, email: gmailAddress },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const successUrl = `http://localhost:3000/oauth/success?provider=gmail&email=${encodeURIComponent(
      gmailAddress
    )}`;
    res.redirect(successUrl);

    setImmediate(async () => {
      try {
        if (savedAccount) {
          await watchMailboxForAccount(savedAccount);
        }
      } catch (watchError) {
        console.error("Failed to start Gmail watch:", watchError);
      }

      try {
        await emailQueue.add("initial-sync-emails", {
          userId: user._id,
        });
      } catch (queueError) {
        console.error("Failed to enqueue initial sync:", queueError);
      }
    });
    return;

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

googleAuthRouter.delete("/accounts/:accountId", userAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await EmailAccount.findOne({
      _id: accountId,
      userId: req.user,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    await EmailAccount.deleteOne({ _id: accountId, userId: req.user });
    await Email.deleteMany({ userId: req.user, account: account.email });

    return res.status(200).json({ message: "Account disconnected" });
  } catch (err) {
    console.error("Error disconnecting account:", err);
    return res.status(500).json({ message: "Failed to disconnect account" });
  }
});

export default googleAuthRouter;
