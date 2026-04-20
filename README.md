# Bar Order App

A small full-stack MVP for Phangan Arena Bar. Customers choose a unique name, browse a mobile-first menu, place pickup orders, and receive Web Push notifications when the order is ready.

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
      data/
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

## Menu And Promotions

On first database connection, the backend seeds the real Phangan Arena Bar menu and promotions if the menu collections are empty.

From `/admin`, use:

- `Orders` to view orders, update status, send notification pings, and delete orders.
- `Menu` to create, edit, activate, disable, or delete menu items.
- `Promotions` to create, edit, activate, disable, or delete customer-facing promotion cards.

Customer menu data is read from MongoDB, so admin changes are reflected in the PWA without changing code.

## Customer Flow

1. Customer opens the app and chooses a unique name.
2. Customer browses promotions, searches, filters by category, and adds items to the cart.
3. Customer confirms the order.
4. Admin moves the order through `pending`, `preparing`, `ready`, and `delivered`.
5. The app sends a push notification when the order becomes `ready`.

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

Customers must tap `Enable notifications`. Once enabled, the admin can send a push notification with the bell button, and changing an order to `ready` sends a push automatically.

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
- `PATCH /api/admin/orders/:id/status`
- `POST /api/admin/orders/:id/ping`
- `DELETE /api/admin/orders/:id`
- `GET /api/admin/menu-items`
- `POST /api/admin/menu-items`
- `PATCH /api/admin/menu-items/:id`
- `DELETE /api/admin/menu-items/:id`
- `GET /api/admin/promotions`
- `POST /api/admin/promotions`
- `PATCH /api/admin/promotions/:id`
- `DELETE /api/admin/promotions/:id`

### Customer

- `GET /api/customer/menu`
- `GET /api/customer/name-availability?name=...`
- `POST /api/customer/orders`
- `GET /api/customer/order?deviceId=...`
- `GET /api/customer/push-config`
- `POST /api/customer/push-subscriptions`

## Order Statuses

- `pending`
- `preparing`
- `ready`
- `delivered`

MongoDB enforces unique active customer names with a partial unique index on active orders.
