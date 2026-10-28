This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Security

**Always use `npm run db:push`** to create or change tables. It runs `prisma db
push` then `npm run db:secure` (`prisma/rls.sql`), which enables Row-Level
Security (RLS) on every table in the `public` schema. Never create tables
without RLS.

**Never put database credentials in client code.** The app talks to Postgres
only through Prisma on the server (`DATABASE_URL` / `DIRECT_URL`). The browser
must never see a connection string, the `app_user` password, or any Supabase
key -- there is no Supabase client in this codebase.

## Holy Hour alarms and calls (production setup)

At each scheduled Holy Hour the app calls every member: their phone rings, shows
**Incoming call**, and one tap drops them into the parish call room.

**How one ring happens.** `runAlarmCheck()` in `lib/alarms.ts` (the "sweep")
spawns the call room, then sends a web-push call payload (`call: true`) to every
active member's subscribed devices. The service worker renders it as an
incoming-call notification with Join/Dismiss and rings for 45 seconds;
`app/dashboard/alarm-listener.tsx` shows a full-screen ringer when the app is
already open. The schedule is `HOLY_HOUR_SCHEDULE`: Mon-Fri 03:00 and 15:00,
Saturday 03:00, Sunday nothing, all in Africa/Kampala.

### 1. Something must run the sweep (required)

**Nothing rings in production until this is configured.** A serverless host has
no timer of its own, so the sweep only runs when something calls it. Left
unconfigured, the only trigger is a member having the app open at the moment,
which never happens at 03:00.

Set `CRON_SECRET` in the environment, then point an external scheduler at the
route **every minute**. Any of these work:

- **cron-job.org** (free): create a job for `https://<your-app>/api/cron/alarms?token=<CRON_SECRET>`,
  schedule every 1 minute.
- **UptimeRobot** (free): a URL monitor on the same URL at a 1-minute interval.
- **GitHub Actions**: a scheduled workflow hitting the same URL with
  `Authorization: Bearer <CRON_SECRET>`.

Vercel's built-in cron can only do this on a **paid** plan. On Hobby, cron jobs
run at most once per day and may drift by up to an hour; a more frequent
expression fails the deployment outright. Per-minute scheduling needs Pro, where
you can add to `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/alarms", "schedule": "* * * * *" }]
}
```

(Also set `CRON_SECRET` if you use this: the route accepts either the `?token=`
query or a Bearer header, so Vercel cron works with `?token=` in the path.)

Every sweep is idempotent and atomic, so calling it more often than necessary is
harmless. The 60-minute window around each occurrence means a late scheduler
still rings rather than silently skipping.

### 2. Test it without waiting

```bash
# Ring one member (use their login phone number)
curl -X POST "https://<your-app>/api/admin/holy-hour-call?token=<CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"to":"+2567XXXXXXXX"}'

# Ring every active member
curl -X POST "https://<your-app>/api/admin/holy-hour-call?token=<CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"all":true}'
```

The response reports, per member, whether the push was `DELIVERED`, whether they
had **NO_SUBSCRIPTION** (never enabled alarms), or whether it **FAILED**, with the
error. Chairperson, Patron and Technical Lead can also call this from a signed-in
session. It never touches the schedule claim, so a test cannot consume or
suppress the real occurrence.

### 3. See who didn't get rung

```bash
curl "https://<your-app>/api/admin/holy-hour-call?token=<CRON_SECRET>"
```

Returns the delivery outcome of the most recent Holy Hour call, one row per
member. Every attempt is recorded in the `HolyHourCallLog` table; failures are
retried once by the next sweep (up to `HOLY_HOUR_CALL_MAX_ATTEMPTS`, see
`lib/alarms.ts`) while the room is still current.

For a coverage picture, `GET /api/admin/push-health` reports how many active
members have a working push subscription.

### Member requirements

A member is only reachable if they installed the app **and** allowed
notifications. A phone number alone is not a delivery channel: there is no
telephony or SMS integration, so a member who never granted notification
permission cannot be rung while the app is closed. Use the two admin routes
above to see exactly who is and isn't covered.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
