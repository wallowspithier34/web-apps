(() => {
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const highScoreEl = document.getElementById("high-score");
    const overlay = document.getElementById("overlay");
    const overlayText = document.getElementById("overlay-text");

    const GRID = 20;
    const TICK_MS = 120;
    const STORAGE_KEY = "snake-high-score";

    let cols, rows, cellSize;
    let snake, dir, nextDir, food, score, highScore, running, gameOver, loopId;

    highScore = parseInt(localStorage.getItem(STORAGE_KEY)) || 0;
    highScoreEl.textContent = highScore;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const size = Math.floor(rect.width * devicePixelRatio);
        canvas.width = size;
        canvas.height = size;
        cols = GRID;
        rows = GRID;
        cellSize = size / GRID;
    }

    function init() {
        resize();
        const cx = Math.floor(cols / 2);
        const cy = Math.floor(rows / 2);
        snake = [
            { x: cx, y: cy },
            { x: cx - 1, y: cy },
            { x: cx - 2, y: cy },
        ];
        dir = { x: 1, y: 0 };
        nextDir = { x: 1, y: 0 };
        score = 0;
        scoreEl.textContent = 0;
        gameOver = false;
        placeFood();
        draw();
    }

    function placeFood() {
        const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
        let pos;
        do {
            pos = {
                x: Math.floor(Math.random() * cols),
                y: Math.floor(Math.random() * rows),
            };
        } while (occupied.has(`${pos.x},${pos.y}`));
        food = pos;
    }

    function tick() {
        dir = nextDir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

        // Wall collision
        if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows) {
            return endGame();
        }

        // Self collision
        for (const seg of snake) {
            if (seg.x === head.x && seg.y === head.y) return endGame();
        }

        snake.unshift(head);

        if (head.x === food.x && head.y === food.y) {
            score++;
            scoreEl.textContent = score;
            if (score > highScore) {
                highScore = score;
                highScoreEl.textContent = highScore;
                localStorage.setItem(STORAGE_KEY, highScore);
            }
            placeFood();
        } else {
            snake.pop();
        }

        draw();
    }

    function draw() {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Food
        const fx = food.x * cellSize + cellSize / 2;
        const fy = food.y * cellSize + cellSize / 2;
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(fx, fy, cellSize * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Snake
        snake.forEach((seg, i) => {
            const x = seg.x * cellSize;
            const y = seg.y * cellSize;
            const pad = cellSize * 0.08;
            const r = cellSize * 0.2;
            ctx.fillStyle = i === 0 ? "#16a34a" : "#22c55e";
            ctx.beginPath();
            ctx.roundRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, r);
            ctx.fill();
        });
    }

    function endGame() {
        gameOver = true;
        running = false;
        clearInterval(loopId);
        overlayText.textContent = `Game over — ${score} pts. Tap to play again`;
        overlay.classList.remove("hidden");
    }

    function start() {
        if (running) return;
        init();
        overlay.classList.add("hidden");
        running = true;
        loopId = setInterval(tick, TICK_MS);
    }

    function setDirection(dx, dy) {
        // Prevent reversing
        if (dir.x === -dx && dir.y === -dy) return;
        nextDir = { x: dx, y: dy };
    }

    // Keyboard
    document.addEventListener("keydown", (e) => {
        if (!running && !e.repeat) {
            start();
            return;
        }
        switch (e.key) {
            case "ArrowUp":
            case "w":
                e.preventDefault();
                setDirection(0, -1);
                break;
            case "ArrowDown":
            case "s":
                e.preventDefault();
                setDirection(0, 1);
                break;
            case "ArrowLeft":
            case "a":
                e.preventDefault();
                setDirection(-1, 0);
                break;
            case "ArrowRight":
            case "d":
                e.preventDefault();
                setDirection(1, 0);
                break;
        }
    });

    // Touch controls (d-pad buttons)
    document.querySelectorAll(".controls button").forEach((btn) => {
        btn.addEventListener("click", () => {
            if (!running && gameOver) {
                start();
                return;
            }
            if (!running) {
                start();
            }
            const d = btn.dataset.dir;
            if (d === "up") setDirection(0, -1);
            if (d === "down") setDirection(0, 1);
            if (d === "left") setDirection(-1, 0);
            if (d === "right") setDirection(1, 0);
        });
    });

    // Overlay tap to start
    overlayText.addEventListener("click", start);

    // Swipe support
    let touchStart = null;
    canvas.addEventListener("touchstart", (e) => {
        if (!running && !gameOver) {
            start();
            return;
        }
        if (!running && gameOver) {
            start();
            return;
        }
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    });

    canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener("touchend", (e) => {
        if (!touchStart) return;
        const dx = e.changedTouches[0].clientX - touchStart.x;
        const dy = e.changedTouches[0].clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dx) > Math.abs(dy)) {
            setDirection(dx > 0 ? 1 : -1, 0);
        } else {
            setDirection(0, dy > 0 ? 1 : -1);
        }
    });

    // Handle resize
    window.addEventListener("resize", () => {
        resize();
        draw();
    });

    init();
})();
