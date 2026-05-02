// Viral Report UI Generator
// Requires html2canvas from CDN in index.html

window.ViralReport = {
    init: function(getMessagesFn, getCurrentUserFn, getOtherUserFn) {
        this.getMessages = getMessagesFn;
        this.getCurrentUser = getCurrentUserFn;
        this.getOtherUser = getOtherUserFn;
        
        this._injectStyles();
        this._injectHTML();
        this._bindEvents();
    },

    _injectStyles: function() {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "viral_report.css";
        document.head.appendChild(link);
    },

    _injectHTML: function() {
        const modalHTML = `
            <div id="vr-modal" class="vr-modal displayNone">
                <div class="vr-modal-content">
                    <button id="vr-close-btn" class="vr-close-btn">&times;</button>
                    
                    <div id="vr-report-card" class="vr-report-card">
                        <div class="vr-header">
                            <h2>WhatsApp Wrapped</h2>
                            <p id="vr-subtitle"></p>
                        </div>
                        
                        <div class="vr-score-section">
                            <div class="vr-score-circle">
                                <span id="vr-score-value">0</span>
                                <small>/100</small>
                            </div>
                            <h3 id="vr-score-title"></h3>
                            <p id="vr-score-desc"></p>
                        </div>
                        
                        <div class="vr-ai-summary">
                            <strong>🤖 AI Summary:</strong>
                            <p id="vr-ai-text"></p>
                        </div>
                        
                        <div class="vr-split-stats">
                            <div class="vr-user-card" id="vr-userA-card">
                                <h4 id="vr-userA-name"></h4>
                                <div class="vr-tags" id="vr-userA-tags"></div>
                                <div class="vr-badges" id="vr-userA-badges"></div>
                            </div>
                            <div class="vr-vs">VS</div>
                            <div class="vr-user-card" id="vr-userB-card">
                                <h4 id="vr-userB-name"></h4>
                                <div class="vr-tags" id="vr-userB-tags"></div>
                                <div class="vr-badges" id="vr-userB-badges"></div>
                            </div>
                        </div>
                        
                        <div class="vr-footer">
                            ZipMe Chat Analyzer • #ZipMeWrapped
                        </div>
                    </div>
                    
                    <button id="vr-share-btn" class="vr-share-btn">📸 Save as Image (Share)</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    _bindEvents: function() {
        // Find a place to add the trigger button, for example in the header
        const headerControls = document.querySelector('.header-controls');
        if (headerControls) {
            const btn = document.createElement("button");
            btn.id = "generateViralReportBtn";
            btn.textContent = "Wrapped 🎁";
            btn.className = "vr-trigger-btn";
            btn.style.marginLeft = "10px";
            btn.style.background = "linear-gradient(45deg, #FF007A, #7928CA)";
            btn.style.color = "white";
            btn.style.border = "none";
            btn.style.padding = "8px 12px";
            btn.style.borderRadius = "20px";
            btn.style.cursor = "pointer";
            btn.style.fontWeight = "bold";
            headerControls.appendChild(btn);

            btn.addEventListener("click", () => this.showReport());
        }

        document.getElementById("vr-close-btn").addEventListener("click", () => {
            document.getElementById("vr-modal").classList.add("displayNone");
        });

        document.getElementById("vr-share-btn").addEventListener("click", () => {
            if (typeof html2canvas === 'undefined') {
                alert("html2canvas library is missing. Cannot generate image.");
                return;
            }
            const reportCard = document.getElementById("vr-report-card");
            // Hide corner radiuses for better screenshot
            reportCard.style.borderRadius = "0";
            
            html2canvas(reportCard, { scale: 2, backgroundColor: '#1a1a2e' }).then(canvas => {
                reportCard.style.borderRadius = "15px"; // restore
                const link = document.createElement("a");
                link.download = "ZipMe_Wrapped.png";
                link.href = canvas.toDataURL("image/png");
                link.click();
            });
        });
    },

    showReport: function() {
        const messages = this.getMessages();
        const userA = this.getCurrentUser();
        const userB = this.getOtherUser();

        if (!messages || messages.length === 0 || !userA || !userB) {
            alert("Please load a chat first!");
            return;
        }

        // Try to get reading-time insights first (from the parallel worker)
        let report = window.chatInsights;
        
        // Fallback to legacy calculation if worker hasn't finished or wasn't triggered
        if (!report && window.AdvancedAnalytics) {
            report = window.AdvancedAnalytics.generate(messages, userA, userB);
        }
        
        if (!report) {
            alert("Insights are still being generated... Please wait a few seconds.");
            return;
        }

        // Populate DOM
        document.getElementById("vr-subtitle").textContent = `\${userA} & \${userB}`;
        
        // Score
        document.getElementById("vr-score-value").textContent = report.score.score;
        document.getElementById("vr-score-title").textContent = report.score.title;
        document.getElementById("vr-score-desc").textContent = report.score.desc;

        // Summary
        document.getElementById("vr-ai-text").textContent = report.summary;

        // Users
        document.getElementById("vr-userA-name").textContent = userA;
        document.getElementById("vr-userB-name").textContent = userB;

        // Tags
        const tagsA = report.tags[userA].map(t => `<span class="vr-tag">\${t}</span>`).join('');
        const tagsB = report.tags[userB].map(t => `<span class="vr-tag">\${t}</span>`).join('');
        document.getElementById("vr-userA-tags").innerHTML = tagsA || '<span class="vr-tag">Normal Texter 😐</span>';
        document.getElementById("vr-userB-tags").innerHTML = tagsB || '<span class="vr-tag">Normal Texter 😐</span>';

        // Badges
        const badgesA = report.badges.filter(b => b.user === userA).map(b => `<div class="vr-badge" title="\${b.desc}">\${b.badge}</div>`).join('');
        const badgesB = report.badges.filter(b => b.user === userB).map(b => `<div class="vr-badge" title="\${b.desc}">\${b.badge}</div>`).join('');
        document.getElementById("vr-userA-badges").innerHTML = badgesA;
        document.getElementById("vr-userB-badges").innerHTML = badgesB;

        // Show modal
        document.getElementById("vr-modal").classList.remove("displayNone");
    }
};
