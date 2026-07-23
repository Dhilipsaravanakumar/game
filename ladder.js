// Ladder: change one letter at a time to turn the start word into the target word.
// Word list + adjacency graph come from ladder-data.js (LADDER_DATA) as a fast,
// offline starting dictionary. Any word typed that isn't already in that set gets
// checked against a free online dictionary (dictionaryapi.dev) — if it's confirmed
// to be a real English word, it's added to wordSet so the game's vocabulary grows
// as people play instead of staying frozen at the ~1,500 words shipped with the page.

var wordSet = new Set(LADDER_DATA.words);
var adj = LADDER_DATA.adj;
var levels = LADDER_DATA.levels;

var currentLevelIndex = -1;
var startWord = "";
var targetWord = "";
var chain = [];
var solvedCount = parseInt(localStorage.getItem("dsk-ladder-solved")) || 0;
var solved = false;
var checking = false; // true while a word is being verified against the online dictionary
var maxLives = 3;
var lives = maxLives;
var maxHints = 3;
var hintsUsed = 0;

var chainEl = document.getElementById("ladder-chain");
var startEl = document.getElementById("start-word");
var targetEl = document.getElementById("target-word");
var formEl = document.getElementById("ladder-form");
var inputEl = document.getElementById("ladder-input");
var messageEl = document.getElementById("ladder-message");
var hintBtn = document.getElementById("ladder-hint");
var newBtn = document.getElementById("ladder-new");
var solvedCountEl = document.getElementById("ladder-solved-count");
var livesEl = document.getElementById("ladder-lives");
var optimalEl = document.getElementById("ladder-optimal");

solvedCountEl.textContent = "Solved: " + solvedCount;

// picks a level different from the current one, so replaying doesn't repeat the same puzzle twice in a row
function pickLevelIndex() {
  if (levels.length === 1) return 0;
  var idx;
  do {
    idx = Math.floor(Math.random() * levels.length);
  } while (idx === currentLevelIndex);
  return idx;
}

function renderLives() {
  var hearts = "";
  for (var i = 0; i < lives; i++) {
    hearts += "\u2764\uFE0F";
  }
  livesEl.textContent = hearts || "\u00A0";
  if (lives <= 0) {
    livesEl.className = "ladder-lives game-over-lives";
  } else {
    livesEl.className = "ladder-lives";
  }
}

function updateHintButton() {
  var remaining = maxHints - hintsUsed;
  hintBtn.textContent = "Hint (" + remaining + ")";
  hintBtn.disabled = remaining <= 0;
}

function showOptimalPath() {
  var path = shortestPathToTarget(startWord);
  if (!path || path.length < 2) {
    optimalEl.style.display = "none";
    return;
  }
  optimalEl.style.display = "block";
  var title = document.createElement("span");
  title.className = "ladder-optimal-title";
  title.textContent = "Best solution (" + (path.length - 1) + " steps):";
  var pathWrap = document.createElement("div");
  pathWrap.className = "ladder-optimal-path";
  path.forEach(function (w, idx) {
    if (idx > 0) {
      var arrow = document.createElement("span");
      arrow.className = "ladder-optimal-arrow";
      arrow.textContent = "\u2192";
      pathWrap.appendChild(arrow);
    }
    var wordSpan = document.createElement("span");
    wordSpan.className = "ladder-optimal-word" + (w === targetWord ? " optimal-win" : "");
    wordSpan.textContent = w.toUpperCase();
    pathWrap.appendChild(wordSpan);
  });
  optimalEl.innerHTML = "";
  optimalEl.appendChild(title);
  optimalEl.appendChild(pathWrap);
}

function startPuzzle() {
  currentLevelIndex = pickLevelIndex();
  var level = levels[currentLevelIndex];
  startWord = level.start;
  targetWord = level.target;
  chain = [startWord];
  solved = false;
  lives = maxLives;
  hintsUsed = 0;
  optimalEl.style.display = "none";
  livesEl.className = "ladder-lives";

  startEl.textContent = startWord.toUpperCase();
  targetEl.textContent = targetWord.toUpperCase();
  inputEl.value = "";
  inputEl.disabled = false;
  inputEl.focus();
  setMessage("");
  renderChain();
  renderLives();
  updateHintButton();
}

function loseLife() {
  lives--;
  renderLives();
  if (lives <= 0) {
    gameOver();
    return true;
  }
  return false;
}

function gameOver() {
  inputEl.disabled = true;
  setMessage("Game Over! No lives left.", "ladder-error");
  showOptimalPath();
  // auto-restart after 4 seconds
  setTimeout(function () {
    startPuzzle();
  }, 4000);
}

function setMessage(text, tone) {
  messageEl.textContent = text || "\u00A0";
  messageEl.className = "ladder-message" + (tone ? " " + tone : "");
}

function renderChain() {
  chainEl.innerHTML = "";
  chain.forEach(function (word, i) {
    var row = document.createElement("div");
    row.className = "chain-row" + (word === targetWord ? " chain-row-win" : "");
    word.split("").forEach(function (letter) {
      var cell = document.createElement("span");
      cell.className = "chain-letter";
      cell.textContent = letter.toUpperCase();
      row.appendChild(cell);
    });
    chainEl.appendChild(row);
  });
}

// exactly one letter differs between two same-length words
function differsByOne(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 1) return false;
  }
  return diff === 1;
}

// Looks a word up against a free online dictionary when it's not already
// in our local set. Returns true/false. Successful lookups are cached into
// wordSet so the same word is instant next time (for anyone playing).
function lookupWordOnline(word) {
  return fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word))
    .then(function (res) {
      if (!res.ok) return false;
      return true;
    })
    .catch(function () {
      return false; // offline or the API is unreachable — fall back to "not found"
    });
}

async function submitWord(raw) {
  if (solved || checking) return;

  var word = (raw || "").trim().toLowerCase();
  var current = chain[chain.length - 1];

  if (word.length !== 4 || !/^[a-z]+$/.test(word)) {
    setMessage("Enter a 4-letter word.", "ladder-error");
    loseLife();
    return;
  }
  if (word === current) {
    setMessage("That's the word you're already on.", "ladder-error");
    loseLife();
    return;
  }
  if (chain.indexOf(word) !== -1) {
    setMessage("Already used that word in this chain.", "ladder-error");
    loseLife();
    return;
  }
  if (!differsByOne(current, word)) {
    setMessage("Change exactly one letter from \"" + current.toUpperCase() + "\".", "ladder-error");
    loseLife();
    return;
  }

  if (!wordSet.has(word)) {
    checking = true;
    inputEl.disabled = true;
    setMessage("Checking \"" + word.toUpperCase() + "\" in the dictionary\u2026");
    var isReal = await lookupWordOnline(word);
    checking = false;
    inputEl.disabled = false;
    if (!isReal) {
      setMessage("\"" + word.toUpperCase() + "\" isn't a recognized word.", "ladder-error");
      loseLife();
      return;
    }
    wordSet.add(word); // gathered from the dictionary — usable for the rest of the session
  }

  chain.push(word);
  inputEl.value = "";
  renderChain();

  if (word === targetWord) {
    solved = true;
    solvedCount++;
    localStorage.setItem("dsk-ladder-solved", solvedCount);
    solvedCountEl.textContent = "Solved: " + solvedCount;
    inputEl.disabled = true;
    setMessage("Solved it in " + (chain.length - 1) + " steps!", "ladder-success");
  } else {
    setMessage("");
  }
}

// BFS shortest path from a word to the target, using only known dictionary words
function shortestPathToTarget(from) {
  if (from === targetWord) return [from];
  var prev = {};
  prev[from] = null;
  var queue = [from];
  var head = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    if (cur === targetWord) break;
    var neighbours = adj[cur] || [];
    for (var i = 0; i < neighbours.length; i++) {
      var nb = neighbours[i];
      if (!(nb in prev)) {
        prev[nb] = cur;
        queue.push(nb);
      }
    }
  }
  if (!(targetWord in prev)) return null;
  var path = [];
  var cur = targetWord;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

// Reveals only which single letter can change next (position + new letter),
// rather than handing over the whole next word.
function giveHint() {
  if (solved || checking) return;
  if (hintsUsed >= maxHints) {
    setMessage("No hints left for this puzzle.", "ladder-error");
    return;
  }
  var current = chain[chain.length - 1];
  var path = shortestPathToTarget(current);
  if (!path || path.length < 2) {
    setMessage("No path found from here \u2014 try New Puzzle.", "ladder-error");
    return;
  }

  hintsUsed++;
  updateHintButton();

  var next = path[1];
  var diffIndex = 0;
  for (var i = 0; i < current.length; i++) {
    if (current[i] !== next[i]) {
      diffIndex = i;
      break;
    }
  }

  var hintLetters = current.split("");
  hintLetters[diffIndex] = next[diffIndex];
  var hintWord = hintLetters.join("");

  inputEl.focus();
  setMessage("Hint: letter  can become \"" + next[diffIndex].toUpperCase() + "\".");
}

formEl.addEventListener("submit", function (e) {
  e.preventDefault();
  submitWord(inputEl.value);
});

hintBtn.addEventListener("click", giveHint);
newBtn.addEventListener("click", startPuzzle);

startPuzzle();