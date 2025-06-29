const express = require('express');
const cors = require('cors');
const { connectToWhatsApp, sendMessage, getQRCode, getConnectionStatus } = require('./connection');

const app = express();
app.use(cors());
app.use(express.json());

// Create a socket instance
let sock;

// Connect endpoint
app.post('/api/connect', async (req, res) => {
    try {
        sock = await connectToWhatsApp();
        res.json({ success: true, message: 'WhatsApp connection initiated' });
    } catch (error) {
        console.error('Connection error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Status endpoint
app.get('/api/status', async (req, res) => {
    try {
        const status = await getConnectionStatus();
        res.json(status);
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send message endpoint
app.post('/api/send-message', async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }
        const result = await sendMessage(to, message);
        res.json(result);
    } catch (error) {
        console.error('Message sending error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get QR code endpoint
app.get('/api/qr-code', async (req, res) => {
    try {
        const qr = await getQRCode();
        res.json({ qr });
    } catch (error) {
        console.error('QR code retrieval error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
