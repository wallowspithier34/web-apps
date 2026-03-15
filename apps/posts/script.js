(() => {
    // DOM refs
    const listView = document.getElementById("list-view");
    const readerView = document.getElementById("reader-view");
    const postList = document.getElementById("post-list");
    const readerBody = document.getElementById("reader-body");
    const btnRefresh = document.getElementById("btn-refresh");
    const btnBack = document.getElementById("btn-back");
    const btnDark = document.getElementById("btn-dark");
    const btnDarkList = document.getElementById("btn-dark-list");
    const btnFontUp = document.getElementById("btn-font-up");
    const btnFontDown = document.getElementById("btn-font-down");
    const fontSelect = document.getElementById("font-select");
    const composeView = document.getElementById("compose-view");
    const composeTa = document.getElementById("compose-textarea");
    const btnCreate = document.getElementById("btn-create");
    const btnComposeCancel = document.getElementById("btn-compose-cancel");
    const btnComposeSave = document.getElementById("btn-compose-save");

    // Settings
    const MAX_POSTS = 50;
    const FONT_MIN = 14;
    const FONT_MAX = 28;
    const FONT_STEP = 2;

    // State
    let posts = [];
    let currentSlug = null;
    let darkMode = localStorage.getItem("posts-dark") === "true";
    let fontSize = parseInt(localStorage.getItem("posts-font-size")) || 18;
    let fontFamily = localStorage.getItem("posts-font") || "";

    // ---------- Local Posts ----------

    function getLocalPosts() {
        try { return JSON.parse(localStorage.getItem("posts-local") || "[]"); }
        catch { return []; }
    }

    function saveLocalPosts(arr) {
        localStorage.setItem("posts-local", JSON.stringify(arr));
    }

    // Extract title from first # heading, fallback to "Untitled"
    function extractTitle(md) {
        var m = md.match(/^#\s+(.+)/m);
        return m ? m[1].trim() : "Untitled";
    }

    // Extract description from first plain-text paragraph line
    function extractDescription(md) {
        var lines = md.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || /^#{1,6}\s/.test(line)) continue;
            if (/^(```|>\s|[-*]\s|\d+\.\s|---$|\*\*\*$|___$)/.test(line)) continue;
            var clean = line.replace(/[*_`\[\]()#!]/g, "");
            return clean.length > 120 ? clean.slice(0, 120) + "…" : clean;
        }
        return "";
    }

    function todayISO() {
        var d = new Date();
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    }

    function deleteLocalPost(slug) {
        saveLocalPosts(getLocalPosts().filter(function (p) { return p.slug !== slug; }));
    }

    // ---------- List ----------

    async function loadPosts(forceRefresh) {
        // Fetch remote posts; on failure use empty array so local posts still show
        try {
            var opts = forceRefresh ? { cache: "reload" } : {};
            var res = await fetch("./posts/index.json", opts);
            if (!res.ok) throw new Error(res.status);
            posts = (await res.json()).slice(0, MAX_POSTS);
        } catch {
            posts = [];
        }
        // Merge local posts and sort by date descending
        posts = posts.concat(getLocalPosts()).sort(function (a, b) {
            return b.date.localeCompare(a.date);
        });
        renderList();
    }

    function renderList() {
        postList.innerHTML = "";
        if (posts.length === 0) {
            postList.innerHTML = '<p class="empty-state">No posts yet.</p>';
            return;
        }
        posts.forEach(function (p) {
            var isLocal = p.slug.startsWith("local-");
            var card = document.createElement("div");
            card.className = "post-card";
            card.setAttribute("role", "link");
            card.setAttribute("tabindex", "0");
            card.innerHTML =
                '<div class="post-card-title">' + esc(p.title) + "</div>" +
                '<div class="post-card-meta">' +
                    '<span class="post-card-date">' + esc(p.date) + "</span>" +
                    (isLocal ? '<span class="post-card-badge">Local</span>' : "") +
                    '<span class="post-card-desc">' + esc(p.description || "") + "</span>" +
                "</div>";
            // Delete button for local posts
            if (isLocal) {
                var del = document.createElement("button");
                del.className = "post-card-delete";
                del.textContent = "\u00d7";
                del.setAttribute("aria-label", "Delete post");
                del.addEventListener("click", function (e) {
                    e.stopPropagation();
                    if (confirm("Delete this local post?")) {
                        deleteLocalPost(p.slug);
                        loadPosts();
                    }
                });
                card.appendChild(del);
            }
            card.addEventListener("click", function () { openPost(p.slug); });
            card.addEventListener("keydown", function (e) {
                if (e.key === "Enter") openPost(p.slug);
            });
            postList.appendChild(card);
        });
    }

    // ---------- Reader ----------

    async function openPost(slug) {
        currentSlug = slug;
        if (location.hash !== "#" + slug) {
            history.pushState(null, "", "#" + slug);
        }
        listView.classList.add("hidden");
        readerView.classList.remove("hidden");
        applyPreferences();

        // Local posts are read from localStorage; remote posts are fetched
        if (slug.startsWith("local-")) {
            var found = getLocalPosts().find(function (p) { return p.slug === slug; });
            readerBody.innerHTML = found
                ? renderMarkdown(found.body)
                : '<p class="empty-state">Post not found.</p>';
        } else {
            readerBody.innerHTML = '<p class="empty-state">Loading&hellip;</p>';
            try {
                var res = await fetch("./posts/" + slug + ".md");
                if (!res.ok) throw new Error(res.status);
                var md = await res.text();
                readerBody.innerHTML = renderMarkdown(md);
            } catch {
                readerBody.innerHTML = '<p class="empty-state">Could not load post.</p>';
            }
        }
        window.scrollTo(0, 0);
    }

    function closePost() {
        currentSlug = null;
        readerView.classList.add("hidden");
        listView.classList.remove("hidden");
        if (location.hash) {
            history.pushState(null, "", location.pathname);
        }
    }

    // ---------- Preferences ----------

    function applyPreferences() {
        document.body.classList.toggle("dark", darkMode);
        readerView.style.setProperty("--reader-font-size", fontSize + "px");
        if (fontFamily) {
            readerBody.style.fontFamily = fontFamily;
        } else {
            readerBody.style.fontFamily = "";
        }
        fontSelect.value = fontFamily;
    }

    function toggleDark() {
        darkMode = !darkMode;
        localStorage.setItem("posts-dark", darkMode);
        applyPreferences();
    }

    function changeFontSize(delta) {
        fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, fontSize + delta));
        localStorage.setItem("posts-font-size", fontSize);
        applyPreferences();
    }

    // ---------- Compose ----------

    function openCompose() {
        composeTa.value = "";
        listView.classList.add("hidden");
        composeView.classList.remove("hidden");
        composeTa.focus();
    }

    function closeCompose() {
        composeView.classList.add("hidden");
        listView.classList.remove("hidden");
    }

    function saveCompose() {
        var md = composeTa.value.trim();
        if (!md) return;
        var post = {
            slug: "local-" + Date.now(),
            title: extractTitle(md),
            date: todayISO(),
            description: extractDescription(md),
            body: md
        };
        var local = getLocalPosts();
        local.push(post);
        saveLocalPosts(local);
        closeCompose();
        loadPosts();
    }

    // ---------- Navigation ----------

    window.addEventListener("popstate", function () {
        var slug = location.hash.slice(1);
        if (slug) {
            openPost(slug);
        } else {
            closePost();
        }
    });

    // ---------- Events ----------

    btnRefresh.addEventListener("click", async function () {
        btnRefresh.disabled = true;
        btnRefresh.textContent = "…";
        await loadPosts(true);
        btnRefresh.textContent = "✓";
        setTimeout(function () {
            btnRefresh.textContent = "↻";
            btnRefresh.disabled = false;
        }, 800);
    });
    btnCreate.addEventListener("click", openCompose);
    btnComposeCancel.addEventListener("click", closeCompose);
    btnComposeSave.addEventListener("click", saveCompose);
    btnBack.addEventListener("click", function () { history.back(); });
    btnDark.addEventListener("click", toggleDark);
    btnDarkList.addEventListener("click", toggleDark);
    btnFontUp.addEventListener("click", function () { changeFontSize(FONT_STEP); });
    btnFontDown.addEventListener("click", function () { changeFontSize(-FONT_STEP); });
    fontSelect.addEventListener("change", function () {
        fontFamily = fontSelect.value;
        localStorage.setItem("posts-font", fontFamily);
        applyPreferences();
    });

    // ---------- Helpers ----------

    function esc(s) {
        var d = document.createElement("div");
        d.textContent = s;
        return d.innerHTML;
    }

    // ---------- Init ----------

    // Apply dark mode immediately on load
    document.body.classList.toggle("dark", darkMode);

    loadPosts();
    var initialSlug = location.hash.slice(1);
    if (initialSlug) openPost(initialSlug);
})();
