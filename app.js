// ==========================================
// INITIALIZATION & UI
// ==========================================
window.onload = async function() {
    await loadData();
    buildDatasetMenu();
};

function buildDatasetMenu() {
    document.getElementById('loader').style.display = 'none';
    document.getElementById('entry-screen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('main-ui').style.display = 'none';
    document.getElementById('btn-reload').style.display = 'none';

    let listContainer = document.getElementById('dataset-list');
    listContainer.style.display = 'flex'; 
    listContainer.innerHTML = '';

    DATASETS.forEach(ds => {
        let isCached = appData.caches && appData.caches[ds.id];
        let progress = appData.progress[ds.id] || {};
        let score = progress.score || 0;
        let statusText = isCached ? `Score: ${score}` : "Requires Download";
        
        let btn = document.createElement('button');
        btn.className = 'dataset-btn';
        btn.innerHTML = `<span>${ds.name}</span> <span class="dataset-status">${statusText}</span>`;
        btn.onclick = () => { selectDataset(ds.id); };
        listContainer.appendChild(btn);
    });
}

function showEntryScreen() {
    enforceFullscreen();
    buildDatasetMenu();
}

function updateDashStats() {
    if(!activeDatasetId) return;
    let pData = appData.progress[activeDatasetId];
    document.getElementById('dash-score').innerText = pData.score;
    document.getElementById('score').innerText = pData.score;
    document.getElementById('streak').innerText = pData.streak;
    document.getElementById('dash-mastered').innerText = pData.mastered.length;

    let mistakeBtn = document.getElementById('dash-review-mistakes');
    if (pData.mistakes && pData.mistakes.length > 0) {
        document.getElementById('dash-mistake-count').innerText = pData.mistakes.length;
        mistakeBtn.style.display = 'block';
    } else {
        mistakeBtn.style.display = 'none';
    }
}

function renderDecks() {
    var container = document.getElementById('deck-container');
    container.innerHTML = '';
    let pData = appData.progress[activeDatasetId];

    decks.forEach(function(d, index) {
        var masteredInDeck = d.words.filter(w => pData.mastered.includes(w.word)).length;
        var progressPct = Math.min(100, (masteredInDeck / d.words.length) * 100);

        var div = document.createElement('div');
        div.className = 'deck-card';
        div.innerHTML = `
            <div class="deck-letter">${d.label}</div>
            <div class="deck-info">${masteredInDeck} / ${d.words.length}</div>
            <div class="deck-progress-bar"><div class="deck-progress-fill" style="width: ${progressPct}%"></div></div>
        `;
        div.onclick = function() { startDeck(index); };
        container.appendChild(div);
    });
}

// ==========================================
// THEME ENGINE
// ==========================================
const themes = ['', 'theme-light', 'theme-blue', 'theme-forest'];
let currentThemeIndex = 0;

function toggleTheme() {
    currentThemeIndex++;
    if (currentThemeIndex >= themes.length) currentThemeIndex = 0;
    
    document.body.className = '';
    if (themes[currentThemeIndex] !== '') {
        document.body.classList.add(themes[currentThemeIndex]);
    }
    enforceFullscreen();
}

// ==========================================
// FULLSCREEN CONTROLS
// ==========================================
function enforceFullscreen() {
    var doc = window.document;
    var docEl = doc.documentElement;
    var req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
    
    let themeClass = themes[currentThemeIndex];
    
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if(req) {
            req.call(docEl).catch(err => {
                document.body.className = themeClass ? themeClass + ' pseudo-fullscreen' : 'pseudo-fullscreen';
            });
        } else {
            document.body.className = themeClass ? themeClass + ' pseudo-fullscreen' : 'pseudo-fullscreen';
        }
    } else {
        document.body.className = themeClass; 
    }
}

document.body.addEventListener('touchstart', enforceFullscreen, { passive: true });
document.body.addEventListener('click', enforceFullscreen, { passive: true });

// ==========================================
// GAME NAVIGATION & DECK MANAGEMENT
// ==========================================
function enterApp(mode) {
    enforceFullscreen();
    if (mode === 'memory') {
        let pData = appData.progress[activeDatasetId];
        activeDeck = master.filter(function(w) { return pData.mistakes.includes(w.word); });
        currentMode = 'memory';
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('main-ui').style.display = 'flex';
        historyArray = []; historyIndex = -1;
        generateQuestion();
    }
}

function startDeck(index) {
    enforceFullscreen();
    let pData = appData.progress[activeDatasetId];
    currentDeckLabel = decks[index].label;
    currentMode = 'normal';
    historyArray = []; 
    historyIndex = -1;

    if (pData.deckStates[currentDeckLabel] && pData.deckStates[currentDeckLabel].length > 0) {
        activeDeck = [];
        pData.deckStates[currentDeckLabel].forEach(function(wordStr) {
            var found = master.find(function(w) { return w.word === wordStr; });
            if (found) activeDeck.push(found);
        });
        if(activeDeck.length === 0) activeDeck = decks[index].words.slice().sort(function() { return Math.random() - 0.5; });
    } else {
        activeDeck = decks[index].words.slice(); 
        activeDeck.sort(function() { return Math.random() - 0.5; });
    }
    
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('main-ui').style.display = 'flex';
    
    generateQuestion();
}

function exitToDashboard() {
    enforceFullscreen();
    let pData = appData.progress[activeDatasetId];
    
    if (currentMode === 'normal') {
        if (canAnswer && currentQuestionTarget) activeDeck.push(currentQuestionTarget);
        if (activeDeck.length === 0) delete pData.deckStates[currentDeckLabel];
        else pData.deckStates[currentDeckLabel] = activeDeck.map(function(w){return w.word;});
        saveData();
    }

    document.getElementById('main-ui').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    renderDecks(); 
    updateDashStats(); 
}

// ==========================================
// QUIZ ENGINE
// ==========================================
function clean(text, wordToRemove, blankStyle = "...") {
    if (!text) return "No data.";
    var c = text.replace(/<[^>]*>?/gm, ' '); 
    c = c.split(/(?:syn\.|ant\.)/i)[0];
    
    if (wordToRemove) {
        try {
            let safeWord = wordToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            c = c.replace(new RegExp(safeWord, 'gi'), blankStyle);
        } catch(e) {}
    }
    return c.replace(/\s+/g, ' ').trim().replace(/^[;,\-:\.]+|[;,\-:\.]+$/g, "");
}

function goNext() {
    enforceFullscreen();
    if (historyIndex < historyArray.length - 1) {
        historyIndex++;
        displayQuestion(historyArray[historyIndex]);
    } else generateQuestion();
}

function goBack() {
    enforceFullscreen();
    if (historyIndex > 0) {
        historyIndex--;
        displayQuestion(historyArray[historyIndex]);
    }
}

function generateQuestion() {
    if (activeDeck.length === 0) {
        exitToDashboard();
        return;
    }

    canAnswer = false; 
    currentQuestionTarget = activeDeck.pop(); 
    
    let qMode = 0; 
    let badgeText = "Definition";
    if (activeDatasetId === 'idioms') {
        let r = Math.random();
        if (r < 0.33) { qMode = 1; badgeText = "Find the Idiom"; }
        else if (r < 0.66 && currentQuestionTarget.extra) { qMode = 2; badgeText = "Complete Context"; }
        else { qMode = 0; badgeText = "Meaning"; }
    }

    let displayPrompt = currentQuestionTarget.word;
    let targetOptionText = clean(currentQuestionTarget.def, currentQuestionTarget.word, "...");

    if (qMode === 1) {
        displayPrompt = clean(currentQuestionTarget.def, currentQuestionTarget.word, "____");
        targetOptionText = currentQuestionTarget.word;
    } else if (qMode === 2) {
        displayPrompt = `"${clean(currentQuestionTarget.extra, currentQuestionTarget.word, "____")}"`;
        targetOptionText = currentQuestionTarget.word;
    }

    var options = [{ text: targetOptionText, isCorrect: true }];

    let targetLen = targetOptionText.length;
    let distractorPool = [];
    
    for(let i=0; i<40; i++) {
        let rItem = master[Math.floor(Math.random() * master.length)];
        if (rItem.word !== currentQuestionTarget.word) {
            distractorPool.push(rItem);
        }
    }

    distractorPool.sort((a,b) => {
        let lenA = (qMode === 1 || qMode === 2) ? a.word.length : a.def.length;
        let lenB = (qMode === 1 || qMode === 2) ? b.word.length : b.def.length;
        return Math.abs(lenA - targetLen) - Math.abs(lenB - targetLen);
    });

    for(let i=0; i<distractorPool.length && options.length < 4; i++) {
        let rItem = distractorPool[i];
        let dText = (qMode === 1 || qMode === 2) ? rItem.word : clean(rItem.def, rItem.word, "...");
        if (dText && dText.length > 1 && !options.find(o => o.text === dText)) {
            options.push({ text: dText, isCorrect: false });
        }
    }

    let attempts = 0;
    while(options.length < 4 && attempts < 100) {
        attempts++;
        let rItem = master[Math.floor(Math.random() * master.length)];
        let dText = (qMode === 1 || qMode === 2) ? rItem.word : clean(rItem.def, rItem.word, "...");
        if (dText && dText.length > 1 && !options.find(o => o.text === dText)) {
            options.push({ text: dText, isCorrect: false });
        }
    }

    while(options.length < 4) {
        options.push({ text: "None of the above", isCorrect: false });
    }

    options.sort(function() { return Math.random() - 0.5; });
    
    var questionObj = { 
        target: currentQuestionTarget, 
        wordRef: currentQuestionTarget.word,
        displayPrompt: displayPrompt, 
        badgeText: badgeText,
        options: options 
    };
    
    historyArray.push(questionObj);
    historyIndex++;
    displayQuestion(questionObj);
}

// ==========================================
// OFFLINE SEMANTIC EMOJI ENGINE
// ==========================================
function getSemanticEmoji(def) {
    const d = def.toLowerCase();
    
    // The dictionary mapping GRE concepts to visual Emojis
    const emojiMap = [
        { words: ['speak', 'say', 'talk', 'speech', 'word', 'voice', 'language', 'argue', 'criticize', 'scold'], emoji: '🗣️' },
        { words: ['write', 'writing', 'book', 'paper', 'read', 'document', 'text'], emoji: '✍️' },
        { words: ['time', 'old', 'ancient', 'early', 'late', 'history', 'past', 'future', 'delay'], emoji: '⏳' },
        { words: ['good', 'praise', 'approve', 'positive', 'virtue', 'beneficial', 'help'], emoji: '👍' },
        { words: ['bad', 'harm', 'damage', 'evil', 'wrong', 'sin', 'corrupt', 'ruin'], emoji: '⚠️' },
        { words: ['money', 'wealth', 'rich', 'poor', 'buy', 'sell', 'economy', 'finance', 'greed'], emoji: '💰' },
        { words: ['mind', 'think', 'reason', 'logic', 'smart', 'know', 'understand', 'memory'], emoji: '🧠' },
        { words: ['feel', 'emotion', 'love', 'hate', 'heart', 'passion', 'sympathy'], emoji: '❤️' },
        { words: ['water', 'liquid', 'flow', 'drink', 'sea', 'ocean', 'river', 'wash'], emoji: '🌊' },
        { words: ['fire', 'heat', 'burn', 'hot', 'flame', 'ash'], emoji: '🔥' },
        { words: ['light', 'bright', 'shine', 'sun', 'clear', 'illuminate'], emoji: '☀️' },
        { words: ['dark', 'black', 'night', 'shadow', 'dim', 'obscure'], emoji: '🌑' },
        { words: ['plant', 'tree', 'grow', 'leaf', 'nature', 'seed', 'root'], emoji: '🌱' },
        { words: ['people', 'crowd', 'group', 'person', 'society', 'public'], emoji: '👥' },
        { words: ['build', 'structure', 'house', 'city', 'make', 'create', 'foundation'], emoji: '🏗️' },
        { words: ['travel', 'journey', 'walk', 'run', 'move', 'go', 'wander'], emoji: '🚶' },
        { words: ['fight', 'war', 'battle', 'attack', 'conflict', 'violence'], emoji: '⚔️' },
        { words: ['peace', 'calm', 'quiet', 'still', 'rest', 'soothe'], emoji: '🕊️' },
        { words: ['law', 'rule', 'judge', 'court', 'legal', 'crime', 'punish'], emoji: '⚖️' },
        { words: ['holy', 'sacred', 'religion', 'god', 'divine', 'worship', 'church'], emoji: '⛪' },
        { words: ['art', 'music', 'paint', 'create', 'song', 'sing', 'dance'], emoji: '🎨' },
        { words: ['science', 'study', 'measure', 'test', 'observe', 'math'], emoji: '🔬' },
        { words: ['food', 'eat', 'taste', 'hunger', 'meal', 'cook', 'sweet', 'sour'], emoji: '🍽️' },
        { words: ['sick', 'ill', 'disease', 'health', 'cure', 'heal', 'doctor'], emoji: '🏥' },
        { words: ['happy', 'joy', 'laugh', 'smile', 'glad', 'cheerful'], emoji: '😄' },
        { words: ['sad', 'cry', 'sorrow', 'grief', 'depress', 'mourn'], emoji: '😢' },
        { words: ['fear', 'afraid', 'terror', 'panic', 'scare', 'timid'], emoji: '😨' },
        { words: ['angry', 'mad', 'rage', 'fury', 'wrath', 'temper'], emoji: '😠' },
        { words: ['surprise', 'shock', 'amaze', 'wonder', 'sudden', 'astonish'], emoji: '😲' },
        { words: ['secret', 'hide', 'mystery', 'unknown', 'stealth', 'conceal'], emoji: '🕵️' },
        { words: ['power', 'strong', 'force', 'might', 'energy', 'dominate'], emoji: '💪' },
        { words: ['weak', 'frail', 'fragile', 'faint', 'feeble', 'vulnerable'], emoji: '🥀' },
        { words: ['fast', 'quick', 'speed', 'rapid', 'swift', 'hasty'], emoji: '⚡' },
        { words: ['slow', 'sluggish', 'delay', 'late', 'tarry', 'hesitate'], emoji: '🐢' },
        { words: ['large', 'big', 'huge', 'giant', 'massive', 'enormous'], emoji: '🐘' },
        { words: ['small', 'tiny', 'little', 'mini', 'micro', 'brief'], emoji: '🐜' },
        { words: ['stop', 'end', 'halt', 'cease', 'terminate', 'prevent'], emoji: '🛑' },
        { words: ['start', 'begin', 'origin', 'create', 'initiate'], emoji: '🎬' }
    ];

    let foundEmojis = [];
    
    // Scan definition for keywords
    for (let category of emojiMap) {
        for (let word of category.words) {
            let regex = new RegExp("\\b" + word + "\\b", "i");
            if (regex.test(d)) {
                foundEmojis.push(category.emoji);
                break; // Move to next category to avoid spamming the same emoji
            }
        }
        if (foundEmojis.length >= 2) break; // Maximum 2 emojis to look clean
    }

    if (foundEmojis.length > 0) return foundEmojis.join(' ');
    
    // Fallback for highly abstract words that don't hit keywords
    const fallbacks = ['📚', '🧠', '🎓', '💡', '📖', '🎯'];
    let hash = 0;
    for (let i = 0; i < def.length; i++) {
        hash = def.charCodeAt(i) + ((hash << 5) - hash);
    }
    return fallbacks[Math.abs(hash) % fallbacks.length];
}


function displayQuestion(qObj) {
    canAnswer = true;
    enforceFullscreen(); 
    
    let badge = document.getElementById('question-type-badge');
    if (activeDatasetId === 'idioms') {
        badge.style.display = 'inline-block';
        badge.innerText = qObj.badgeText;
    } else {
        badge.style.display = 'none';
    }

    document.getElementById('word-display').innerText = qObj.displayPrompt;
    
    // ==========================================
    // RENDER SEMANTIC EMOJIS
    // ==========================================
    var hintBox = document.getElementById('hint-box');
    var hintImg = document.getElementById('hint-img'); // We hide the actual image tag
    
    hintBox.style.display = 'flex';
    hintBox.style.justifyContent = 'center';
    hintBox.style.alignItems = 'center';
    hintBox.style.fontSize = '80px';
    hintImg.style.display = 'none'; // Hide the image tag entirely
    
    // Ask the Engine to read the definition and provide relevant emojis
    hintBox.innerText = getSemanticEmoji(qObj.target.def);

    // ==========================================
    // OPTIONS & ANSWER HANDLING
    // ==========================================
    var list = document.getElementById('options-list');
    list.innerHTML = '';
    
    let pData = appData.progress[activeDatasetId];

    qObj.options.forEach(function(opt) {
        var b = document.createElement('button');
        b.className = 'option-btn';
        b.innerText = opt.text;
        
        b.onclick = function() {
            enforceFullscreen();
            if(!canAnswer) return;
            canAnswer = false;
            
            if(opt.isCorrect) {
                b.classList.add('correct');
                pData.score += 10; pData.streak++;
                if(!pData.mastered.includes(qObj.wordRef)) pData.mastered.push(qObj.wordRef);
                
                var mIndex = pData.mistakes.indexOf(qObj.wordRef);
                if(mIndex > -1) pData.mistakes.splice(mIndex, 1);

                if (currentMode === 'normal') {
                    pData.deckStates[currentDeckLabel] = activeDeck.map(function(w){return w.word;});
                }
                setTimeout(goNext, 800);
            } else {
                b.classList.add('wrong');
                pData.streak = 0;
                
                if(!pData.mistakes.includes(qObj.wordRef)) pData.mistakes.push(qObj.wordRef);
                var mIndex = pData.mastered.indexOf(qObj.wordRef);
                if(mIndex > -1) pData.mastered.splice(mIndex, 1);

                if (currentMode === 'normal') {
                    pData.deckStates[currentDeckLabel] = activeDeck.map(function(w){return w.word;});
                }

                var allBtns = document.querySelectorAll('.option-btn');
                for(var j=0; j<allBtns.length; j++) {
                    if(allBtns[j].innerText === qObj.options.find(function(o){return o.isCorrect}).text) allBtns[j].classList.add('correct');
                }
            }
            saveData(); 
        };
        list.appendChild(b);
    });
}

// ==========================================
// SWIPE GESTURES
// ==========================================
var touchstartX = 0, touchendX = 0;
var touchSurface = document.getElementById('touch-surface');

touchSurface.addEventListener('touchstart', function(e) { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
touchSurface.addEventListener('touchend', function(e) {
    touchendX = e.changedTouches[0].screenX;
    if ((touchstartX - touchendX) > 50) goNext(); 
    if ((touchstartX - touchendX) < -50) goBack(); 
}, {passive: true});