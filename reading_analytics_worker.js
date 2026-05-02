// reading_analytics_worker.js
// This worker analyzes the chat in a single pass during the file reading phase.
// It runs concurrently with the main parser to ensure zero UI blocking and does not alter existing logic.

self.onmessage = function(e) {
    const text = e.data;
    
    const stats = {
        totalMessages: 0,
        users: {},
        monthlyActivity: {}
    };
    
    let start = 0;
    const len = text.length;
    
    let lastTimeObj = null;
    let lastSender = null;
    let lastDate = null;
    let currentConsecutive = 0;
    
    // Helper to parse date/time quickly
    function parseDate(d, t) {
        if (!d || !t) return null;
        const parts = d.split("/");
        if (parts.length !== 3) return null;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        
        let match = t.match(/(\d+):(\d+)/);
        if (!match) return null;
        let fullYear = year < 100 ? 2000 + year : year;
        return new Date(fullYear, month - 1, day, parseInt(match[1], 10), parseInt(match[2], 10));
    }
    
    while (start < len) {
        let end = text.indexOf('\n', start);
        if (end === -1) end = len;
        
        let lineStart = start;
        let lineEnd = end;
        while(lineStart < lineEnd && (text.charCodeAt(lineStart) === 32 || text.charCodeAt(lineStart) === 13)) lineStart++;
        while(lineEnd > lineStart && (text.charCodeAt(lineEnd - 1) === 32 || text.charCodeAt(lineEnd - 1) === 13)) lineEnd--;
        
        let line = text.substring(lineStart, lineEnd);
        
        if (line) {
            let match = null;
            let commaIdx = line.indexOf(', ');
            if (commaIdx >= 6 && commaIdx <= 10 && line.charCodeAt(0) >= 48 && line.charCodeAt(0) <= 57) {
                let hyphenIdx = line.indexOf(' - ', commaIdx + 2);
                if (hyphenIdx !== -1) {
                    let colonIdx = line.indexOf(': ', hyphenIdx + 3);
                    if (colonIdx !== -1) {
                        match = [
                            line.substring(0, commaIdx),
                            line.substring(commaIdx + 2, hyphenIdx),
                            line.substring(hyphenIdx + 3, colonIdx).trim(),
                            line.substring(colonIdx + 2).trim()
                        ];
                    }
                }
            }
            if (match) {
                const date = match[0];
                const time = match[1];
                const sender = match[2];
                const msgText = match[3];
                
                stats.totalMessages++;
                
                if (!stats.users[sender]) {
                    stats.users[sender] = { msgCount: 0, wordCount: 0, responseTimeSum: 0, responseCount: 0, firstTexts: 0, consecutiveTexts: 0, lateNight: 0 };
                }
                const u = stats.users[sender];
                u.msgCount++;
                
                // Fast word count without regex
                let words = 0;
                let inWord = false;
                for(let i=0; i<msgText.length; i++) {
                    if (msgText.charCodeAt(i) > 32) {
                        if (!inWord) { words++; inWord = true; }
                    } else {
                        inWord = false;
                    }
                }
                u.wordCount += words;
                
                const timeObj = parseDate(date, time);
                if (timeObj) {
                    const monthKey = timeObj.getFullYear() + "-" + (timeObj.getMonth() + 1).toString().padStart(2, '0');
                    stats.monthlyActivity[monthKey] = (stats.monthlyActivity[monthKey] || 0) + 1;
                    
                    const hour = timeObj.getHours();
                    if (hour >= 0 && hour < 5) u.lateNight++;
                    
                    if (lastSender) {
                        if (lastSender !== sender) {
                            const diffMins = (timeObj - lastTimeObj) / 60000;
                            if (diffMins > 0 && diffMins < 1440) {
                                u.responseTimeSum += diffMins;
                                u.responseCount++;
                            }
                            if (date !== lastDate) {
                                u.firstTexts++;
                            }
                            currentConsecutive = 1;
                        } else {
                            currentConsecutive++;
                            if (currentConsecutive === 3) u.consecutiveTexts++;
                        }
                    }
                    
                    lastTimeObj = timeObj;
                    lastDate = date;
                    lastSender = sender;
                }
            }
        }
        start = end + 1;
    }
    
    // Sort users by message count to find the main participants
    const sortedUsers = Object.keys(stats.users).sort((a, b) => stats.users[b].msgCount - stats.users[a].msgCount);
    let topUsers = sortedUsers.filter(u => !u.includes("Messages and calls are end-to-end encrypted"));
    const userA = topUsers[0] || "User A";
    const userB = topUsers[1] || "User B";
    
    if(!stats.users[userA]) stats.users[userA] = { msgCount: 0, wordCount: 0, responseTimeSum: 0, responseCount: 0, firstTexts: 0, consecutiveTexts: 0, lateNight: 0 };
    if(!stats.users[userB]) stats.users[userB] = { msgCount: 0, wordCount: 0, responseTimeSum: 0, responseCount: 0, firstTexts: 0, consecutiveTexts: 0, lateNight: 0 };
    
    for (const key in stats.users) {
        stats.users[key].avgResponseTime = stats.users[key].responseCount > 0 ? (stats.users[key].responseTimeSum / stats.users[key].responseCount) : 0;
        stats.users[key].avgWords = stats.users[key].msgCount > 0 ? (stats.users[key].wordCount / stats.users[key].msgCount) : 0;
    }
    
    // Assign Personality Tags
    const tags = { [userA]: [], [userB]: [] };
    for (const user of [userA, userB]) {
        const u = stats.users[user];
        if (u.avgWords < 3) tags[user].push("Dry Texter 🌵");
        if (u.avgResponseTime > 120) tags[user].push("Ghoster 👻");
        if (u.avgResponseTime < 5 && u.responseCount > 10) tags[user].push("Flash Replier ⚡");
        if (u.consecutiveTexts > 20) tags[user].push("Double Texter 📱");
        if (u.lateNight > (u.msgCount * 0.2)) tags[user].push("Night Owl 🦉");
        if (tags[user].length === 0) tags[user].push("Normal Texter 😐");
    }
    
    // Scoring System
    let scoreObj = { score: 0, title: "", desc: "" };
    const uA = stats.users[userA];
    const uB = stats.users[userB];
    if (uA.msgCount === 0 || uB.msgCount === 0) {
        scoreObj = { score: 10, title: "Ghost Town 🏜️", desc: "Did you guys even talk?" };
    } else {
        const totalMsgs = uA.msgCount + uB.msgCount;
        const balanceRatio = Math.min(uA.msgCount, uB.msgCount) / Math.max(uA.msgCount, uB.msgCount);
        const balanceScore = balanceRatio * 40;
        
        let engagementScore = 0;
        if (totalMsgs > 10000) engagementScore = 30;
        else if (totalMsgs > 5000) engagementScore = 25;
        else if (totalMsgs > 1000) engagementScore = 15;
        else engagementScore = 5;
        
        const avgResp = (uA.avgResponseTime + uB.avgResponseTime) / 2;
        let responseScore = 0;
        if (avgResp < 15) responseScore = 30;
        else if (avgResp < 60) responseScore = 20;
        else if (avgResp < 240) responseScore = 10;
        else responseScore = 5;
        
        let totalScore = Math.round(balanceScore + engagementScore + responseScore);
        if (totalScore > 100) totalScore = 100;
        
        let title = ""; let desc = "";
        if (totalScore >= 90) { title = "Soulmates 💞"; desc = "Y'all are obsessed with each other."; }
        else if (totalScore >= 70) { title = "Solid Duo 🤞"; desc = "Great vibes, balanced energy."; }
        else if (totalScore >= 50) { title = "Casual Chatters 💬"; desc = "Good, but one of you is carrying."; }
        else { title = "Strangers 🧊"; desc = "Are you sure you guys are friends?"; }
        
        scoreObj = { score: totalScore, title, desc };
    }
    
    // AI-Style Summary
    let dominant = uA.msgCount > uB.msgCount ? userA : userB;
    let dominantPercent = stats.totalMessages > 0 ? Math.round((stats.users[dominant].msgCount / stats.totalMessages) * 100) : 0;
    let peakMonth = "";
    let maxMsgs = 0;
    for (const [month, count] of Object.entries(stats.monthlyActivity)) {
        if (count > maxMsgs) { maxMsgs = count; peakMonth = month; }
    }
    const starter = uA.firstTexts > uB.firstTexts ? userA : userB;
    const summary = \`This chat is carried by ${dominant} (${dominantPercent}% of messages). You guys peaked in ${peakMonth} with ${maxMsgs} messages! ${starter} is usually the one keeping the streak alive by texting first.\`;
    
    // Gamification Badges
    const badges = [];
    if (uA.msgCount > uB.msgCount * 2) badges.push({ user: userA, badge: "The Carry 🏋️‍♂️", desc: "Single-handedly keeping the chat alive." });
    if (uB.msgCount > uA.msgCount * 2) badges.push({ user: userB, badge: "The Carry 🏋️‍♂️", desc: "Single-handedly keeping the chat alive." });
    if (uA.avgWords > uB.avgWords * 2) badges.push({ user: userA, badge: "The Novelist 📚", desc: "Writes whole paragraphs." });
    if (uB.avgWords > uA.avgWords * 2) badges.push({ user: userB, badge: "The Novelist 📚", desc: "Writes whole paragraphs." });
    
    self.postMessage({
        type: 'analytics_done',
        data: { stats, userA, userB, tags, score: scoreObj, summary, badges }
    });
};
