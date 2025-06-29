const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    DisconnectReason,
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Global variables to hold the socket instance and QR code
let sock;
let qrCode;

// Helper function to delay execution
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to clean up session files
function cleanupSession(sessionDir) {
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`Cleaned up session directory: ${sessionDir}`);
    }
}

// The main function to connect to WhatsApp
async function connectToWhatsApp() {
    const sessionDir = path.join(__dirname, '..', 'temp', 'wasi-session');
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'info' }),
        browser: Browsers.macOS('Desktop'),
    });

    // Set up event listeners
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        messages.forEach(msg => {
            console.log('Received message:', {
                from: msg.key.remoteJid,
                message: msg.message?.conversation,
                type: msg.message?.messageType
            });
        });
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCode = qr;
            console.log('New QR code received:', qr);
        }

        if (connection === 'open') {
            qrCode = null;
            console.log('WhatsApp connection opened successfully.');
            
            // Get user info
            const { id, name } = sock.user;
            console.log('Connected as:', name, id);
        }

        if (connection === 'close') {
            qrCode = null;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = DisconnectReason[statusCode] || 'Unknown';
            console.log(`Connection closed. Reason: ${reason}`);

            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('Attempting to reconnect...');
                await delay(10000);
                connectToWhatsApp();
            } else {
                console.log('Logged out. Please delete the session and restart.');
                cleanupSession(sessionDir);
            }
        }
    });

    return sock;
}

// Function to send message to a contact
async function sendMessage(to, message) {
    if (!sock) {
        throw new Error('WhatsApp connection not established');
    }

    try {
        // Validate phone number format
        const cleanedNumber = to.replace(/[^+\d]/g, '');
        if (!cleanedNumber.startsWith('+')) {
            throw new Error('Phone number must start with +');
        }
        
        // Get the phone number without +
        const phone = cleanedNumber.substring(1);
        if (phone.length < 10) {
            throw new Error('Phone number is too short');
        }

        // Format the recipient JID
        const jid = `${phone}@c.us`;
        
        // Send the message
        const result = await sock.sendMessage(jid, {
            text: message
        }, { waitForAck: true });

        if (result.key) {
            console.log('Message sent successfully:', {
                messageId: result.key.id,
                from: sock.user.id,
                to: jid
            });
            return { 
                success: true, 
                message: 'Message sent successfully',
                messageId: result.key.id
            };
        } else {
            throw new Error('Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        return { 
            success: false, 
            error: error.message,
            details: error.stack 
        };
    }
}

// Function to get the current QR code
async function getQRCode() {
    return qrCode;
}

// Function to check connection status
async function getConnectionStatus() {
    return {
        isConnected: sock?.user?.id ? true : false,
        qrCode: qrCode
    };
}

module.exports = {
    connectToWhatsApp,
    sendMessage,
    getQRCode,
    getConnectionStatus
};
