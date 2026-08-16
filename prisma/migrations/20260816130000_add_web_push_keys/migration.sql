-- Store the web push subscription keys needed to send notifications
-- (web-push requires endpoint + p256dh + auth; the endpoint is stored in "token").
ALTER TABLE "DeviceToken" ADD COLUMN "p256dh" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN "authKey" TEXT;
