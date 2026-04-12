require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const app = express();

app.use(cors());
app.use(express.json()); 
app.use(express.static('public')); 

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    dnsLookup: (hostname, options, callback) => {
        require('dns').lookup(hostname, { family: 4 }, callback);
    },
    tls: {
        rejectUnauthorized: false 
    }
});

app.post('/api/sos', async (req, res) => {
    const { contacts, lat, lng } = req.body;

    // FIX: Added $ for template literals
    const locationLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const emailList = contacts.map(c => c.email).join(', ');

    const mailOptions = {
        from: `"Silent Shield" <${process.env.EMAIL_USER}>`,
        to: emailList,
        subject: '🚨 EMERGENCY SOS ALERT 🚨',
        html: `
            <div style="font-family: sans-serif; border: 2px solid red; padding: 20px; border-radius: 10px;">
                <h2 style="color: red; text-align: center;">EMERGENCY ALERT TRIGGERED</h2>
                <p>The user has triggered an SOS and requires immediate assistance.</p>
                <p><strong>Live Location:</strong> <a href="${locationLink}" style="color: blue; font-weight: bold;">View on Google Maps</a></p>
                <hr>
                <p style="font-size: 12px; color: #666;">Timestamp: ${new Date().toLocaleString()}</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Emergency Emails Sent Successfully!');
        res.status(200).json({ success: true, message: 'Alerts sent.' });
    } catch (error) {
        console.error('Failed to send email:', error);
        res.status(500).json({ success: false, error: 'Failed to send alerts.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on PORT ${PORT}`));