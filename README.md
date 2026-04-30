# 🛡️ Silent Shield - Safety SOS

Silent Shield is a production-ready, full-stack Progressive Web Application (PWA) designed to provide immediate assistance to women in distress. It combines real-time location tracking, automated emergency alerts, and stealth features to ensure personal safety.

# 🚀 Key Features

Double-Tap SOS: Instantly triggers an emergency protocol.

Automated Email Alerts: Sends real-time GPS coordinates and user details to trusted contacts via a secured Node.js backend (JWT protected).

Live Safety Map: Integrated with Leaflet.js to show real-time location and nearby safepoints (Hospitals/Police).

Danger Zones: Community-driven reporting to mark unsafe areas on the map.

Stealth Utilities: Includes a "Fake Incoming Call" simulator, audio recording, and a high-frequency acoustic alarm.

Theme Support: Fully responsive Dark and Light mode UI.

Secure Authentication: JWT-based login system with bcrypt password hashing.

# 🛠️ Tech Stack

Frontend: Vanilla JS (ES6+), Tailwind CSS, Leaflet.js.

Backend: Node.js, Express.js.

Authentication: JWT, bcrypt.

Communications: Nodemailer (SMTP Integration).

Deployment: Render (Backend), Static Hosting (Frontend).

# 📦 Installation & Setup

Clone the repository.

Run `npm install` to install dependencies.

Create a `.env` file with the following:
- EMAIL_USER
- EMAIL_PASS
- JWT_SECRET

Run `node server.js` to start the backend.

Serve the frontend using Live Server or any static server.

Ensure the frontend API base URL points to:
`http://127.0.0.1:3000` for local development.