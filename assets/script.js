async function loadApps() {
    const grid = document.getElementById("app-grid");

    try {
        // Try the server API first
        const res = await fetch("./api/apps");
        if (!res.ok) throw new Error("API unavailable");
        const apps = await res.json();
        renderApps(grid, apps);
    } catch {
        // Fallback: try loading app.json from known app directories
        try {
            const apps = await discoverAppsOffline();
            renderApps(grid, apps);
        } catch {
            grid.innerHTML =
                '<p class="empty-state">Could not load apps. Is the server running?</p>';
        }
    }
}

async function discoverAppsOffline() {
    const slugs = ["analog-clock", "snake-game"];
    const apps = [];

    for (const slug of slugs) {
        try {
            const res = await fetch(`./apps/${slug}/app.json`);
            if (!res.ok) continue;
            const data = await res.json();
            data.slug = slug;
            data.path = `./apps/${slug}/`;
            apps.push(data);
        } catch {
            continue;
        }
    }
    return apps;
}

function renderApps(grid, apps) {
    grid.innerHTML = "";

    if (apps.length === 0) {
        grid.innerHTML =
            '<p class="empty-state">No apps yet. Add one to the <code>apps/</code> directory to get started.</p>';
        return;
    }

    apps.forEach((app) => {
        const card = document.createElement("a");
        card.href = app.path;
        card.className = "app-card";
        card.style.setProperty("--accent", app.color || "#6366f1");

        const iconSrc = app.icon
            ? `./apps/${app.slug}/${app.icon}`
            : null;
        const fallbackLetter = (app.name || "?").charAt(0);

        card.innerHTML = `
            <div class="app-icon">
                ${iconSrc
                    ? `<img src="${iconSrc}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'icon-fallback\\'>${fallbackLetter}</span>'">`
                    : `<span class="icon-fallback">${fallbackLetter}</span>`
                }
            </div>
            <div class="app-text">
                <span class="app-name">${app.name}</span>
                <span class="app-description">${app.description || ""}</span>
            </div>
        `;

        grid.appendChild(card);
    });
}

loadApps();
