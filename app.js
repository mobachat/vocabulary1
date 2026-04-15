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
// PARAMETRIC ANIMATED FACE ENGINE
// ==========================================
// This injects standard keyframes into the document head if they don't exist
if (!document.getElementById('face-animations')) {
    const style = document.createElement('style');
    style.id = 'face-animations';
    style.innerHTML = `
        @keyframes face-shake { 0% { transform: translateX(0); } 25% { transform: translateX(-5px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-5px); } 100% { transform: translateX(0); } }
        @keyframes face-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes face-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes face-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
    `;
    document.head.appendChild(style);
}

function getAnimatedFace(def) {
    if (!def) def = "";
    const d = def.toLowerCase();
    
    // Default: Neutral/Thinking Face
    let color = "#fbbf24"; // Amber/Yellow
    let eyebrows = `<path d="M 30 35 Q 40 30 50 35" stroke="#451a03" stroke-width="4" fill="none" stroke-linecap="round"/> <path d="M 70 35 Q 80 30 90 35" stroke="#451a03" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    let eyes = `<circle cx="40" cy="50" r="5" fill="#451a03"/> <circle cx="80" cy="50" r="5" fill="#451a03"/>`;
    let mouth = `<path d="M 40 70 Q 60 70 80 70" stroke="#451a03" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    let animation = "face-float 3s ease-in-out infinite";

    // 1. Angry / Hostile (Red, downward inner brows, frown, shaking)
    if (/\b(angry|mad|rage|fury|wrath|temper|hostile|attack|fight|violence)\b/.test(d)) {
        color = "#ef4444"; // Red
        eyebrows = `<line x1="30" y1="30" x2="50" y2="40" stroke="#451a03" stroke-width="5" stroke-linecap="round"/> <line x1="70" y1="40" x2="90" y2="30" stroke="#451a03" stroke-width="5" stroke-linecap="round"/>`;
        mouth = `<path d="M 35 80 Q 60 65 85 80" stroke="#451a03" stroke-width="5" fill="none" stroke-linecap="round"/>`;
        animation = "face-shake 0.5s infinite";
    }
    // 2. Happy / Good (Yellow, high brows, big smile, bouncing)
    else if (/\b(happy|joy|glad|cheerful|good|praise|friendly|amicable|love)\b/.test(d)) {
        color = "#fcd34d"; // Bright Yellow
        eyebrows = `<path d="M 30 30 Q 40 20 50 30" stroke="#451a03" stroke-width="3" fill="none" stroke-linecap="round"/> <path d="M 70 30 Q 80 20 90 30" stroke="#451a03" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        mouth = `<path d="M 30 65 Q 60 95 90 65" stroke="#451a03" stroke-width="5" fill="none" stroke-linecap="round"/>`;
        animation = "face-bounce 2s infinite";
    }
    // 3. Sad / Depressed (Blue, downward outer brows, deep frown, slow pulse)
    else if (/\b(sad|cry|sorrow|grief|depress|mourn|gloomy|morose|bleak)\b/.test(d)) {
        color = "#60a5fa"; // Blue
        eyebrows = `<line x1="30" y1="40" x2="50" y2="30" stroke="#1e3a8a" stroke-width="4" stroke-linecap="round"/> <line x1="70" y1="30" x2="90" y2="40" stroke="#1e3a8a" stroke-width="4" stroke-linecap="round"/>`;
        eyes = `<circle cx="40" cy="55" r="5" fill="#1e3a8a"/> <circle cx="80" cy="55" r="5" fill="#1e3a8a"/> <path d="M 40 65 L 40 75" stroke="#60a5fa" stroke-width="2"/>`; // Tears
        mouth = `<path d="M 35 80 Q 60 60 85 80" stroke="#1e3a8a" stroke-width="4" fill="none" stroke-linecap="round"/>`;
        animation = "face-pulse 4s infinite";
    }
    // 4. Surprised / Shocked (Yellow, high dot brows, O mouth, fast pulse)
    else if (/\b(surprise|shock|amaze|wonder|sudden|astonish|stun)\b/.test(d)) {
        color = "#fde047";
        eyebrows = `<circle cx="40" cy="25" r="3" fill="#451a03"/> <circle cx="80" cy="25" r="3" fill="#451a03"/>`;
        eyes = `<circle cx="40" cy="45" r="6" fill="#451a03"/> <circle cx="80" cy="45" r="6" fill="#451a03"/>`;
        mouth = `<circle cx="60" cy="75" r="10" fill="#451a03"/>`;
        animation = "face-pulse 1s infinite";
    }
    // 5. Confused / Complex (Purple/Grey, asymmetrical brows, squiggly mouth)
    else if (/\b(confuse|baffle|perplex|puzzle|mystery|complex|obscure|unclear)\b/.test(d)) {
        color = "#c084fc"; // Purple
        eyebrows = `<line x1="30" y1="35" x2="50" y2="25" stroke="#4a044e" stroke-width="4" stroke-linecap="round"/> <line x1="70" y1="35" x2="90" y2="35" stroke="#4a044e" stroke-width="4" stroke-linecap="round"/>`;
        mouth = `<path d="M 35 75 Q 45 65 55 75 T 75 75" stroke="#4a044e" stroke-width="4" fill="none" stroke-linecap="round"/>`;
        animation = "face-float 4s infinite";
    }
    // 6. Scary / Evil (Dark purple/black, sharp brows, jagged mouth)
    else if (/\b(fear|terror|evil|sinister|wicked|harm|danger)\b/.test(d)) {
        color = "#374151"; // Dark grey
        eyebrows = `<line x1="25" y1="20" x2="55" y2="45" stroke="#111827" stroke-width="6" stroke-linecap="round"/> <line x1="95" y1="20" x2="65" y2="45" stroke="#111827" stroke-width="6" stroke-linecap="round"/>`;
        eyes = `<circle cx="40" cy="50" r="4" fill="#ef4444"/> <circle cx="80" cy="50" r="4" fill="#ef4444"/>`; // Red eyes
        mouth = `<path d="M 30 75 L 45 85 L 60 70 L 75 85 L 90 75" stroke="#111827" stroke-width="4" fill="none" stroke-linejoin="miter"/>`;
        animation = "face-pulse 2s infinite";
    }

    // Combine into final SVG string with animation applied to the wrapper
    return `
        <div style="width: 120px; height: 120px; animation: ${animation};">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="100%" height="100%">
                <circle cx="60" cy="60" r="55" fill="${color}" stroke="rgba(0,0,0,0.1)" stroke-width="4"/>
                ${eyebrows}
                ${eyes}
                ${mouth}
            </svg>
        </div>
    `;
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
    // RENDER THE PARAMETRIC FACE 
    // ==========================================
    var hintBox = document.getElementById('hint-box');
    
    hintBox.style.display = 'flex';
    hintBox.style.justifyContent = 'center';
    hintBox.style.alignItems = 'center';
    hintBox.style.padding = '10px 0';
    hintBox.style.background = 'transparent'; // Remove the dark background box
    hintBox.style.border = 'none';
    hintBox.style.boxShadow = 'none';
    
    // Generate the face based on the definition!
    if (qObj.target.customImage) {
        hintBox.innerHTML = `<img src="${qObj.target.customImage}" style="max-height: 140px; border-radius: 15px;">`;
    } else {
        hintBox.innerHTML = getAnimatedFace(qObj.target.def);
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