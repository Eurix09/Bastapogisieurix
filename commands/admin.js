
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'admin',
    description: 'Add new admin IP address (Owner only)',
    execute: async (bot, msg, args) => {
        const chatId = msg.chat.id;
        const configPath = path.join(__dirname, '..', 'config.json');
        
        // Load config
        let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Check if user is owner (original chat ID)
        if (chatId.toString() !== config.telegram.chatId) {
            return bot.sendMessage(chatId, '❌ Unauthorized! Only the owner can add admin IPs.');
        }
        
        if (!args || args.length === 0) {
            return bot.sendMessage(chatId, '⚠️ Usage: /admin <IP_ADDRESS>\n\nExample: /admin 192.168.1.100');
        }
        
        const newIP = args[0];
        
        // Validate IP format (basic validation)
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(newIP)) {
            return bot.sendMessage(chatId, '❌ Invalid IP address format!');
        }
        
        // Initialize adminIps if it doesn't exist
        if (!config.adminIps) {
            config.adminIps = [];
        }
        
        // Check if IP already exists
        if (config.adminIps.includes(newIP)) {
            return bot.sendMessage(chatId, '⚠️ This IP address is already authorized!');
        }
        
        // Add new IP
        config.adminIps.push(newIP);
        
        // Save config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        const successMsg = `✅ Admin IP Added!\n\n` +
            `🌐 IP: ${newIP}\n` +
            `📊 Total Admin IPs: ${config.adminIps.length}\n\n` +
            `This IP can now:\n` +
            `• Upload photos 📸\n` +
            `• Upload music 🎵\n` +
            `• Delete photos 🗑️`;
        
        bot.sendMessage(chatId, successMsg);
    }
};
