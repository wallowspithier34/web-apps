(() => {
    const hourHand = document.getElementById("hour-hand");
    const minuteHand = document.getElementById("minute-hand");
    const secondHand = document.getElementById("second-hand");
    const digitalTime = document.getElementById("digital-time");

    function update() {
        const now = new Date();
        const h = now.getHours() % 12;
        const m = now.getMinutes();
        const s = now.getSeconds();
        const ms = now.getMilliseconds();

        const secondAngle = s * 6;
        const minuteAngle = (m + s / 60) * 6;
        const hourAngle = (h + m / 60) * 30;

        hourHand.setAttribute("transform", `rotate(${hourAngle} 100 100)`);
        minuteHand.setAttribute("transform", `rotate(${minuteAngle} 100 100)`);
        secondHand.setAttribute("transform", `rotate(${secondAngle} 100 100)`);

        digitalTime.textContent = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });

        setTimeout(update, 1000 - ms);
    }

    update();
})();
