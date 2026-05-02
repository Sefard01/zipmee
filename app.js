document.addEventListener("DOMContentLoaded", () => {

  const zipInput = document.getElementById("zipInput");
  const goBtn = document.getElementById("goBtn");
  const uploadSection = document.querySelector(".upload-section");
  const chatContainer = document.getElementById("chatContainer");
  const chatWrapper = document.querySelector(".chat-wrapper");
  const scrollBtn = document.getElementById("scrollToBottomBtn");
  const fileNameSpan = document.getElementById("fileName");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const miniProgress = document.getElementById("miniProgress");
  const miniProgressBar = document.getElementById("miniProgressBar");
  const miniProgressText = document.getElementById("miniProgressText");
  const leftUserEl = document.getElementById("leftUser");
  const rightUserEl = document.getElementById("rightUser");
  const swapUsersBtn = document.getElementById("swapUsersBtn");
  const toggleSidebarBtn = document.getElementById("toggleSidebar");
  const closeSidebarBtn = document.getElementById("closeSidebar");
  const sidebar = document.getElementById("sidebar");
  const dateSearch = document.getElementById("dateSearch");
  const textSearch = document.getElementById("textSearch");
  const searchCount = document.getElementById("searchCount");
  const searchPrev = document.getElementById("searchPrev");
  const searchNext = document.getElementById("searchNext");
  const searchIconBtn = document.getElementById("searchIconBtn");
  const searchPanel = document.getElementById("searchPanel");
  const searchExpandWrapper = document.getElementById("searchExpandWrapper");

  const wordStats = document.getElementById("wordStats");
  const emojiStats = document.getElementById("emojiStats");
  const responseStats = document.getElementById("responseStats");
  const chatSummary = document.getElementById("chatSummary");

  let parsedMessages = [];
  let currentUser = "";
  let otherUser = "";
  let mediaMap = {};
  let scrollListener = null;
  let searchResults = [];
  let currentSearchIndex = 0;
  let currentSearchQuery = "";

  let top50Cache = [];
  let bottom50Cache = [];
  let isFullChatLoaded = false;
  let currentRenderedMode = 'top';
  let currentIndexDown = 0;
  let currentIndexUp = 0;
  let lastRenderedDate = null;
  let firstRenderedDate = null;

  if (!zipInput || !chatContainer) return;

  zipInput.addEventListener("change", async () => {
    const file = zipInput.files[0];
    if (!file) return;
    fileNameSpan.textContent = file.name;
    
    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "0%";
    showLoading(true);

    try {
      let chatText = "";
      mediaMap = {};

      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === "txt") {
        chatText = await file.text();
      } else if (ext === "zip") {
        const zip = await JSZip.loadAsync(file);
        const tasks = [];
        let txtLoaded = false;

        Object.entries(zip.files).forEach(([name, entry]) => {
          if (name.endsWith(".txt")) {
            tasks.push(entry.async("string", function(meta) {
              if (progressBar) progressBar.style.width = meta.percent + "%";
              if (progressText) progressText.textContent = "Extracting ZIP... " + meta.percent.toFixed(0) + "%";
            }).then(d => {
              if (!txtLoaded) {
                chatText = d;
                txtLoaded = true;
              }
            }));
          }
          if (/\.(jpg|png|jpeg|gif|mp4|pdf|doc|docx)$/i.test(name)) {
            tasks.push(entry.async("blob").then(b => {
              mediaMap[name.split("/").pop()] = URL.createObjectURL(b);
            }));
          }
        });

        await Promise.all(tasks);
      }

      const workerCode = `
        self.onmessage = function(e) {
          const text = e.data;
          
          let allMessages = [];
          let current = null;
          let top50Sent = false;
          
          let start = 0;
          const len = text.length;
          let lastReportedProgress = -1;
          
          while (start < len) {
             let end = text.indexOf('\\n', start);
             if (end === -1) end = len;

             let currentProgress = Math.floor((start / len) * 100);
             if (currentProgress > lastReportedProgress) {
                 self.postMessage({ type: 'progress', data: { percent: currentProgress, messages: allMessages.length } });
                 lastReportedProgress = currentProgress;
             }
             
             // Trim carriage returns and spaces
             let lineStart = start;
             let lineEnd = end;
             while(lineStart < lineEnd && (text.charCodeAt(lineStart) === 32 || text.charCodeAt(lineStart) === 13)) lineStart++;
             while(lineEnd > lineStart && (text.charCodeAt(lineEnd-1) === 32 || text.charCodeAt(lineEnd-1) === 13)) lineEnd--;
             
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
                                 line,
                                 line.substring(0, commaIdx),
                                 line.substring(commaIdx + 2, hyphenIdx),
                                 line.substring(hyphenIdx + 3, colonIdx),
                                 line.substring(colonIdx + 2)
                             ];
                         }
                     }
                 }
                 if (match) {
                     if (current) {
                         allMessages.push(current);
                         if (!top50Sent && allMessages.length === 50) {
                             self.postMessage({ type: 'top50', data: [...allMessages] });
                             top50Sent = true;
                         }
                     }
                     current = { date: match[1], time: match[2], sender: match[3].trim(), message: match[4].trim() };
                 } else if (current) {
                     current.message += '\\n' + line;
                 }
             }
             start = end + 1;
          }
          if (current) allMessages.push(current);
          
          if (!top50Sent) {
              self.postMessage({ type: 'top50', data: [...allMessages] });
          }
          
          const bottom50 = allMessages.slice(-50);
          self.postMessage({ type: 'bottom50', data: bottom50 });
          self.postMessage({ type: 'done', data: allMessages });
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));

      worker.onmessage = function(e) {
        const { type, data } = e.data;
        if (type === 'progress') {
           if (miniProgressBar) miniProgressBar.style.width = data.percent + '%';
           if (miniProgressText) miniProgressText.textContent = 'Parsing... ' + data.percent + '% (' + data.messages.toLocaleString() + ' messages)';
        } else if (type === 'top50') {
           top50Cache = data;
           if (data.length > 0) {
             const users = [...new Set(data.map(m => m.sender))];
             currentUser = users[0];
             otherUser = users[1] || "Unknown";
             leftUserEl.textContent = otherUser;
             rightUserEl.textContent = currentUser;
           }
           uploadSection.classList.add("displayNone");
           chatWrapper.classList.remove("displayNone");
           
           renderChatMode('top');
           
           // Hide main overlay, show mini banner for background parsing
           showLoading(false);
           if (miniProgress) miniProgress.classList.remove("displayNone");
           
        } else if (type === 'bottom50') {
           bottom50Cache = data;
        } else if (type === 'done') {
           parsedMessages = data;
           isFullChatLoaded = true;
           if (miniProgress) miniProgress.classList.add("displayNone");
           calculateAnalytics(parsedMessages);
           worker.terminate();
        }
      };

      worker.postMessage(chatText);

      // EXTENSION: Advanced Analytics Worker running concurrently during reading phase
      const analyticsWorker = new Worker("reading_analytics_worker.js");
      analyticsWorker.onmessage = function(e) {
          if (e.data.type === 'analytics_done') {
              window.chatInsights = e.data.data;
              // If main parser is already done and no search is active, update the UI
              if (isFullChatLoaded && parsedMessages && currentSearchQuery === "") {
                  calculateAnalytics(parsedMessages);
              }
          }
      };
      analyticsWorker.postMessage(chatText);

    } catch (e) {
      console.error(e);
      chatContainer.innerHTML = "Error reading file";
    }

    showLoading(false);
  });

  toggleSidebarBtn.onclick = () => sidebar.classList.toggle("open");
  closeSidebarBtn.onclick = () => sidebar.classList.remove("open");

  // ── Expandable Search Toggle ──
  if (searchIconBtn && searchPanel) {
    searchIconBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = searchPanel.classList.toggle("open");
      searchIconBtn.classList.toggle("active", isOpen);
      if (isOpen) {
        setTimeout(() => textSearch && textSearch.focus(), 350);
      } else {
        if (textSearch) textSearch.value = "";
        // Clear search state
        currentSearchQuery = "";
        searchResults = [];
        if (searchCount) searchCount.style.display = "none";
        if (searchPrev)  searchPrev.style.display  = "none";
        if (searchNext)  searchNext.style.display  = "none";
        if (isFullChatLoaded) renderChat(parsedMessages, mediaMap);
      }
    });

    // Close search panel on outside click
    document.addEventListener("click", (e) => {
      if (searchExpandWrapper && !searchExpandWrapper.contains(e.target)) {
        searchPanel.classList.remove("open");
        searchIconBtn.classList.remove("active");
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && searchPanel.classList.contains("open")) {
        searchPanel.classList.remove("open");
        searchIconBtn.classList.remove("active");
        if (textSearch) textSearch.value = "";
        currentSearchQuery = "";
        searchResults = [];
        if (searchCount) searchCount.style.display = "none";
        if (searchPrev)  searchPrev.style.display  = "none";
        if (searchNext)  searchNext.style.display  = "none";
        if (isFullChatLoaded) renderChat(parsedMessages, mediaMap);
      }
    });
  }

  if (swapUsersBtn) {
    let currentRotation = 0;
    swapUsersBtn.onclick = () => {
      if (!currentUser || !otherUser) return;
      
      currentRotation += 180;
      swapUsersBtn.style.setProperty('--rotation', `${currentRotation}deg`);
      
      const temp = currentUser;
      currentUser = otherUser;
      otherUser = temp;
      
      leftUserEl.textContent = otherUser;
      rightUserEl.textContent = currentUser;
      
      renderChatMode(currentRenderedMode);
    };
  }

  dateSearch.addEventListener("change", (e) => {
    const val = e.target.value;
    const data = val ? parsedMessages.filter(m => m.date === val) : parsedMessages;
    renderChat(data, mediaMap);
    calculateAnalytics(data);
  });

  textSearch.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    currentSearchQuery = query;
    currentSearchIndex = 0;

    if (!query) {
      renderChat(parsedMessages, mediaMap);
      searchCount.style.display = "none";
      searchPrev.style.display = "none";
      searchNext.style.display = "none";
      searchResults = [];
      calculateAnalytics(parsedMessages);
      return;
    }

    searchResults = parsedMessages.filter(msg =>
      msg.message.toLowerCase().includes(query) ||
      msg.sender.toLowerCase().includes(query)
    );

    searchCount.textContent = `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`;
    searchCount.style.display = "inline-block";
    
    if (searchResults.length > 0) {
      searchPrev.style.display = "flex";
      searchNext.style.display = "flex";
      renderChatWithSearch(parsedMessages, mediaMap, searchResults, 0);
      calculateAnalytics(searchResults);
    } else {
      searchPrev.style.display = "none";
      searchNext.style.display = "none";
      renderChat(parsedMessages, mediaMap);
      calculateAnalytics(parsedMessages);
    }
  });

  textSearch.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && searchResults.length > 0) {
      currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
      renderChatWithSearch(parsedMessages, mediaMap, searchResults, currentSearchIndex);
      scrollToSearchResult();
    }
  });

  searchNext.onclick = () => {
    if (searchResults.length > 0) {
      currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
      renderChatWithSearch(parsedMessages, mediaMap, searchResults, currentSearchIndex);
      scrollToSearchResult();
    }
  };

  searchPrev.onclick = () => {
    if (searchResults.length > 0) {
      currentSearchIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
      renderChatWithSearch(parsedMessages, mediaMap, searchResults, currentSearchIndex);
      scrollToSearchResult();
    }
  };

  function openMediaViewer(src, type, filename) {
    // Create backdrop overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(4px);
      cursor: pointer;
    `;

    // Create container for media
    const container = document.createElement("div");
    container.style.cssText = `
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Create media element based on type
    let mediaElement;
    if (type === "image") {
      mediaElement = document.createElement("img");
      mediaElement.src = src;
      mediaElement.style.cssText = `
        max-width: 100%;
        max-height: 90vh;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      `;
    } else if (type === "video") {
      mediaElement = document.createElement("video");
      mediaElement.src = src;
      mediaElement.controls = true;
      mediaElement.autoplay = true;
      mediaElement.style.cssText = `
        max-width: 100%;
        max-height: 90vh;
        border-radius: 8px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      `;
    }

    // Add filename label
    const label = document.createElement("div");
    label.textContent = filename;
    label.style.cssText = `
      position: absolute;
      bottom: -40px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      text-align: center;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 10px;
    `;

    // Add close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      z-index: 10001;
    `;

    closeBtn.onmouseover = () => {
      closeBtn.style.background = "rgba(255, 255, 255, 0.4)";
      closeBtn.style.transform = "scale(1.1)";
    };

    closeBtn.onmouseout = () => {
      closeBtn.style.background = "rgba(255, 255, 255, 0.2)";
      closeBtn.style.transform = "scale(1)";
    };

    // Close on button click
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      overlay.remove();
    };

    // Close on background click
    overlay.onclick = () => overlay.remove();

    // Prevent closing when clicking on media
    if (mediaElement) {
      mediaElement.onclick = (e) => e.stopPropagation();
    }

    // Assemble viewer
    container.appendChild(mediaElement);
    container.appendChild(label);
    overlay.appendChild(closeBtn);
    overlay.appendChild(container);

    // Add to DOM
    document.body.appendChild(overlay);

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);
  }

  function scrollToSearchResult() {
    setTimeout(() => {
      const elements = chatContainer.querySelectorAll(".search-current");
      if (elements.length > 0) {
        elements[0].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }

  function showLoading(state) {
    loadingOverlay?.classList.toggle("displayNone", !state);
  }

  function createMessageNodes(messages, isPrepend = false) {
    const frag = document.createDocumentFragment();
    let localLastDate = isPrepend ? null : lastRenderedDate;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.date !== localLastDate) {
        const d = document.createElement("div");
        d.className = "date-separator";
        d.textContent = m.date;
        frag.appendChild(d);
        localLastDate = m.date;
      }

      const div = document.createElement("div");
      div.className = `message ${m.sender === currentUser ? "right" : "left"}`;

      let mediaHandled = false;
      const fileMatch = m.message.match(/[\w-]+\.(jpg|png|jpeg|gif|mp4|pdf|doc|docx)/i);
      if (fileMatch) {
        const filename = fileMatch[0];
        if (mediaMap[filename]) {
          mediaHandled = true;
          if (/\.(jpg|png|jpeg|gif)$/i.test(filename)) {
            const img = document.createElement("img");
            img.src = mediaMap[filename];
            img.classList.add("chat-media");
            img.style.cursor = "pointer";
            img.onclick = () => openMediaViewer(mediaMap[filename], "image", filename);
            div.appendChild(img);
          } else if (/\.mp4$/i.test(filename)) {
            const video = document.createElement("video");
            video.src = mediaMap[filename];
            video.controls = true;
            video.classList.add("chat-media");
            video.style.cursor = "pointer";
            video.onclick = () => openMediaViewer(mediaMap[filename], "video", filename);
            div.appendChild(video);
          } else if (/\.pdf$/i.test(filename)) {
            const pdfBtn = document.createElement("a");
            pdfBtn.href = mediaMap[filename];
            pdfBtn.target = "_blank";
            pdfBtn.textContent = "📄 " + filename;
            pdfBtn.style.cursor = "pointer";
            pdfBtn.style.background = "#25d366";
            pdfBtn.style.color = "white";
            pdfBtn.style.padding = "8px 12px";
            pdfBtn.style.borderRadius = "4px";
            pdfBtn.style.textDecoration = "none";
            pdfBtn.style.display = "inline-block";
            pdfBtn.style.fontWeight = "600";
            pdfBtn.style.fontSize = "13px";
            div.appendChild(pdfBtn);
          }
        }
      }

      if (!mediaHandled) {
        const span = document.createElement("span");
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        if (urlRegex.test(m.message)) {
          span.innerHTML = m.message.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="chat-link">$1</a>');
        } else {
          span.textContent = m.message;
        }
        div.appendChild(span);
      }

      const time = document.createElement("div");
      time.className = "time";
      time.textContent = m.time;
      div.appendChild(time);
      frag.appendChild(div);
    }
    
    if (!isPrepend) {
        lastRenderedDate = localLastDate;
    }
    if (messages.length > 0 && isPrepend) {
        firstRenderedDate = messages[0].date;
    } else if (messages.length > 0 && !isPrepend && !firstRenderedDate) {
        firstRenderedDate = messages[0].date;
    }

    return frag;
  }

  function renderChatMode(mode) {
    if (scrollListener) chatWrapper.removeEventListener("scroll", scrollListener);
    chatContainer.innerHTML = "";
    lastRenderedDate = null;
    firstRenderedDate = null;
    currentRenderedMode = mode;

    if (mode === 'top') {
      const messages = isFullChatLoaded ? parsedMessages : top50Cache;
      currentIndexDown = Math.min(50, messages.length);
      const frag = createMessageNodes(messages.slice(0, currentIndexDown));
      chatContainer.appendChild(frag);
      chatWrapper.scrollTop = 0;
      setTimeout(updateScrollBtnState, 50);
    } else if (mode === 'bottom') {
      const messages = isFullChatLoaded ? parsedMessages : bottom50Cache;
      currentIndexUp = Math.max(0, messages.length - 50);
      const frag = createMessageNodes(messages.slice(currentIndexUp, messages.length));
      chatContainer.appendChild(frag);
      setTimeout(() => { 
          chatWrapper.scrollTop = chatWrapper.scrollHeight; 
          updateScrollBtnState();
      }, 50);
    }

    scrollListener = () => {
      // Scroll Down (Append)
      if (chatWrapper.scrollTop + chatWrapper.clientHeight >= chatWrapper.scrollHeight - 100) {
        if (isFullChatLoaded && currentRenderedMode === 'top') {
            if (currentIndexDown < parsedMessages.length) {
                const end = Math.min(currentIndexDown + 50, parsedMessages.length);
                const frag = createMessageNodes(parsedMessages.slice(currentIndexDown, end));
                chatContainer.appendChild(frag);
                currentIndexDown = end;
            }
        }
      }
      // Scroll Up (Prepend)
      if (chatWrapper.scrollTop <= 100) {
        if (isFullChatLoaded && currentRenderedMode === 'bottom') {
            if (currentIndexUp > 0) {
                const oldHeight = chatWrapper.scrollHeight;
                const start = Math.max(0, currentIndexUp - 50);
                const frag = createMessageNodes(parsedMessages.slice(start, currentIndexUp), true);
                chatContainer.insertBefore(frag, chatContainer.firstChild);
                currentIndexUp = start;
                const newHeight = chatWrapper.scrollHeight;
                chatWrapper.scrollTop += (newHeight - oldHeight);
            }
        }
      }
      updateScrollBtnState();
    };

    chatWrapper.addEventListener("scroll", scrollListener);
  }

  function updateScrollBtnState() {
    if (!scrollBtn) return;
    const isAtDomBottom = Math.ceil(chatWrapper.scrollTop + chatWrapper.clientHeight) >= chatWrapper.scrollHeight - 10;
    
    let hasLoadedLastMessage = false;
    if (currentRenderedMode === 'bottom') {
        hasLoadedLastMessage = true;
    } else if (isFullChatLoaded && currentIndexDown >= parsedMessages.length) {
        hasLoadedLastMessage = true;
    }

    if (isAtDomBottom && hasLoadedLastMessage) {
        scrollBtn.textContent = '↑';
        scrollBtn.dataset.action = 'top';
        scrollBtn.setAttribute('aria-label', 'Scroll to top');
    } else {
        scrollBtn.textContent = '↓';
        scrollBtn.dataset.action = 'bottom';
        scrollBtn.setAttribute('aria-label', 'Scroll to bottom');
    }
  }

  scrollBtn.onclick = () => {
    if (scrollBtn.dataset.action === 'top') {
        renderChatMode('top');
    } else {
        renderChatMode('bottom');
    }
  };

  // Generic fallback for search/filters
  function renderChat(messages, mediaMap) {
    if (scrollListener) chatWrapper.removeEventListener("scroll", scrollListener);
    chatContainer.innerHTML = "";
    lastRenderedDate = null;
    
    let index = 0;
    function chunk() {
      const end = Math.min(index + 200, messages.length);
      const frag = createMessageNodes(messages.slice(index, end));
      chatContainer.appendChild(frag);
      index = end;
    }
    chunk();

    scrollListener = () => {
      if (chatWrapper.scrollTop + chatWrapper.clientHeight >= chatWrapper.scrollHeight - 100) {
        chunk();
      }
    };
    chatWrapper.addEventListener("scroll", scrollListener);
  }

  // Generic fallback for search highlighting
  function renderChatWithSearch(allMessages, mediaMap, matchedMessages, highlightIndex) {
    chatContainer.innerHTML = "";
    if (scrollListener) chatWrapper.removeEventListener("scroll", scrollListener);

    let index = 0;
    let lastDate = null;

    function chunk() {
      const frag = document.createDocumentFragment();
      const end = Math.min(index + 200, allMessages.length);

      for (let i = index; i < end; i++) {
        const m = allMessages[i];

        if (m.date !== lastDate) {
          const d = document.createElement("div");
          d.className = "date-separator";
          d.textContent = m.date;
          frag.appendChild(d);
          lastDate = m.date;
        }

        const div = document.createElement("div");
        div.className = `message ${m.sender === currentUser ? "right" : "left"}`;

        const isMatch = matchedMessages.some(match => 
          match.date === m.date && match.time === m.time && match.message === m.message
        );
        
        if (isMatch) {
          div.classList.add("search-match");
          if (matchedMessages[highlightIndex].date === m.date && 
              matchedMessages[highlightIndex].time === m.time && 
              matchedMessages[highlightIndex].message === m.message) {
            div.classList.add("search-current");
          }
        }

        let mediaHandled = false;
        for (const filename in mediaMap) {
          if (m.message.includes(filename)) {
            mediaHandled = true;
            if (/\.(jpg|png|jpeg|gif)$/i.test(filename)) {
              const img = document.createElement("img");
              img.src = mediaMap[filename];
              img.classList.add("chat-media");
              img.style.cursor = "pointer";
              img.onclick = () => openMediaViewer(mediaMap[filename], "image", filename);
              div.appendChild(img);
            } else if (/\.mp4$/i.test(filename)) {
              const video = document.createElement("video");
              video.src = mediaMap[filename];
              video.controls = true;
              video.classList.add("chat-media");
              video.style.cursor = "pointer";
              video.onclick = () => openMediaViewer(mediaMap[filename], "video", filename);
              div.appendChild(video);
            } else if (/\.pdf$/i.test(filename)) {
              const pdfBtn = document.createElement("a");
              pdfBtn.href = mediaMap[filename];
              pdfBtn.target = "_blank";
              pdfBtn.textContent = "📄 " + filename;
              pdfBtn.style.cursor = "pointer";
              pdfBtn.style.background = "#25d366";
              pdfBtn.style.color = "white";
              pdfBtn.style.padding = "8px 12px";
              pdfBtn.style.borderRadius = "4px";
              pdfBtn.style.textDecoration = "none";
              pdfBtn.style.display = "inline-block";
              pdfBtn.style.fontWeight = "600";
              pdfBtn.style.fontSize = "13px";
              div.appendChild(pdfBtn);
            }
            break;
          }
        }

        if (!mediaHandled) {
          const span = document.createElement("span");
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          if (urlRegex.test(m.message)) {
            span.innerHTML = m.message.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="chat-link">$1</a>');
          } else {
            span.textContent = m.message;
          }
          div.appendChild(span);
        }

        const time = document.createElement("div");
        time.className = "time";
        time.textContent = m.time;
        div.appendChild(time);
        frag.appendChild(div);
      }
      chatContainer.appendChild(frag);
      index = end;
    }

    chunk();

    scrollListener = () => {
      if (chatWrapper.scrollTop + chatWrapper.clientHeight >= chatWrapper.scrollHeight - 100) {
        chunk();
      }
    };
    chatWrapper.addEventListener("scroll", scrollListener);
  }
  function calculateAnalytics(messages) {
    if (!messages || messages.length === 0) return;

    const words = Object.create(null);
    const emojis = Object.create(null);
    const userMsgCounts = Object.create(null);
    let totalRespTime = 0;
    let respCount = 0;
    let minRespTime = Infinity;
    let maxRespTime = -Infinity;

    let lastTime = null;
    let lastSender = null;
    
    const emojiRegex = /[\u{1F600}-\u{1F9FF}]/gu;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.sender) {
          userMsgCounts[m.sender] = (userMsgCounts[m.sender] || 0) + 1;
      }
      const msg = m.message;
      if (!msg) continue;
      
      const text = msg.toLowerCase();
      
      let wStart = -1;
      for (let j = 0; j < text.length; j++) {
         const code = text.charCodeAt(j);
         const isWordChar = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
         if (isWordChar) {
             if (wStart === -1) wStart = j;
         } else {
             if (wStart !== -1) {
                 if (j - wStart > 2) {
                     const w = text.substring(wStart, j);
                     words[w] = (words[w] || 0) + 1;
                 }
                 wStart = -1;
             }
         }
      }
      if (wStart !== -1 && text.length - wStart > 2) {
          const w = text.substring(wStart);
          words[w] = (words[w] || 0) + 1;
      }
      
      emojiRegex.lastIndex = 0;
      let emMatch;
      while ((emMatch = emojiRegex.exec(msg)) !== null) {
         const e = emMatch[0];
         emojis[e] = (emojis[e] || 0) + 1;
      }

      const time = parseDate(m.date, m.time);
      if (lastTime && lastSender !== m.sender && time) {
        const diff = Math.abs(time - lastTime) / 60000;
        if (diff > 0 && diff < 43200) {
            totalRespTime += diff;
            respCount++;
            if (diff < minRespTime) minRespTime = diff;
            if (diff > maxRespTime) maxRespTime = diff;
        }
      }

      lastTime = time;
      lastSender = m.sender;
    }

    const topWords = Object.entries(words).sort((a,b)=>b[1]-a[1]).slice(0,10);
    wordStats.innerHTML = topWords.map(w=>`<div>${w[0]}: ${w[1]}</div>`).join("");

    const topEmoji = Object.entries(emojis).sort((a,b)=>b[1]-a[1]).slice(0,10);
    emojiStats.innerHTML = topEmoji.map(e=>`<div>${e[0]} ${e[1]}</div>`).join("");

    if (respCount > 0) {
      const avg = totalRespTime / respCount;
      const minStr = minRespTime === Infinity ? 'N/A' : (minRespTime * 60).toFixed(0) + ' sec';
      const maxStr = maxRespTime === -Infinity ? 'N/A' : (maxRespTime > 60 ? (maxRespTime/60).toFixed(1) + ' hrs' : maxRespTime.toFixed(0) + ' min');
      responseStats.innerHTML = `<div>Avg: ${avg.toFixed(2)} min</div>
                                 <div>Fastest: ${minStr}</div>
                                 <div>Slowest: ${maxStr}</div>`;
    } else {
      responseStats.innerHTML = "";
    }

    chatSummary.innerHTML = `<div>Total: ${messages.length.toLocaleString()} messages</div>`;

    // Professional Relationship & Behaviour UI
    const relCard = document.getElementById("relationshipCard");
    const relStats = document.getElementById("relationshipStats");
    if (relCard && relStats) {
        const usersArr = Object.keys(userMsgCounts)
                            .filter(u => !u.includes("Messages and calls are end-to-end encrypted"))
                            .sort((a,b)=>userMsgCounts[b]-userMsgCounts[a]);
        if (usersArr.length >= 2) {
            relCard.style.display = "block";
            const u1 = usersArr[0], u2 = usersArr[1];
            const total = userMsgCounts[u1] + userMsgCounts[u2];
            const p1 = Math.round((userMsgCounts[u1]/total)*100);
            const p2 = Math.round((userMsgCounts[u2]/total)*100);
            
            let status = "Balanced Interaction";
            if (p1 > 65) status = `${u1} Dominant (${p1}%)`;
            else if (p1 > 55) status = `Slightly ${u1} Leaning`;
            
            let html = `<div style="display:flex; justify-content:space-between; margin-bottom: 8px; font-size: 13px;">
                          <span style="color: #64748b;">Distribution</span>
                          <span style="font-weight: 500; color: #0f172a; text-align:right;">${status}</span>
                        </div>`;
            
            html += `<div style="display:flex; height:6px; border-radius:3px; overflow:hidden; margin-bottom:8px; background: #e2e8f0;">
                        <div style="width:${p1}%; background:#3b82f6;" title="${u1}: ${p1}%"></div>
                        <div style="width:${p2}%; background:#94a3b8;" title="${u2}: ${p2}%"></div>
                     </div>`;
            
            html += `<div style="display:flex; justify-content:space-between; font-size:12px; color:#475569;">
                        <span><strong style="color:#3b82f6;">${p1}%</strong> ${u1.substring(0,10)}</span>
                        <span>${u2.substring(0,10)} <strong style="color:#94a3b8;">${p2}%</strong></span>
                     </div>`;
                     
            if (window.chatInsights && messages.length === window.chatInsights.stats.totalMessages) {
                const i = window.chatInsights;
                const uA = i.userA, uB = i.userB;
                const wordsA = i.stats.users[uA].avgWords.toFixed(1);
                const wordsB = i.stats.users[uB].avgWords.toFixed(1);
                
                html += `<div style="margin-top: 12px; border-top: 1px dashed #cbd5e1; padding-top: 10px;">`;
                html += `<div style="display:flex; justify-content:space-between; margin-bottom: 6px; font-size: 13px;">
                           <span style="color: #64748b;">Avg. Words/Msg</span>
                           <span style="font-weight: 500; color: #0f172a;">${uA.substring(0,8)}: ${wordsA} | ${uB.substring(0,8)}: ${wordsB}</span>
                         </div>`;
                
                const initA = i.stats.users[uA].firstTexts;
                const initB = i.stats.users[uB].firstTexts;
                const primaryInit = initA > initB ? uA : (initB > initA ? uB : 'Equal');
                
                html += `<div style="display:flex; justify-content:space-between; margin-bottom: 6px; font-size: 13px;">
                           <span style="color: #64748b;">Primary Initiator</span>
                           <span style="font-weight: 500; color: #0f172a;">${primaryInit.substring(0,12)}</span>
                         </div>`;
                html += `<div style="display:flex; justify-content:space-between; font-size: 13px; align-items:flex-start;">
                           <span style="color: #64748b;">User Vibes</span>
                           <span style="font-weight: 500; color: #0f172a; text-align:right;">
                               ${uA.substring(0,8)}: ${i.tags[uA][0]}<br/>
                               ${uB.substring(0,8)}: ${i.tags[uB][0]}
                           </span>
                         </div>`;
                html += `</div>`;
            }
                     
            relStats.innerHTML = html;
        } else {
            relCard.style.display = "none";
        }
    }
  }

  function parseDate(d,t) {
    if (!d || !t) return null;
    const parts = d.split("/");
    if (parts.length !== 3) return null;
    const [day,month,year] = parts.map(Number);
    const match = t.match(/(\d+):(\d+)/);
    if (!match) return null;
    let fullYear = year < 100 ? 2000 + year : year;
    return new Date(fullYear, month-1, day, match[1], match[2]);
  }

  // Initialize new Viral Report Module
  if (window.ViralReport) {
      window.ViralReport.init(
          () => parsedMessages,
          () => currentUser,
          () => otherUser
      );
  }

});
