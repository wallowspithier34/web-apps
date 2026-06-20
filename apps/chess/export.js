// Markdown export of all chess app progress and settings.
// Triggered by a button in the settings panel.

function downloadMarkdown(store, eloStore, prefs) {
    const today = new Date().toISOString().slice(0, 10);
    const lines = [];

    lines.push("# Chess App — Progress Export");
    lines.push(`**Export date:** ${today}`);
    lines.push("");

    // ── Elo & bot stats ──────────────────────────────────────────────────────
    lines.push("## Rating & Bot History");
    lines.push(`**Current Elo:** ${eloStore.elo}`);
    const hist = eloStore.history;
    if (hist.length) {
        const wins   = hist.filter((h) => h.result === 1).length;
        const draws  = hist.filter((h) => h.result === 0.5).length;
        const losses = hist.filter((h) => h.result === 0).length;
        lines.push(`**Bot games (last ${hist.length}):** ${wins}W / ${draws}D / ${losses}L`);
        lines.push("");
        lines.push("| Date | Result | Δ Elo | Opponent Elo |");
        lines.push("|------|--------|-------|--------------|");
        for (const h of [...hist].reverse().slice(0, 20)) {
            const r = h.result === 1 ? "Win" : h.result === 0.5 ? "Draw" : "Loss";
            const d = h.delta >= 0 ? `+${h.delta}` : `${h.delta}`;
            lines.push(`| ${h.date} | ${r} | ${d} | ~${h.opponentElo} |`);
        }
    } else {
        lines.push("No bot games recorded yet.");
    }
    lines.push("");

    // ── Trainer stats ────────────────────────────────────────────────────────
    lines.push("## Opening Trainer");
    lines.push(`**Streak:** ${store.data.streak.count} day(s)`);
    lines.push(`**Total XP:** ${store.data.xp}`);
    lines.push(`**Total reviews:** ${store.data.totalReviews}`);
    lines.push("");
    lines.push("### Progress by Opening");
    lines.push("");
    lines.push("| Opening | ECO | Side | Mastery | Learned | Your accuracy |");
    lines.push("|---------|-----|------|---------|---------|---------------|");
    for (const o of OPENINGS) {
        const mastery  = store.openingMastery(o.id) + "%";
        const learned  = `${store.openingLearned(o.id)}/${store.openingTotal(o.id)}`;
        const acc      = store.openingAccuracy(o.id);
        const accStr   = acc != null ? acc + "%" : "—";
        const side     = o.color === "w" ? "White" : "Black";
        lines.push(`| ${o.name} | ${o.eco} | ${side} | ${mastery} | ${learned} | ${accStr} |`);
    }
    lines.push("");

    // ── Settings ─────────────────────────────────────────────────────────────
    lines.push("## Settings");
    lines.push(`- **Piece style:** ${prefs.pieces}`);
    lines.push(`- **Board theme:** ${prefs.board}`);
    const tp = TIMER_PRESETS[prefs.timerPreset] || TIMER_PRESETS[NO_TIMER_IDX];
    lines.push(`- **Timer preset:** ${tp.label}`);
    const diff = prefs.botDifficulty;
    if (diff.mode === "auto") {
        lines.push(`- **Bot difficulty:** Auto (based on Elo ${eloStore.elo})`);
    } else {
        lines.push(`- **Bot difficulty:** Manual — Skill Level ${diff.skillLevel}`);
    }
    lines.push("");

    // ── Raw data appendix ────────────────────────────────────────────────────
    lines.push("## Raw Data Appendix");
    lines.push("");
    lines.push("```json");
    const raw = {};
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("chess") || key.startsWith("chess-openings")) {
            try { raw[key] = JSON.parse(localStorage.getItem(key)); }
            catch (_) { raw[key] = localStorage.getItem(key); }
        }
    }
    lines.push(JSON.stringify(raw, null, 2));
    lines.push("```");

    const md   = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `chess-progress-${today}.md`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ── Import / restore ──────────────────────────────────────────────────────────
// Accepts the text of a previously exported file: either raw JSON, or the
// Markdown export (whose ```json appendix is extracted). Restores every
// localStorage key that starts with "chess", then reloads. Returns false (and
// toasts) on invalid input or if the user cancels the overwrite confirmation.
function importProgressFromText(text) {
    let data = null;

    // 1) Try the whole file as JSON; else pull the fenced ```json block (md export).
    try {
        data = JSON.parse(text);
    } catch (_) {
        const m = text.match(/```json\s*([\s\S]*?)```/);
        if (m) { try { data = JSON.parse(m[1]); } catch (_) { data = null; } }
    }

    // 2) Validate: a plain object containing at least one chess* key.
    const keys = data && typeof data === "object" && !Array.isArray(data)
        ? Object.keys(data).filter((k) => k.startsWith("chess"))
        : [];
    if (!keys.length) {
        showToast("Not a valid chess save file");
        return false;
    }

    // 3) Confirm — this replaces all current progress.
    if (!confirm("Replace all current progress with this save file? This cannot be undone.")) {
        return false;
    }

    // 4) Restore and reload so every store re-initialises from the new data.
    for (const k of keys) {
        const v = data[k];
        localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    showToast("Save imported — reloading…");
    setTimeout(() => location.reload(), 600);
    return true;
}

window.downloadMarkdown = downloadMarkdown;
window.importProgressFromText = importProgressFromText;
