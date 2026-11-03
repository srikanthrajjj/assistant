# Assistant MVP
Agent loop + tools (reminders, tasks, email, tickets, web search) + proactive reminders/daily digest.
## Run
    cd server && npm install
    ANTHROPIC_API_KEY=sk-... APP_TOKEN=choose-a-secret npm start      # http://localhost:3000
Open on your phone (same Wi-Fi or deploy to Cloud Run/Render) -> "Add to Home screen" = installable app.
`npm test` runs the full loop offline with a fake LLM (no key needed).
## Mock vs real
Email + tickets are MOCKS (server/tools.js). Reminders, tasks, web search (Anthropic server tool), confirm-before-booking, notifications are real.
## Next: Gmail OAuth (replace search_emails), real ticket API, FCM push, per-user auth.
