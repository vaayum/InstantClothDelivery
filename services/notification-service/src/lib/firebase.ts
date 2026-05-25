import admin from "firebase-admin";

let initialised = false;

function init() {
  if (initialised) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  admin.initializeApp({
    credential: raw
      ? admin.credential.cert(JSON.parse(raw))
      : admin.credential.applicationDefault(),
  });
  initialised = true;
}

export async function sendPush(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  init();
  try {
    await admin.messaging().send({ token: fcmToken, notification: { title, body }, data });
  } catch (err) {
    console.error("[firebase] push failed:", err);
  }
}
