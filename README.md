# Bar Order App

A small full-stack MVP for linking one pending bar pickup order to a customer's installed PWA by scanning a fixed QR code.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Auth: single admin user from environment variables
- PWA: manifest + service worker registration for the customer app

## Folder Structure

```text
bar-order-app/
  client/
    public/
      manifest.webmanifest
      sw.js
    src/
      components/
      lib/
      pages/
      App.jsx
      main.jsx
      styles.css
  server/
    src/
      config/
      middleware/
      models/
      routes/
      utils/
      app.js
      server.js
  package.json
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment files:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

3. Start MongoDB locally, or set `MONGODB_URI` in `server/.env`.

4. Start development:

```bash
npm run dev
```

- Customer PWA: http://localhost:5173
- Admin panel: http://localhost:5173/admin
- API: http://localhost:5001/api

The Vite dev server proxies `/api` to the Express server.

## Admin Login

The default admin user is configured in `server/.env`:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-now
```

Change these before using the app outside local development. For production, you can set `ADMIN_PASSWORD_HASH` to a bcrypt hash instead of storing `ADMIN_PASSWORD`.

## Fixed QR Code

Create one physical QR code for the bar that contains the value of:

```env
QR_SECRET_CODE=BAR_FIXED_QR_CODE
```

When a customer scans that QR from the installed PWA, the backend atomically finds the only order in `pending_link` status and links it to that device/session.

## Web Push Notifications

The app supports real browser Web Push with VAPID. Generate keys with:

```bash
npx web-push generate-vapid-keys --json
```

Add the generated values to `server/.env`:

```env
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_SUBJECT=mailto:admin@example.com
```

Customers must tap `Enable notifications` after linking their order. Once enabled, the admin can send a push notification with the bell button, and changing an order to `ready` sends a push automatically.

## Production Build

Build the React app:

```bash
npm run build
```

Run the Express server:

```bash
npm start
```

In production, Express serves `client/dist` so the customer app and admin panel share the same domain and base URL.

## API Summary

### Admin

- `POST /api/admin/login`
- `GET /api/admin/orders`
- `POST /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`
- `POST /api/admin/orders/:id/ping`
- `DELETE /api/admin/orders/:id`

### Customer

- `POST /api/customer/link`
- `GET /api/customer/order?deviceId=...`
- `GET /api/customer/push-config`
- `POST /api/customer/push-subscriptions`

## Order Statuses

- `pending_link`
- `linked`
- `preparing`
- `ready`
- `delivered`
- `cancelled`

MongoDB enforces the "only one pending order" rule with a partial unique index on `status: "pending_link"`.
