const express = require('express');
const { connectToWhatsApp, sendMessage, getQRCode, getConnectionStatus } = require('./connection');
const router = express.Router();

// Initialize connection
let connection;

// Start connection when API server starts
async function initializeConnection() {
    try {
        connection = await connectToWhatsApp();
        console.log('WhatsApp connection initialized');
    } catch (error) {
        console.error('Failed to initialize connection:', error);
    }
}

// API endpoints
router.get('/status', async (req, res) => {
    try {
        const status = await getConnectionStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/qr', async (req, res) => {
    try {
        const qr = await getQRCode();
        if (qr) {
            res.json({ qr });
        } else {
            res.status(404).json({ error: 'QR code not available' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/send', async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ error: 'to and message are required' });
        }

        const result = await sendMessage(to, message);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = {
    router,
    initializeConnection
};
