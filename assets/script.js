async function loadApps() {
    const grid = document.getElementById("app-grid");

    try {
        // Load app list from static index — works locally and on GitHub Pages
        const res = await fetch("./apps/index.json");
        if (!res.ok) throw new Error("index not found");
        const slugs = await res.json();

        // Fetch each app's manifest in parallel
        const apps = await Promise.all(
            slugs.map(async (slug) => {
                try {
                    const r = await fetch(`./apps/${slug}/app.json`);
                    if (!r.ok) return null;
                    const data = await r.json();
                    data.slug = slug;
                    data.path = `./apps/${slug}/`;
                    return data;
                } catch {
                    return null;
                }
            })
        );

        renderApps(grid, apps.filter(Boolean));
    } catch {
        grid.innerHTML =
            '<p class="empty-state">Could not load apps.</p>';
    }
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

        const iconSrc = app.icon ? `./apps/${app.slug}/${app.icon}` : null;
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
