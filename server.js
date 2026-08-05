const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Allows frontend to talk to backend

// Stores verified sessions in memory: { "VERIFY_123456": "919876543210" }
const verifiedTokens = new Map();

async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) {
            console.log('\n--- SCAN THIS QR CODE WITH YOUR COMPANY WHATSAPP ---');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
            console.log('✅ WhatsApp listener active and ready!');
        }
    });

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const senderPhone = msg.key.remoteJid.split('@')[0];

        // Match verification code in message
        if (text.includes('VERIFY_')) {
            const tokenMatch = text.match(/VERIFY_\d+/);
            if (tokenMatch) {
                const token = tokenMatch[0];
                
                // Store phone number against the token
                verifiedTokens.set(token, senderPhone);

                // Auto-reply confirmation inside WhatsApp
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '✅ Login verification successful! You can now return to your browser.'
                });
            }
        }
    });
}

// Endpoint polled by the frontend
app.get('/api/check-verification/:token', (req, res) => {
    const { token } = req.params;

    if (verifiedTokens.has(token)) {
        const phone = verifiedTokens.get(token);
        return res.json({ verified: true, phone: phone });
    }

    return res.json({ verified: false });
});

app.listen(3000, () => {
    console.log('Backend server running on http://localhost:3000');
    startWhatsAppBot();
});
