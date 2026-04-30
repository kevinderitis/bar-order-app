import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 40
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    passwordHash: {
      type: String,
      required: true
    },
    credits: {
      type: Number,
      default: 0,
      min: 0
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

export const User = mongoose.model("User", userSchema);
