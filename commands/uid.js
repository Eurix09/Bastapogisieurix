
module.exports = {
    name: 'uid',
    description: 'Get your Telegram user ID',
    execute: async (bot, msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || 'N/A';
        const firstName = msg.from.first_name || '';
        const lastName = msg.from.last_name || '';
        
        const userInfo = `👤 User Information\n\n` +
            `🆔 User ID: ${userId}\n` +
            `💬 Chat ID: ${chatId}\n` +
            `👤 Username: @${username}\n` +
            `📝 Name: ${firstName} ${lastName}`.trim();
        
        bot.sendMessage(chatId, userInfo);
    }
};
