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
const upload = multer();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// ─── CORS (FIXED PROPERLY) ─────────────────────────────
const allowedOrigins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "https://silent-shield-ghtx.onrender.com"
];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (Postman, curl, same-origin)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            console.log("❌ Blocked by CORS:", origin);
            return callback(new Error("CORS blocked"));
        }
    },
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// ─── FILE DB ──────────────────────────
const USERS_FILE = path.join(__dirname, 'data/users.json');
const CONTACTS_FILE = path.join(__dirname, 'data/contacts.json');

function readJSON(file) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
    return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ─── AUTH MIDDLEWARE ──────────────────
function auth(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ success: false });
    }
}

// ─── AUTH ROUTES ──────────────────────
app.post('/api/register', async (req, res) => {
    const { name, age, email, phone, password } = req.body;

    if (!name || !email || !password || !phone || !age)
        return res.status(400).json({ success: false });

    const users = readJSON(USERS_FILE);

    if (users.find(u => u.email === email))
        return res.status(409).json({ success: false });

    const hashed = await bcrypt.hash(password, 10);

    const user = {
        id: Date.now().toString(),
        name, age, email, phone,
        password: hashed
    };

    users.push(user);
    writeJSON(USERS_FILE, users);

    const token = jwt.sign({ id: user.id, email }, JWT_SECRET);

    res.json({
        success: true,
        token,
        user: { id: user.id, name, email }
    });
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);

    if (!user) return res.status(401).json({ success: false });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false });

    const token = jwt.sign({ id: user.id, email }, JWT_SECRET);

    res.json({
        success: true,
        token,
        user: { id: user.id, name: user.name, email }
    });
});

app.delete('/api/deactivate', auth, (req, res) => {
    const email = req.user.email;

    writeJSON(USERS_FILE,
        readJSON(USERS_FILE).filter(u => u.email !== email)
    );

    writeJSON(CONTACTS_FILE,
        readJSON(CONTACTS_FILE).filter(c => c.userEmail !== email)
    );

    res.json({ success: true });
});

// ─── CONTACTS ─────────────────────────
app.get('/api/contacts', auth, (req, res) => {
    const contacts = readJSON(CONTACTS_FILE)
        .filter(c => c.userEmail === req.user.email);

    res.json({ success: true, contacts });
});

app.post('/api/contacts', auth, (req, res) => {
    const { contacts } = req.body;

    let all = readJSON(CONTACTS_FILE)
        .filter(c => c.userEmail !== req.user.email);

    const tagged = contacts.map(c => ({
        ...c,
        userEmail: req.user.email,
        id: c.id || Date.now().toString()
    }));

    all.push(...tagged);
    writeJSON(CONTACTS_FILE, all);

    res.json({ success: true });
});

// ─── SOS ──────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.post('/api/sos', auth, upload.single('evidence'), async (req, res) => {
    const { contacts, lat, lng } = req.body;

    const parsed = JSON.parse(contacts || "[]");
    if (!parsed.length) return res.status(400).json({ success: false });

    const emails = parsed.map(c => c.email).join(',');

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: emails,
            subject: "🚨 SOS ALERT",
            html: `<p>Emergency!</p><a href="https://maps.google.com?q=${lat},${lng}">View Location</a>`
        });

        res.json({ success: true });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${PORT}`);
});