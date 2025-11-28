const express = require('express');
const path = require("path");
const fs = require("fs");
const moment = require("moment");
const multer = require('multer');
const TelegramBot = require('node-telegram-bot-api');
const app = express();
const PORT = process.env.PORT || 5000;
const USER_IP_FILE = path.join(__dirname, 'ip_data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Trust the X-Forwarded-For header from Replit's proxy
app.set('trust proxy', true);

// Load config.json
let config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

// Load Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || config.telegram.botToken;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || config.telegram.chatId;

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Load bot commands
const commands = new Map();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(__dirname, 'commands', file));
    commands.set(command.name, command);
}

// Bot command handler
bot.onText(/^\/(\w+)(.*)/, async (msg, match) => {
    const commandName = match[1].toLowerCase();
    const args = match[2].trim().split(/\s+/).filter(arg => arg.length > 0);
    
    if (commands.has(commandName)) {
        try {
            await commands.get(commandName).execute(bot, msg, args);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            bot.sendMessage(msg.chat.id, '❌ An error occurred while executing the command.');
        }
    }
});

// Helper function to convert IP string to hex
function ipToHex(ip) {
    const parts = ip.split('.');
    return '0x' + parts.map(part => {
        const hex = parseInt(part).toString(16);
        return hex.padStart(2, '0');
    }).join('');
}

// Helper function to check if IP is admin
function isAdminIP(ip) {
    // Reload config to get latest adminIps
    const currentConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const adminIps = currentConfig.adminIps || [];
    
    // Convert all admin IPs to hex and check
    const ipHex = ipToHex(ip);
    return adminIps.some(adminIp => ipToHex(adminIp) === ipHex);
}

app.use(express.json());

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const imagesDir = path.join(__dirname, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir);
        }
        cb(null, imagesDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'photo' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Configure multer for music uploads
const musicStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const musicDir = path.join(__dirname, 'music');
        if (!fs.existsSync(musicDir)) {
            fs.mkdirSync(musicDir);
        }
        cb(null, musicDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const uploadMusic = multer({ 
    storage: musicStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for music
    fileFilter: function (req, file, cb) {
        const allowedTypes = /mp3|mpeg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only MP3 files are allowed!'));
        }
    }
});

// Helper function to get user IP
function getUserIP(req) {
    return req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0] : req.socket.remoteAddress;
}
// Serve static files from the music directory
app.use('/music', express.static(path.join(__dirname, 'music')));

// Serve static files from the images directory
app.use('/images', express.static(path.join(__dirname, 'images')));

app.get("/", async (req, res) => {
    // Track homepage visit
    try {
        const userIp = req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0] : req.socket.remoteAddress;

        // Load IP data if available
        let ipData = null;
        try {
            if (fs.existsSync(USER_IP_FILE)){
                const ipDataRaw = fs.readFileSync(USER_IP_FILE, "utf8");
                const allIpData = JSON.parse(ipDataRaw);
                ipData = allIpData.find(entry => entry.query === userIp);
            }
        } catch (error) {
            console.error("Error reading IP data:", error);
        }

        // Get detailed IP information from API if not cached
        if (!ipData) {
            const ipInfoResponse = await fetch(`http://ip-api.com/json/${userIp}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`);
            ipData = await ipInfoResponse.json();

            // Save to file for future reference
            try {
                let allIpData = [];
                if (fs.existsSync(USER_IP_FILE)) {
                    const existingData = fs.readFileSync(USER_IP_FILE, "utf8");
                    allIpData = JSON.parse(existingData);
                }
                allIpData.push(ipData);
                fs.writeFileSync(USER_IP_FILE, JSON.stringify(allIpData, null, 2));
            } catch (error) {
                console.error("Error saving IP data:", error);
            }
        }

        // Send message to Telegram
        const notificationMsg = `🚀 Website Visited!\n\n` +
            `🌐 IP: ${userIp}\n` +
            `📍 Location: ${ipData?.city || 'Unknown'}, ${ipData?.country || 'Unknown'}\n` +
            `🏢 ISP: ${ipData?.isp || 'Unknown'}\n` +
            `📮 ZIP: ${ipData?.zip || 'Unknown'}\n` +
            `⏰ Time: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n` +
            `🌍 Region: ${ipData?.regionName || 'Unknown'}\n` +
            `👀 User Agent: ${req.headers["user-agent"] || 'Unknown'}\n` +
            `🖥️ Path: Homepage Visit`;

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(telegramUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: notificationMsg
            })
        });
    } catch (error) {
        console.error("Error tracking homepage visit:", error);
    }

    res.sendFile(__dirname + "/index.html");
});

app.get("/random-music", async (req, res) => {
    try {
        const musicDir = path.join(__dirname, 'music');
        const files = fs.readdirSync(musicDir).filter(file => file.endsWith('.mp3'));

        if (files.length === 0) {
            return res.status(404).json({ error: "No music files found" });
        }

        const randomFile = files[Math.floor(Math.random() * files.length)];
        res.json({ file: randomFile, url: `/music/${randomFile}` });
    } catch (error) {
        console.error("Error reading music directory:", error);
        res.status(500).json({ error: "Error reading music files" });
    }
});

// Check if user is admin
app.get("/api/check-admin", (req, res) => {
    const userIP = getUserIP(req);
    const isAdmin = isAdminIP(userIP);
    console.log(`Admin check: IP=${userIP}, Admin=${isAdmin}`);
    res.json({ isAdmin });
});

// Get gallery images
app.get("/api/gallery-images", (req, res) => {
    try {
        const imagesDir = path.join(__dirname, 'images');
        if (!fs.existsSync(imagesDir)) {
            return res.json({ images: [] });
        }

        const files = fs.readdirSync(imagesDir)
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => `/images/${file}`);

        res.json({ images: files });
    } catch (error) {
        console.error("Error reading images directory:", error);
        res.status(500).json({ error: "Error reading images" });
    }
});

// Upload photo (admin only)
app.post("/api/upload-photo", upload.single('photo'), async (req, res) => {
    const userIP = getUserIP(req);
    
    if (!isAdminIP(userIP)) {
        if (req.file) {
            fs.unlinkSync(req.file.path); // Delete uploaded file
        }
        return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    try {
        // Send Telegram notification
        const notificationMsg = `📸 New Photo Uploaded!\n\n` +
            `👤 Admin IP: ${userIP}\n` +
            `📁 Filename: ${req.file.filename}\n` +
            `📦 Size: ${(req.file.size / 1024).toFixed(2)} KB\n` +
            `⏰ Time: ${moment().format("YYYY-MM-DD HH:mm:ss")}`;

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: notificationMsg
            })
        });

        res.json({ success: true, filename: req.file.filename });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete photo (admin only)
app.post("/api/delete-photo", async (req, res) => {
    const userIP = getUserIP(req);
    
    if (!isAdminIP(userIP)) {
        return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const { imagePath } = req.body;
    
    if (!imagePath) {
        return res.status(400).json({ success: false, error: "No image path provided" });
    }

    try {
        const filename = path.basename(imagePath);
        const filePath = path.join(__dirname, 'images', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: "File not found" });
        }

        fs.unlinkSync(filePath);

        // Send Telegram notification
        const notificationMsg = `🗑️ Photo Deleted!\n\n` +
            `👤 Admin IP: ${userIP}\n` +
            `📁 Filename: ${filename}\n` +
            `⏰ Time: ${moment().format("YYYY-MM-DD HH:mm:ss")}`;

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: notificationMsg
            })
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload music (admin only)
app.post("/api/upload-music", uploadMusic.single('music'), async (req, res) => {
    const userIP = getUserIP(req);
    
    if (!isAdminIP(userIP)) {
        if (req.file) {
            fs.unlinkSync(req.file.path); // Delete uploaded file
        }
        return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    try {
        // Send Telegram notification
        const notificationMsg = `🎵 New Music Uploaded!\n\n` +
            `👤 Admin IP: ${userIP}\n` +
            `📁 Filename: ${req.file.filename}\n` +
            `📦 Size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB\n` +
            `⏰ Time: ${moment().format("YYYY-MM-DD HH:mm:ss")}`;

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: notificationMsg
            })
        });

        res.json({ success: true, filename: req.file.filename });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});