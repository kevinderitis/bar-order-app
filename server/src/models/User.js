import mongoose from "mongoose";

const userGiftSchema = new mongoose.Schema(
  {
    giftItemId: {
      type: String,
      trim: true,
      default: ""
    },
    menuItemId: {
      type: String,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    redeemedAt: {
      type: Date,
      default: null
    },
    redeemedOrderId: {
      type: String,
      trim: true,
      default: ""
    }
  },
  {
    timestamps: { createdAt: "assignedAt", updatedAt: false }
  }
);

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
    },
    gifts: {
      type: [userGiftSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

export const User = mongoose.model("User", userSchema);
