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
    try {
        console.log('Starting WhatsApp connection...');
        console.log('Using session directory:', path.join(__dirname, '.', 'temp', 'wasi-session'));

        const sessionDir = process.env.WHATSAPP_SESSION_DIR || path.join(__dirname, '.', 'temp', 'wasi-session');
        console.log('Using session directory:', sessionDir);
        console.log('Initializing auth state...');
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        console.log('Auth state initialized successfully');

        console.log('Creating WhatsApp socket...');
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'info' }),
            browser: Browsers.macOS('Desktop'),
            version: [2, 2204, 12], // Specify a specific version that works
            printQR: (qr) => {
                console.log('QR Code received:', qr);
            },
            onUnexpectedError: (error) => {
                console.error('Unexpected error:', error);
                throw error;
            },
            onConnectionError: (error) => {
                console.error('Connection error:', error);
                throw error;
            },
            onConnectionUpdate: (update) => {
                console.log('Connection update:', update);
                if (update.connection === 'open') {
                    console.log('WhatsApp connection established successfully');
                } else if (update.connection === 'close') {
                    console.log('WhatsApp connection closed');
                }
            },
            connectionOptions: {
                useWebSocket: false, // Use HTTP instead of WebSocket
                maxRetries: 5, // Limit retries
                retryDelayMs: 5000 // 5 second delay between retries
            },
            ws: {
                options: {
                    agent: new https.Agent({
                        keepAlive: true,
                        timeout: 30000 // 30 second timeout
                    })
                }
            }
        });

        console.log('Setting up event listeners...');
        sock.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                console.log('Received messages:', messages);
                messages.forEach(msg => {
                    console.log('Received message:', {
                        from: msg.key.remoteJid,
                        message: msg.message?.conversation,
                        type: msg.message?.messageType
                    });
                });
            } catch (error) {
                console.error('Error handling messages:', error);
            }
        });
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        try {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrCode = qr;
                console.log('New QR code received:', qr);
            }

            if (connection === 'open') {
                qrCode = null;
                console.log('WhatsApp connection opened successfully.');
                
                // Store the connection object
                sock = sock;
            } else if (connection === 'close') {
                console.log('WhatsApp connection closed');
                
                // Check if it was a normal logout
                if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                    console.log('Logged out. Please delete the session and restart.');
                    cleanupSession(sessionDir);
                }
            }
        } catch (error) {
            console.error('Error handling connection update:', error);
        }
    });
    return sock;
    } catch (error) {
        console.error('Error in connectToWhatsApp:', error);
        throw error;
    }
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
