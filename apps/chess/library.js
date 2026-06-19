// Read-only openings library browser.
// Personal statistics only — no database win/draw rates shown.

function initLibrary() {
    const store = getStore();
    const list  = document.getElementById("library-list");
    list.innerHTML = "";

    for (const o of OPENINGS) {
        const mastery  = store.openingMastery(o.id);
        const learned  = store.openingLearned(o.id);
        const total    = store.openingTotal(o.id);
        const accuracy = store.openingAccuracy(o.id);
        const accStr   = accuracy != null ? `${accuracy}%` : "—";
        const side     = o.color === "w" ? "White" : "Black";
        const unlocked = store.isTierUnlocked(o.tier);

        const row = document.createElement("div");
        row.className = "lib-row";

        // Build move sequence for display
        let movesHtml = "";
        const g = new Chess();
        for (let i = 0; i < o.moves.length; i++) {
            const mv = o.moves[i];
            const r  = g.move(Chess.parseUci(mv.uci));
            const san = r ? r.san : mv.uci;
            const moveNum = i % 2 === 0 ? `<span class="lib-move-num">${Math.floor(i / 2) + 1}.</span> ` : "";
            const note = mv.note ? ` <span class="lib-move-note">(${mv.note})</span>` : "";
            movesHtml += `${moveNum}<span class="lib-move-uci">${san}</span>${note} `;
        }

        row.innerHTML = `
            <div class="lib-head">
                <div>
                    <div class="lib-name">${o.name}</div>
                    <div class="lib-meta">${o.eco} · ${side} · Tier ${o.tier}</div>
                </div>
                <span class="lib-chev">▼</span>
            </div>
            <div class="lib-body">
                ${o.idea ? `<div class="lib-idea">${o.idea}</div>` : ""}
                <div class="lib-stats">
                    <div class="lib-stat-item">Your mastery: <strong>${mastery}%</strong></div>
                    <div class="lib-stat-item">Positions learned: <strong>${learned}/${total}</strong></div>
                    <div class="lib-stat-item">Your accuracy: <strong>${accStr}</strong></div>
                    ${!unlocked ? `<div class="lib-stat-item" style="color:var(--text-faint)">🔒 Locked until Tier ${o.tier - 1} reaches 50% mastery</div>` : ""}
                </div>
                <div class="lib-moves">${movesHtml}</div>
            </div>`;

        const head = row.querySelector(".lib-head");
        head.addEventListener("click", () => row.classList.toggle("expanded"));

        list.appendChild(row);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-library-back").addEventListener("click", () => {
        showScreen("screen-home");
    });
});

window.initLibrary = initLibrary;
