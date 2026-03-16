import mongoose from "mongoose";
import validator from "validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
      minlength: 3,
      maxlength: 30,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator(value) {
          return validator.isEmail(value);
        },
        message: "Please provide a valid email!",
      },
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      validate: {
        validator(value) {
          return validator.isStrongPassword(value, {
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 1,
          });
        },
        message:
          "Password must contain uppercase, lowercase, number and symbol",
      },
    },

    imageTrustedSenders: {
      type: [String],
      default: [],
    },

    densityPreference: {
      type: String,
      enum: ["compact", "comfortable"],
      default: "comfortable",
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const hashedPass = await bcrypt.hash(this.password, 10);
  this.password = hashedPass;
});

userSchema.methods.checkPass = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.getJWT = function () {
  const token = jwt.sign({ _id: this._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  return token;
};
export default mongoose.model("User", userSchema);
