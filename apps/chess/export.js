// Save export / import. Dumps every chess-v2:* localStorage key (ratings, game
// history, preferences, and any paused game) to a JSON file, and restores from
// one. This is the backup mechanism for your ratings and game history.

function downloadSave() {
    const raw = {};
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("chess-v2")) {
            try { raw[key] = JSON.parse(localStorage.getItem(key)); }
            catch (_) { raw[key] = localStorage.getItem(key); }
        }
    }
    const payload = { app: "chess", version: 2, exported: new Date().toISOString(), data: raw };
    const today = new Date().toISOString().slice(0, 10);
    const blob  = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href = url;
    a.download = `chess-save-${today}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// Restore from an exported file. Accepts the new { app, data:{...} } payload, a
// bare object of chess keys, or (for backwards compatibility) the old Markdown
// export whose ```json appendix holds the keys. Reloads on success.
function importSaveFromText(text) {
    let parsed = null;
    try { parsed = JSON.parse(text); }
    catch (_) {
        const m = text.match(/```json\s*([\s\S]*?)```/);
        if (m) { try { parsed = JSON.parse(m[1]); } catch (_) { parsed = null; } }
    }

    // Unwrap the { data: {...} } envelope if present.
    let data = parsed;
    if (parsed && typeof parsed === "object" && parsed.data && typeof parsed.data === "object") data = parsed.data;

    const keys = data && typeof data === "object" && !Array.isArray(data)
        ? Object.keys(data).filter((k) => k.startsWith("chess"))
        : [];
    if (!keys.length) { showToast("Not a valid chess save file"); return false; }

    if (!confirm("Replace all current data with this save file? This cannot be undone.")) return false;

    for (const k of keys) {
        const v = data[k];
        localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    showToast("Save imported — reloading…");
    setTimeout(() => location.reload(), 600);
    return true;
}

window.downloadSave       = downloadSave;
window.importSaveFromText = importSaveFromText;
