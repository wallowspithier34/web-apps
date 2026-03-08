// Maghrib times for London during remaining Ramadan 2026 (March 8–19)
// London is on GMT (UTC+0) during this period — clocks change March 29
// All times are 24h UTC, which equals London local time
const MAGHRIB = [
    { date: "2026-03-08", h: 17, m: 56 },
    { date: "2026-03-09", h: 17, m: 58 },
    { date: "2026-03-10", h: 18, m:  0 },
    { date: "2026-03-11", h: 18, m:  1 },
    { date: "2026-03-12", h: 18, m:  3 },
    { date: "2026-03-13", h: 18, m:  5 },
    { date: "2026-03-14", h: 18, m:  6 },
    { date: "2026-03-15", h: 18, m:  8 },
    { date: "2026-03-16", h: 18, m: 10 },
    { date: "2026-03-17", h: 18, m: 12 },
    { date: "2026-03-18", h: 18, m: 13 },
    { date: "2026-03-19", h: 18, m: 15 }, // last day of Ramadan
];

// Ramadan started Feb 18, 2026
const RAMADAN_START = Date.UTC(2026, 1, 18);
const LAST_DAY     = Date.UTC(2026, 2, 19); // March 19

function pad(n) { return String(n).padStart(2, "0"); }

function update() {
    const now = new Date();

    // Use UTC which equals London time for this period
    const y  = now.getUTCFullYear();
    const mo = now.getUTCMonth() + 1;
    const d  = now.getUTCDate();
    const todayStr  = `${y}-${pad(mo)}-${pad(d)}`;
    const todayUTC  = Date.UTC(y, mo - 1, d);

    const dayLabel    = document.getElementById("day-label");
    const countdownEl = document.getElementById("countdown");
    const maghribEl   = document.getElementById("maghrib-label");
    const messageEl   = document.getElementById("message");

    // Calculate Ramadan day number
    const dayNum = Math.floor((todayUTC - RAMADAN_START) / 86400000) + 1;

    // After Ramadan ends — show Eid message
    if (todayUTC > LAST_DAY) {
        dayLabel.textContent    = "Eid Mubarak!";
        countdownEl.style.display = "none";
        maghribEl.textContent   = "Ramadan 2026 has ended";
        messageEl.textContent   = "";
        return; // no need to keep ticking
    }

    // Find today's Maghrib entry
    const entry = MAGHRIB.find((e) => e.date === todayStr);

    if (!entry) {
        // Date not in our data (before Mar 8 or a gap)
        dayLabel.textContent    = "Ramadan 2026";
        countdownEl.style.display = "none";
        maghribEl.textContent   = "No data for today";
        messageEl.textContent   = "";
        setTimeout(update, 60000);
        return;
    }

    // Maghrib timestamp for today in UTC (= London time)
    const maghribUTC = Date.UTC(y, mo - 1, d, entry.h, entry.m, 0);
    const diff       = maghribUTC - now.getTime();

    // Format the Maghrib time for display (e.g. "6:05 PM")
    const displayH   = entry.h > 12 ? entry.h - 12 : entry.h;
    const ampm       = entry.h >= 12 ? "PM" : "AM";
    const timeStr    = `${displayH}:${pad(entry.m)} ${ampm}`;

    dayLabel.textContent = `Day ${dayNum} of Ramadan`;

    if (diff > 0) {
        // Before Maghrib — show countdown
        countdownEl.style.display = "";
        const totalSecs = Math.floor(diff / 1000);
        document.getElementById("hours").textContent   = pad(Math.floor(totalSecs / 3600));
        document.getElementById("minutes").textContent = pad(Math.floor((totalSecs % 3600) / 60));
        document.getElementById("seconds").textContent = pad(totalSecs % 60);
        maghribEl.textContent = `Maghrib at ${timeStr}`;
        messageEl.textContent = "";
    } else {
        // After Maghrib — fast is broken
        countdownEl.style.display = "none";
        maghribEl.textContent = `Maghrib was at ${timeStr}`;
        messageEl.textContent = "Enjoy your iftar!";
    }

    setTimeout(update, 1000);
}

update();
