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
// GAME NAVIGATION
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
    
    let displayPrompt = currentQuestionTarget.word;
    let targetOptionText = clean(currentQuestionTarget.def, currentQuestionTarget.word, "...");
    var options = [{ text: targetOptionText, isCorrect: true }];
    let targetLen = targetOptionText.length;
    let distractorPool = [];
    
    for(let i=0; i<40; i++) {
        let rItem = master[Math.floor(Math.random() * master.length)];
        if (rItem.word !== currentQuestionTarget.word) distractorPool.push(rItem);
    }

    distractorPool.sort((a,b) => {
        let lenA = a.def ? a.def.length : 10;
        let lenB = b.def ? b.def.length : 10;
        return Math.abs(lenA - targetLen) - Math.abs(lenB - targetLen);
    });

    for(let i=0; i<distractorPool.length && options.length < 4; i++) {
        let dText = clean(distractorPool[i].def, distractorPool[i].word, "...");
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
// V2.0 ROOT-STEM NLP EMOTION ENGINE
// ==========================================
if (!document.getElementById('face-animations')) {
    const style = document.createElement('style');
    style.id = 'face-animations';
    style.innerHTML = `
        @keyframes face-shake { 0% { transform: translateX(0); } 25% { transform: translateX(-8px) rotate(-5deg); } 50% { transform: translateX(8px) rotate(5deg); } 75% { transform: translateX(-8px) rotate(-5deg); } 100% { transform: translateX(0); } }
        @keyframes face-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
        @keyframes face-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes face-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
        @keyframes face-sway { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(10deg); } 75% { transform: rotate(-10deg); } }
    `;
    document.head.appendChild(style);
}

function getExpression(def) {
    if (!def) return { face: '🤔', anim: 'face-float 4s infinite' };
    const d = def.toLowerCase();

    // Instead of full words, we search for root stems so it catches 10x more variations!
    // Example: 'angr' catches 'angry', 'angrily', 'angered'.
    const emotions = [
        {
            roots: ['angr', 'mad', 'rage', 'furi', 'wrath', 'temper', 'hostil', 'attack', 'fight', 'violen', 'irat', 'resent', 'indign', 'provok', 'offend', 'scold', 'berat', 'rebuk', 'argu', 'critic'],
            face: '🤬', anim: 'face-shake 0.4s infinite'
        },
        {
            roots: ['sad', 'cry', 'sorrow', 'grief', 'depress', 'mourn', 'gloom', 'moros', 'bleak', 'melanchol', 'lament', 'despair', 'regret', 'traged'],
            face: '😢', anim: 'face-pulse 3s infinite'
        },
        {
            roots: ['happ', 'joy', 'glad', 'cheer', 'good', 'prais', 'friend', 'amicabl', 'love', 'delight', 'elat', 'euphor', 'rejoic', 'celebr', 'approv', 'smile', 'optimis'],
            face: '🤩', anim: 'face-bounce 1.5s infinite'
        },
        {
            roots: ['fear', 'terror', 'panic', 'scare', 'timid', 'afraid', 'anxi', 'dread', 'phobia', 'intimid', 'coward', 'trepid', 'nerv'],
            face: '😨', anim: 'face-shake 0.2s infinite'
        },
        {
            roots: ['confus', 'baffl', 'perplex', 'puzzl', 'myster', 'complex', 'obscur', 'unclear', 'enigma', 'ambigu', 'bewild', 'confound', 'cryptic', 'secret', 'hide'],
            face: '😵‍💫', anim: 'face-float 4s infinite'
        },
        {
            roots: ['disgust', 'mock', 'sarcasm', 'disdain', 'scorn', 'despis', 'contempt', 'hate', 'vile', 'repuls', 'loath', 'ridicul', 'cynic', 'sneer'],
            face: '😒', anim: 'face-sway 3s infinite'
        },
        {
            roots: ['surpris', 'shock', 'amaz', 'wonder', 'sudden', 'astonish', 'stun', 'startl', 'astound'],
            face: '🤯', anim: 'face-pulse 0.8s infinite'
        },
        {
            roots: ['mind', 'think', 'reason', 'logic', 'smart', 'know', 'understand', 'memor', 'wise', 'scholar', 'intellig', 'astut', 'sagaci', 'intellect', 'study', 'scienc', 'math'],
            face: '🤓', anim: 'face-float 3s infinite'
        },
        {
            roots: ['sleep', 'bore', 'slow', 'sluggish', 'delay', 'late', 'tarry', 'hesit', 'tedious', 'dull', 'letharg', 'dormant', 'somnolent', 'tired', 'lazy'],
            face: '🥱', anim: 'face-pulse 4s infinite'
        },
        {
            roots: ['evil', 'sinister', 'wick', 'harm', 'danger', 'deceit', 'trick', 'lie', 'cheat', 'fraud', 'sly', 'malici', 'treacher', 'insidi', 'corrupt', 'ruin', 'bad'],
            face: '😈', anim: 'face-float 2s infinite'
        },
        {
            roots: ['power', 'strong', 'forc', 'might', 'energy', 'dominat', 'larg', 'big', 'huge', 'giant', 'massiv', 'enorm', 'build', 'creat'],
            face: '😤', anim: 'face-pulse 1.5s infinite'
        },
        {
            roots: ['weak', 'frail', 'fragil', 'faint', 'feebl', 'vulnerabl', 'small', 'tini', 'littl', 'mini', 'micro', 'brief', 'stop', 'end', 'halt', 'ceas'],
            face: '🥺', anim: 'face-pulse 3s infinite'
        }
    ];

    // Scan definition for root stems
    for (let emo of emotions) {
        for (let root of emo.roots) {
            // Check if the root appears anywhere at the start of a word in the definition
            if (new RegExp("\\b" + root, "i").test(d)) {
                return { face: emo.face, anim: emo.anim };
            }
        }
    }

    // If a word is so rare it STILL misses, pick a pseudo-random expression based on word length
    const fallbacks = [
        { face: '😐', anim: 'face-float 4s infinite' },
        { face: '😶', anim: 'face-float 4s infinite' },
        { face: '🙂', anim: 'face-float 4s infinite' },
        { face: '🤔', anim: 'face-float 4s infinite' },
        { face: '😌', anim: 'face-float 4s infinite' }
    ];
    return fallbacks[def.length % fallbacks.length];
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
    // RENDER THE NLP FACE ENGINE
    // ==========================================
    var hintBox = document.getElementById('hint-box');
    
    hintBox.style.display = 'flex';
    hintBox.style.justifyContent = 'center';
    hintBox.style.alignItems = 'center';
    hintBox.style.padding = '10px 0';
    hintBox.style.background = 'transparent';
    hintBox.style.border = 'none';
    hintBox.style.boxShadow = 'none';
    
    if (qObj.target.customImage) {
        hintBox.innerHTML = `<img src="${qObj.target.customImage}" style="max-height: 160px; border-radius: 15px;">`;
    } else {
        // Feed the definition into the NLP Lexicon
        let expression = getExpression(qObj.target.def);
        
        // Wrap the native emoji in a massive text container and apply the animation!
        hintBox.innerHTML = `
            <div style="font-size: 110px; animation: ${expression.anim}; text-shadow: 0 10px 20px rgba(0,0,0,0.2); filter: drop-shadow(0 0 5px rgba(255,255,255,0.1));">
                ${expression.face}
            </div>
        `;
    }

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