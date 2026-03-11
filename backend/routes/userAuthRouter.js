import express from "express";
import User from "../models/User.js";
import dotenv from "dotenv";
import userAuth from "../middlewares/auth.js";
dotenv.config();

const userAuthRouter = express.Router();

userAuthRouter.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // check required fields
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    // check existing user
    const isExisted = await User.findOne({ email });

    if (isExisted) {
      return res
        .status(400)
        .json({ message: "User already exists with this email!" });
    }

    // create user
    const newUser = await User.create({
      username,
      email,
      password,
    });

    res.status(201).json({
      message: "User created successfully!",
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error("Error:", error.message);

    res.status(500).json({
      message: error.message,
    });
  }
});

userAuthRouter.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    const isMatch = await user.checkPass(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Wrong credentials" });
    }

    const token = user.getJWT();

    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // true in production
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "User logged successfully!",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error:", error.message);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

userAuthRouter.post("/logout", (req, res) => {
  res.clearCookie("token");

  res.status(200).json({
    message: "Logged out successfully",
  });
});

userAuthRouter.get("/profile", userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "User profile fetched successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error:", error.message);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});
export default userAuthRouter;
