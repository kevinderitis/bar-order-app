import mongoose from "mongoose";

export const ORDER_STATUSES = [
  "pending",
  "preparing",
  "ready",
  "delivered"
];

const orderItemSchema = new mongoose.Schema(
  {
    menuItemId: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    option: {
      type: String,
      trim: true,
      default: ""
    },
    options: {
      type: [
        {
          name: {
            type: String,
            required: true,
            trim: true
          },
          value: {
            type: String,
            required: true,
            trim: true
          }
        }
      ],
      default: []
    },
    extras: {
      type: [
        {
          extraId: {
            type: String,
            required: true,
            trim: true
          },
          name: {
            type: String,
            required: true,
            trim: true
          },
          price: {
            type: Number,
            required: true,
            min: 0
          }
        }
      ],
      default: []
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    customerNameKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    activeName: {
      type: Boolean,
      default: true,
      index: true
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending",
      required: true
    },
    linkedDeviceId: {
      type: String,
      trim: true,
      default: null,
      index: true
    },
    items: {
      type: [orderItemSchema],
      default: []
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    discountTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 280
    },
    readyAt: {
      type: Date,
      default: null
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    notificationPingAt: {
      type: Date,
      default: null
    },
    notificationMessage: {
      type: String,
      trim: true,
      default: null,
      maxlength: 180
    }
  },
  {
    timestamps: true
  }
);

orderSchema.index(
  { customerNameKey: 1 },
  {
    name: "unique_active_customer_name",
    unique: true,
    partialFilterExpression: { activeName: true }
  }
);

export const Order = mongoose.model("Order", orderSchema);
