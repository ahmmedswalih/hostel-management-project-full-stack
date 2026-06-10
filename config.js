// ============================================================
// config.js — Frontend configuration
// Edit this file to point at a different backend.
// ============================================================

window.APP_CONFIG = {
  // Where the API lives. Examples:
  //   local dev:        'http://localhost:5000/api'
  //   hosted (Render):  'https://hotelmanagmentbackend.onrender.com/api'
  //   staging:          'https://your-staging.example.com/api'
  API_BASE: 'http://localhost:5000/api',

  // How often (ms) the topbar API-status pill is refreshed.
  // Set to 0 to disable automatic refreshes.
  REFRESH_INTERVAL_MS: 30_000,

  // Optional default page to land on when the app first loads.
  // Set to 'dashboard' (admin view), 'home' (public site), or anything else.
  DEFAULT_PAGE: 'home',
};
