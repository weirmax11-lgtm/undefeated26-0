// ============================================================================
// 26-0 RETRO ENGINE
// ============================================================================

// Definitions
const DECADES = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
const TEAM_MAP = {
    "adelaide": "Adelaide", "brisbaneb": "Brisbane Bears", "brisbanel": "Brisbane Lions",
    "carlton": "Carlton", "collingwood": "Collingwood", "essendon": "Essendon",
    "fitzroy": "Fitzroy", "fremantle": "Fremantle", "geelong": "Geelong",
    "goldcoast": "Gold Coast", "gws": "GWS Giants", "hawthorn": "Hawthorn",
    "melbourne": "Melbourne", "kangaroos": "Kangaroos", "padelaide": "Port Adelaide",
    "richmond": "Richmond", "stkilda": "St Kilda", "swans": "Swans",
    "westcoast": "West Coast", "bulldogs": "Bulldogs"
};
const TEAM_SLUGS = Object.keys(TEAM_MAP);

// Game State
let gameMode = 'classic'; // 'classic' or 'footyiq'
let coachesDB = [];
let loadedDecadeData = null;
let currentlyLoadedDecade = ""; 
let draftedPlayersCount = 0;
let userSquad = {}; // Maps position IDs to selected player objects

let currentCandidatePool = []; // Players/Coaches listed after a spin
let activeSelectedCandidate = null; // The player currently clicked on in the list

// --- INITIALIZATION & UI ROUTING ---
window.onload = async () => {
    try {
        const coachResponse = await fetch('coaches.json');
        coachesDB = await coachResponse.json();
    } catch (err) {
        console.error("Failed to load coaches", err);
    }
};

function showModeSelect() {
    document.getElementById('introModal').classList.add('hidden');
    document.getElementById('modeModal').classList.remove('hidden');
}

function startGame(mode) {
    gameMode = mode;
    document.getElementById('modeModal').classList.add('hidden');
    document.getElementById('modeDisplay').innerText = mode === 'classic' ? 'CLASSIC' : 'FOOTY IQ';
}

// --- SLOT MACHINE ANIMATION & FETCHING ---
function triggerSpin() {
    if (draftedPlayersCount >= 19) return;
    
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = true;
    spinBtn.style.opacity = '0.5';
    spinBtn.innerText = "SPINNING...";
    
    // Clear list and selection
    document.getElementById('rosterList').innerHTML = "";
    activeSelectedCandidate = null;

    let ticks = 0;
    const maxTicks = 20; // Animation length
    const slotTeam = document.getElementById('slotTeam');
    const slotDecade = document.getElementById('slotDecade');

    // Slot visual effect
    const spinInterval = setInterval(() => {
        slotTeam.innerText = TEAM_MAP[TEAM_SLUGS[Math.floor(Math.random() * TEAM_SLUGS.length)]].toUpperCase();
        slotDecade.innerText = DECADES[Math.floor(Math.random() * DECADES.length)];
        ticks++;
        
        if (ticks >= maxTicks) {
            clearInterval(spinInterval);
            finalizeSpin();
        }
    }, 50);
}

async function finalizeSpin() {
    // Pick final results
    const finalTeamSlug = TEAM_SLUGS[Math.floor(Math.random() * TEAM_SLUGS.length)];
    const finalDecade = DECADES[Math.floor(Math.random() * DECADES.length)];
    
    document.getElementById('slotTeam').innerText = TEAM_MAP[finalTeamSlug].toUpperCase();
    document.getElementById('slotDecade').innerText = finalDecade;

    await loadAndFilterData(finalTeamSlug, finalDecade);
}

async function loadAndFilterData(teamSlug, decadeStr) {
    let pool = [];

    // 1. Fetch Coaches for this era
    let eraCoaches = coachesDB.filter(c => {
        if (c.Team_Slug !== teamSlug) return false;
        const years = c.Seas.split('-');
        const startY = parseInt(years[0]);
        const endY = years[1] ? parseInt(years[1]) : 2026;
        const decStart = parseInt(decadeStr.substring(0, 4));
        // Check if coach tenure overlaps with the spun decade
        return (startY <= decStart + 9 && endY >= decStart);
    });
    
    eraCoaches.forEach(c => pool.push({ ...c, isCoach: true }));

    // 2. Fetch Players for this era
    try {
        if (currentlyLoadedDecade !== decadeStr) {
            const response = await fetch(`decades/${decadeStr}.json`);
            loadedDecadeData = await response.json();
            currentlyLoadedDecade = decadeStr;
        }

        // Filter players by team, then group their stats to create a single "Decade Average" card
        const rawTeamPlayers = loadedDecadeData.filter(p => p.Team.toLowerCase().replace(/\s+/g, '') === teamSlug);
        const groupedPlayers = {};

        rawTeamPlayers.forEach(p => {
            if (!groupedPlayers[p.Player]) {
                groupedPlayers[p.Player] = { 
                    Player: p.Player, isCoach: false, 
                    GM: 0, DI: 0, MK: 0, GL: 0, BH: 0, TK: 0, HO: 0, BR: 0 
                };
            }
            // Aggregate totals across the decade
            groupedPlayers[p.Player].GM += (p.GM || 0);
            groupedPlayers[p.Player].DI += (p.DI || 0);
            groupedPlayers[p.Player].MK += (p.MK || 0);
            groupedPlayers[p.Player].GL += (p.GL || 0);
            groupedPlayers[p.Player].BH += (p.BH || 0);
            groupedPlayers[p.Player].TK += (p.TK || 0);
            groupedPlayers[p.Player].HO += (p.HO || 0);
            groupedPlayers[p.Player].BR += (p.BR || 0);
        });

        // Add to main pool (Filter out players who didn't play at least 5 games in the decade to remove clutter)
        Object.values(groupedPlayers).forEach(gp => {
            if (gp.GM >= 5) pool.push(gp);
        });

    } catch (err) {
        console.error("Failed loading decade data", err);
    }

    currentCandidatePool = pool;
    renderList();
}

// --- RENDERING & SELECTION ---
function renderList() {
    const container = document.getElementById('rosterList');
    container.innerHTML = "";

    if (currentCandidatePool.length === 0) {
        container.innerHTML = "<div style='color:var(--neon-pink)'>No players found. Spin again!</div>";
        resetSpinButton();
        return;
    }

    // Sort alphabetically by last name
    currentCandidatePool.sort((a, b) => {
        const nameA = a.isCoach ? a.Coach : a.Player;
        const nameB = b.isCoach ? b.Coach : b.Player;
        return nameA.localeCompare(nameB);
    });

    currentCandidatePool.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'player-card';
        div.id = `card-${index}`;
        
        const displayName = formatName(item.isCoach ? item.Coach : item.Player);
        
        let statsHtml = "";
        if (gameMode === 'classic') {
            if (item.isCoach) {
                statsHtml = `Win Rate: ${item.Total_Pct}% | Flags: ${item.GF}`;
            } else {
                // Calculate Per Game Averages
                const gms = item.GM || 1;
                statsHtml = `Avg - DI:${(item.DI/gms).toFixed(1)} MK:${(item.MK/gms).toFixed(1)} GL:${(item.GL/gms).toFixed(1)}`;
            }
        } else {
            statsHtml = "? ? ? (Footy IQ Mode)";
        }

        div.innerHTML = `
            <strong>${item.isCoach ? '[COACH] ' : ''}${displayName}</strong>
            <div class="card-stats">${statsHtml}</div>
        `;
        
        div.onclick = () => selectCandidateFromList(item, index);
        container.appendChild(div);
    });
}

function formatName(rawName) {
    // Converts "Cripps, Patrick" to "Patrick Cripps"
    if (rawName.includes(',')) {
        const parts = rawName.split(',');
        return `${parts[1].trim()} ${parts[0].trim()}`;
    }
    return rawName;
}

function getInitials(rawName) {
    // Converts "Cripps, Patrick" to "PC"
    if (rawName.includes(',')) {
        const parts = rawName.split(',');
        return (parts[1].trim().charAt(0) + parts[0].trim().charAt(0)).toUpperCase();
    }
    return rawName.substring(0, 2).toUpperCase();
}

function selectCandidateFromList(item, index) {
    activeSelectedCandidate = item;
    
    // Visually highlight selection
    document.querySelectorAll('.player-card').forEach(el => el.classList.remove('active'));
    document.getElementById(`card-${index}`).classList.add('active');
}

function assignToField(positionId) {
    // Validation: Ensure they selected someone, and the slot is empty
    if (!activeSelectedCandidate) return;
    if (userSquad[positionId]) {
        alert("This position is already filled!");
        return;
    }
    
    // Enforce Coach rule
    if (positionId === 'Coach' && !activeSelectedCandidate.isCoach) {
        alert("You must assign a Coach to this position!");
        return;
    }
    if (positionId !== 'Coach' && activeSelectedCandidate.isCoach) {
        alert("A Coach cannot play on the field!");
        return;
    }

    // Assign Data
    userSquad[positionId] = activeSelectedCandidate;
    draftedPlayersCount++;
    document.getElementById('draftCount').innerText = draftedPlayersCount;

    // Update Field UI
    const slotEl = document.getElementById(`slot-${positionId}`);
    slotEl.classList.add('filled');
    
    const rawName = activeSelectedCandidate.isCoach ? activeSelectedCandidate.Coach : activeSelectedCandidate.Player;
    if (positionId === 'Coach') {
        slotEl.innerText = formatName(rawName).toUpperCase();
    } else {
        slotEl.innerText = getInitials(rawName);
    }

    // Reset loop
    activeSelectedCandidate = null;
    document.getElementById('rosterList').innerHTML = "<div style='opacity: 0.5; text-align: center; margin-top: 50px;'>Position filled! Spin again.</div>";
    
    if (draftedPlayersCount >= 19) {
        setTimeout(calculateFinalScore, 500); // Small delay for UX
    } else {
        resetSpinButton();
    }
}

function resetSpinButton() {
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = false;
    spinBtn.style.opacity = '1';
    spinBtn.innerText = "SPIN";
}

// --- SCORING SIMULATION ---
function calculateFinalScore() {
    let rawSquadScore = 0;

    Object.values(userSquad).forEach(p => {
        if (p.isCoach) {
            const winPct = p.Total_Pct || 50.0;
            const gfBonus = (p.GF || 0) * 5; 
            rawSquadScore += (winPct * 0.5) + gfBonus;
        } else {
            // Convert decade totals to per-game averages
            const games = p.GM || 1;
            const avgDI = (p.DI || 0) / games;
            const avgMK = (p.MK || 0) / games;
            const avgGL = (p.GL || 0) / games;
            const avgBH = (p.BH || 0) / games;
            const avgTK = (p.TK || 0) / games;
            const avgHO = (p.HO || 0) / games;
            const totalBR = (p.BR || 0); // Keep brownlow total as era impact weight

            const playerPower = 
                (avgDI * 4.5) +   
                (avgMK * 2.0) +   
                (avgGL * 15.0) +  
                (avgBH * 3.0) +   
                (avgTK * 5.0) +   
                (avgHO * 1.2) +   
                (totalBR * 3.5);  
                
            rawSquadScore += playerPower;
        }
    });

    let calculatedWins = Math.min(26, Math.max(0, Math.floor(rawSquadScore / 24)));
    let calculatedLosses = 26 - calculatedWins;

    document.getElementById('finalScoreText').innerText = `${calculatedWins} - ${calculatedLosses}`;
    
    let feedback = "A solid effort, but lacking the elite consistency for September action.";
    if (calculatedWins === 26) feedback = "PERFECTION! 26-0! The greatest side ever assembled!";
    else if (calculatedWins >= 22) feedback = "Premiership Champions! A dynasty team!";
    else if (calculatedWins >= 15) feedback = "Finals Bound! You made the 8, but couldn't grab the flag.";

    document.getElementById('finalFeedbackText').innerText = feedback;
    document.getElementById('resultModal').classList.remove('hidden');
}
