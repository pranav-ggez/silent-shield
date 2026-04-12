const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const app = express();

// Middleware
app.use(cors());
app.use(express.json()); 
app.use(express.static('public')); // Serves your frontend files

// Configure the Email Transporter (Use your Gmail)
// NOTE: You must generate an "App Password" in your Google Account settings for this to work.
require('dotenv').config(); // Load the .env file

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    }
});

// The SOS Endpoint
app.post('/api/sos', async (req, res) => {
    const { contacts, lat, lng } = req.body;

    const locationLink = `https://www.google.com/maps?q=${lat},${lng}`;
    
    // We are using emails instead of phone numbers for this demonstration
    const emailList = contacts.map(c => c.email).join(', ');

    const mailOptions = {
        from: 'Silent Shield <your.email@gmail.com>',
        to: emailList,
        subject: '🚨 EMERGENCY SOS ALERT 🚨',
        html: `
            <h2 style="color: red;">EMERGENCY ALERT TRIGGERED</h2>
            <p>The user has triggered an SOS and requires immediate assistance.</p>
            <p><strong>Live Location:</strong> <a href="${locationLink}">View on Google Maps</a></p>
            <p><em>Timestamp: ${new Date().toLocaleString()}</em></p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Emergency Emails Sent Successfully!');
        res.status(200).json({ success: true, message: 'Alerts sent to contacts.' });
    } catch (error) {
        console.error('Failed to send email:', error);
        res.status(500).json({ success: false, error: 'Failed to send alerts.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));