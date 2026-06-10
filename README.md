# 🏨 Royal Crown / Royal Crown Hotel Management — Frontend

Vanilla HTML/CSS/JavaScript single-page frontend for the hotel management backend.

---

## Files

```text
frontend/
├── index.html   # UI, pages, modals, styles
├── script.js    # API client + all frontend behavior
├── config.js    # API URL configuration
└── img.png      # image asset
```

---

## Connect to the Backend

Open `config.js` and set `API_BASE`:

```js
window.APP_CONFIG = {
  API_BASE: 'http://localhost:5000/api',
  REFRESH_INTERVAL_MS: 30000,
  DEFAULT_PAGE: 'home',
};
```

Common values:

```js
// Local backend
API_BASE: 'http://localhost:5000/api'

// Hosted Render backend
API_BASE: 'https://hotelmanagmentbackend.onrender.com/api'
```

The topbar checks `API_BASE + '/health'` every 30 seconds and shows **API Connected** or **API Offline**.

---

## Run Locally

Because this is static HTML, you can open `index.html` directly in your browser.

Recommended for development: serve it from a small static server:

```bash
# Python
python -m http.server 5500

# then open:
# http://localhost:5500
```

If you do this, keep backend CORS set to allow your frontend URL, for example:

```env
CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500
```

---

## What is Connected

The frontend now calls the backend for:

- Dashboard stats
- Guests
- Guest feedback
- Rooms + facilities
- Maintenance
- Admin reservations/bookings
- Booking history
- Cancellations
- Payments + invoices
- Public “Book Now” reservation form

---

## Notes

- Public bookings collect guest/contact/proof details, create the guest profile, then create the booking.
- For production, update hotel branding/contact details in the backend invoice route and frontend text.
- Avoid editing `script.js` just to change backend URL — use `config.js` instead.
