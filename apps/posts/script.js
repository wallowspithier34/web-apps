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

    // ---------- List ----------

    async function loadPosts(forceRefresh) {
        try {
            var opts = forceRefresh ? { cache: "reload" } : {};
            var res = await fetch("./posts/index.json", opts);
            if (!res.ok) throw new Error(res.status);
            posts = (await res.json()).slice(0, MAX_POSTS);
            renderList();
        } catch {
            postList.innerHTML = '<p class="empty-state">Could not load posts.</p>';
        }
    }

    function renderList() {
        postList.innerHTML = "";
        if (posts.length === 0) {
            postList.innerHTML = '<p class="empty-state">No posts yet.</p>';
            return;
        }
        posts.forEach(function (p) {
            var card = document.createElement("div");
            card.className = "post-card";
            card.setAttribute("role", "link");
            card.setAttribute("tabindex", "0");
            card.innerHTML =
                '<div class="post-card-title">' + esc(p.title) + "</div>" +
                '<div class="post-card-meta">' +
                    '<span class="post-card-date">' + esc(p.date) + "</span>" +
                    '<span class="post-card-desc">' + esc(p.description || "") + "</span>" +
                "</div>";
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
        // Push hash so back button works
        if (location.hash !== "#" + slug) {
            history.pushState(null, "", "#" + slug);
        }
        listView.classList.add("hidden");
        readerView.classList.remove("hidden");
        applyPreferences();

        readerBody.innerHTML = '<p class="empty-state">Loading&hellip;</p>';
        try {
            var res = await fetch("./posts/" + slug + ".md");
            if (!res.ok) throw new Error(res.status);
            var md = await res.text();
            readerBody.innerHTML = renderMarkdown(md);
        } catch {
            readerBody.innerHTML = '<p class="empty-state">Could not load post.</p>';
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
