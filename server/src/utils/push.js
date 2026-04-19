import webPush from "web-push";
import { env } from "../config/env.js";
import { PushSubscription } from "../models/PushSubscription.js";

const LOG_PREFIX = "[ReadyOrderPush:Server]";

export function isPushConfigured() {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);
}

export function configureWebPush() {
  if (!isPushConfigured()) {
    console.warn("Web Push is disabled. Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.");
    return;
  }

  webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  console.info(LOG_PREFIX, "configured", {
    subject: env.vapidSubject,
    publicKeyPrefix: env.vapidPublicKey.slice(0, 12)
  });
}

export async function sendPushToDevice(deviceId, payload) {
  if (!isPushConfigured() || !deviceId) {
    console.warn(LOG_PREFIX, "send skipped", {
      reason: "push_not_configured",
      configured: isPushConfigured(),
      hasDeviceId: Boolean(deviceId)
    });
    return { sent: false, reason: "push_not_configured" };
  }

  const subscription = await PushSubscription.findOne({ deviceId });

  if (!subscription) {
    console.warn(LOG_PREFIX, "send skipped", { reason: "subscription_not_found", deviceId });
    return { sent: false, reason: "subscription_not_found" };
  }

  try {
    console.info(LOG_PREFIX, "send attempt", {
      deviceId,
      endpointHost: new URL(subscription.endpoint).host,
      endpointTail: subscription.endpoint.slice(-18),
      payload
    });

    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      JSON.stringify(payload),
      {
        TTL: 60,
        urgency: "high"
      }
    );

    const result = { sent: true, endpointHost: new URL(subscription.endpoint).host };
    console.info(LOG_PREFIX, "send success", result);
    return result;
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id });
      console.warn(LOG_PREFIX, "subscription expired", {
        deviceId,
        statusCode: error.statusCode,
        endpointTail: subscription.endpoint.slice(-18)
      });
      return { sent: false, reason: "subscription_expired" };
    }

    const result = {
      sent: false,
      reason: "provider_rejected",
      statusCode: error.statusCode,
      message: error.body || error.message
    };

    console.error(LOG_PREFIX, "send error", result);
    return result;
  }
}
