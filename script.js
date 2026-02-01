function simulate() {
    const pages = document.getElementById("pages").value.split(" ").map(Number);
    const frames = parseInt(document.getElementById("frames").value);
    const algo = document.getElementById("algorithm").value;

    let memory = [];
    let faults = 0;
    let output = document.getElementById("output");
    output.innerHTML = "";

    pages.forEach((page, i) => {
        let hit = memory.includes(page);

        if (!hit) {
            faults++;
            if (memory.length < frames) {
                memory.push(page);
            } else {
                if (algo === "fifo") {
                    memory.shift();
                }
                else if (algo === "lru") {
                    let past = pages.slice(0, i);
                    let indexes = memory.map(m => {
                        let idx = past.lastIndexOf(m);
                        return idx === -1 ? -1 : idx;
                    });
                    let replace = indexes.indexOf(Math.min(...indexes));
                    memory.splice(replace, 1);
                }
                else if (algo === "optimal") {
                    let future = pages.slice(i + 1);
                    let indexes = memory.map(m => {
                        let idx = future.indexOf(m);
                        return idx === -1 ? Infinity : idx;
                    });
                    let replace = indexes.indexOf(Math.max(...indexes));
                    memory.splice(replace, 1);
                }
                memory.push(page);
            }
        }

        renderStep(page, memory, hit, output);
    });

    document.getElementById("faults").innerText = `Total Page Faults = ${faults}`;
}

function renderStep(page, memory, hit, output) {
    let div = document.createElement("div");
    div.className = "step";

    div.innerHTML = `<b>Page:</b> ${page} → ${hit ? 
        '<span style="color:#2ecc71">HIT</span>' :
        '<span style="color:#ff4d4d">FAULT</span>'}`;

    let framesDiv = document.createElement("div");
    framesDiv.className = "frames";

    memory.forEach(m => {
        let f = document.createElement("div");
        f.className = "frame " + (hit ? "hit" : "fault");
        f.innerText = m;
        framesDiv.appendChild(f);
    });

    div.appendChild(framesDiv);
    output.appendChild(div);
}
