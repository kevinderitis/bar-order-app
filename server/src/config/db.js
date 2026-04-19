import mongoose from "mongoose";
import { env } from "./env.js";
import { Order } from "../models/Order.js";
import { PushSubscription } from "../models/PushSubscription.js";

async function dropLegacyStatusIndexIfNeeded() {
  const indexes = await Order.collection.indexes();
  const legacyStatusIndex = indexes.find(
    (index) =>
      index.name === "status_1" &&
      index.key?.status === 1 &&
      !index.unique &&
      !index.partialFilterExpression
  );

  if (legacyStatusIndex) {
    await Order.collection.dropIndex("status_1");
    console.log("Dropped legacy non-unique orders.status index");
  }
}

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri);
  await dropLegacyStatusIndexIfNeeded();
  await Order.init();
  await PushSubscription.init();
  console.log("MongoDB connected");
}
