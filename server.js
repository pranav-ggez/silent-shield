require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
// FIX: multer must be initialized before route definitions
const upload = multer();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// ─── CORS ──────────────────────────────────────────────
const allowedOrigins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "https://silent-shield-ghtx.onrender.com"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        console.log("❌ Blocked by CORS:", origin);
        return callback(new Error("CORS blocked"));
    },
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// ─── FILE DB ───────────────────────────────────────────
const USERS_FILE = path.join(__dirname, 'data/users.json');
const CONTACTS_FILE = path.join(__dirname, 'data/contacts.json');

function readJSON(file) {
    if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, '[]');
    }
    return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ─── AUTH MIDDLEWARE ───────────────────────────────────
function auth(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: 'No token' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Invalid token' });
    }
}

// ─── REGISTER ──────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    const { name, age, email, phone, password } = req.body;
    if (!name || !email || !password || !phone || !age)
        return res.status(400).json({ success: false, error: 'All fields required' });

    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email === email))
        return res.status(409).json({ success: false, error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = { id: Date.now().toString(), name, age, email, phone, password: hashed };
    users.push(user);
    writeJSON(USERS_FILE, users);

    const token = jwt.sign({ id: user.id, email }, JWT_SECRET);
    res.json({ success: true, token, user: { id: user.id, name, email, phone } });
});

// ─── LOGIN ─────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);

    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email }, JWT_SECRET);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email, phone: user.phone } });
});

// ─── DEACTIVATE ────────────────────────────────────────
app.delete('/api/deactivate', auth, (req, res) => {
    const email = req.user.email;
    writeJSON(USERS_FILE, readJSON(USERS_FILE).filter(u => u.email !== email));
    writeJSON(CONTACTS_FILE, readJSON(CONTACTS_FILE).filter(c => c.userEmail !== email));
    res.json({ success: true });
});

// ─── CONTACTS: GET ─────────────────────────────────────
app.get('/api/contacts', auth, (req, res) => {
    const contacts = readJSON(CONTACTS_FILE).filter(c => c.userEmail === req.user.email);
    res.json({ success: true, contacts });
});

// ─── CONTACTS: SAVE ────────────────────────────────────
app.post('/api/contacts', auth, (req, res) => {
    const { contacts } = req.body;
    let all = readJSON(CONTACTS_FILE).filter(c => c.userEmail !== req.user.email);
    const tagged = contacts.map(c => ({
        ...c,
        userEmail: req.user.email,
        id: c.id || Date.now().toString()
    }));
    all.push(...tagged);
    writeJSON(CONTACTS_FILE, all);
    res.json({ success: true });
});

// ─── NODEMAILER ────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ─── SOS ───────────────────────────────────────────────
// FIX 1: upload.single('evidence') must come BEFORE auth in middleware order.
//         multipart/form-data bodies are only parsed by multer — without it running
//         first, req.body is empty and the JWT token can't even be read from it.
//         Solution: run multer first, then auth reads from headers (which it already does).
//
// FIX 2: req.file (the audio blob) was being parsed but never attached to the email.
//         The attachments array was missing entirely from sendMail.

app.post('/api/sos', upload.single('evidence'), auth, async (req, res) => {
    const { contacts, lat, lng, userName, userPhone } = req.body;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)
        return res.status(500).json({ success: false, error: 'Email credentials not set in .env' });

    let parsed;
    try {
        parsed = JSON.parse(contacts || '[]');
    } catch {
        return res.status(400).json({ success: false, error: 'Invalid contacts JSON' });
    }

    if (!parsed.length)
        return res.status(400).json({ success: false, error: 'No contacts provided' });

    const emails = parsed.map(c => c.email).join(', ');
    const locationLink = lat && lng
        ? `https://www.google.com/maps?q=${lat},${lng}`
        : null;

    const htmlBody = `
        <div style="font-family:sans-serif;border:2px solid red;padding:20px;border-radius:10px;max-width:500px;">
            <h2 style="color:red;text-align:center;">🚨 EMERGENCY SOS ALERT 🚨</h2>
            <p><strong>${userName || 'A Silent Shield user'}</strong> has triggered an emergency SOS and may be in danger.</p>
            ${locationLink
                ? `<p>📍 <strong>Location:</strong> <a href="${locationLink}" style="color:blue;font-weight:bold;">View on Google Maps</a></p>`
                : '<p>⚠️ <strong>GPS location was unavailable at time of alert.</strong></p>'
            }
            ${userPhone ? `<p>📞 <strong>Phone:</strong> ${userPhone}</p>` : ''}
            <p style="color:red;font-weight:bold;">Please call them immediately. If unreachable, contact police (112).</p>
            ${req.file ? '<p>🎙️ <strong>Voice evidence is attached to this email.</strong></p>' : ''}
            <hr style="margin:16px 0;">
            <p style="font-size:11px;color:#888;">
                Sent automatically by Silent Shield safety app<br>
                ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </p>
        </div>`;

    const mailOptions = {
        from: `"Silent Shield 🛡️" <${process.env.EMAIL_USER}>`,
        to: emails,
        subject: `🚨 SOS — ${userName || 'User'} needs help NOW`,
        html: htmlBody,
        // FIX 2: actually attach the audio file if it was sent
        attachments: req.file ? [{
            filename: `Evidence_${Date.now()}.webm`,
            content: req.file.buffer,
            contentType: 'audio/webm'
        }] : []
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ SOS sent for ${userName} → ${emails} | attachment: ${req.file ? 'YES' : 'NO'}`);
        res.json({ success: true });
    } catch (e) {
        console.error('❌ Email error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Silent Shield server on port ${PORT}`);
});