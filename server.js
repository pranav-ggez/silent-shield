require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer'); // Added for file handling
const upload = multer(); // Memory storage for fast processing

const app = express();

app.use(cors({
    origin: ["http://127.0.0.1:5500", "http://localhost:5500"],
    methods: ["GET", "POST"]
}));

app.use(express.json()); 
app.use(express.static('public')); 

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// PATCH: Changed to upload.single('evidence') to catch the audio file
app.post('/api/sos', upload.single('evidence'), async (req, res) => {
    // When using FormData, fields come in req.body as strings
    const { contacts, lat, lng } = req.body;
    const evidenceFile = req.file;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ success: false, error: 'Env variables missing' });
    }

    const locationLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const parsedContacts = JSON.parse(contacts);
    const emailList = parsedContacts.map(c => c.email).join(', ');

    const mailOptions = {
        from: `"Silent Shield" <${process.env.EMAIL_USER}>`,
        to: emailList,
        subject: '🚨 SOS ALERT: VOICE EVIDENCE ATTACHED 🚨',
        html: `
            <div style="font-family: sans-serif; border: 2px solid red; padding: 20px; border-radius: 10px;">
                <h2 style="color: red; text-align: center;">EMERGENCY ALERT</h2>
                <p>The user has triggered an SOS. Voice evidence is attached to this email.</p>
                <p><strong>Location:</strong> <a href="${locationLink}" style="color: blue; font-weight: bold;">View on Google Maps</a></p>
                <hr>
                <p style="font-size: 12px; color: #666;">Timestamp: ${new Date().toLocaleString()}</p>
            </div>
        `,
        attachments: []
    };

    // If an audio file exists in the request, attach it
    if (evidenceFile) {
        mailOptions.attachments.push({
            filename: `Evidence_${Date.now()}.webm`,
            content: evidenceFile.buffer
        });
    }

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ SOS Email with Evidence Sent!');
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Nodemailer Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));