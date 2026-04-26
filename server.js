require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const upload = multer();
const app = express();

app.use(cors({
    origin: ["http://127.0.0.1:5500", "http://localhost:5500"],
    methods: ["GET", "POST", "PUT", "DELETE"]
}));
app.use(express.json());
app.use(express.static('public'));

// ── DB helpers (flat JSON files) ──────────────────────────────────────────────
const USERS_FILE = path.join(__dirname, 'users.json');
const CONTACTS_FILE = path.join(__dirname, 'contacts.json');

function readJSON(file) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── AUTH: Register ─────────────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
    const { name, age, email, phone, password } = req.body;
    if (!name || !email || !password || !phone || !age)
        return res.status(400).json({ success: false, error: 'All fields required' });

    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email === email))
        return res.status(409).json({ success: false, error: 'Email already registered' });

    const user = { id: Date.now().toString(), name, age, email, phone, password };
    users.push(user);
    writeJSON(USERS_FILE, users);

    const { password: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// ── AUTH: Login ────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const { password: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// ── AUTH: Deactivate ───────────────────────────────────────────────────────────
app.delete('/api/deactivate', (req, res) => {
    const { email } = req.body;
    let users = readJSON(USERS_FILE);
    users = users.filter(u => u.email !== email);
    writeJSON(USERS_FILE, users);

    let contacts = readJSON(CONTACTS_FILE);
    contacts = contacts.filter(c => c.userEmail !== email);
    writeJSON(CONTACTS_FILE, contacts);

    res.json({ success: true });
});

// ── CONTACTS: Get ──────────────────────────────────────────────────────────────
app.get('/api/contacts', (req, res) => {
    const { email } = req.query;
    const contacts = readJSON(CONTACTS_FILE);
    res.json({ success: true, contacts: contacts.filter(c => c.userEmail === email) });
});

// ── CONTACTS: Save (full replace) ─────────────────────────────────────────────
app.post('/api/contacts', (req, res) => {
    const { email, contacts } = req.body;
    let all = readJSON(CONTACTS_FILE);
    all = all.filter(c => c.userEmail !== email);
    const tagged = contacts.map(c => ({ ...c, userEmail: email, id: c.id || Date.now().toString() }));
    all.push(...tagged);
    writeJSON(CONTACTS_FILE, all);
    res.json({ success: true });
});

// ── SOS ───────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.post('/api/sos', upload.single('evidence'), async (req, res) => {
    const { contacts, lat, lng } = req.body;
    const evidenceFile = req.file;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)
        return res.status(500).json({ success: false, error: 'Env variables missing' });

    const locationLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const parsedContacts = JSON.parse(contacts);
    const emailList = parsedContacts.map(c => c.email).join(', ');

    const mailOptions = {
        from: `"Silent Shield" <${process.env.EMAIL_USER}>`,
        to: emailList,
        subject: '🚨 SOS ALERT: VOICE EVIDENCE ATTACHED 🚨',
        html: `
            <div style="font-family:sans-serif;border:2px solid red;padding:20px;border-radius:10px;">
                <h2 style="color:red;text-align:center;">EMERGENCY ALERT</h2>
                <p>The user has triggered an SOS. Voice evidence is attached to this email.</p>
                <p><strong>Location:</strong> <a href="${locationLink}" style="color:blue;font-weight:bold;">View on Google Maps</a></p>
                <hr>
                <p style="font-size:12px;color:#666;">Timestamp: ${new Date().toLocaleString()}</p>
            </div>`,
        attachments: []
    };

    if (evidenceFile) {
        mailOptions.attachments.push({
            filename: `Evidence_${Date.now()}.webm`,
            content: evidenceFile.buffer
        });
    }

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ SOS Email Sent!');
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Nodemailer Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));