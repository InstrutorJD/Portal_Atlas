const sessionValue = sessionStorage.getItem("simulaEnemSession");

if (!sessionValue) {
	window.location.replace("index.html");
} else {
	const session = JSON.parse(sessionValue);
	const attempts = [
		{ date: "24 out. 2026", score: 711, correct: "138 / 180", duration: "5h12", latest: true },
		{ date: "10 out. 2026", score: 684, correct: "129 / 180", duration: "5h05" },
		{ date: "26 set. 2026", score: 662, correct: "124 / 180", duration: "5h18" },
		{ date: "20 set. 2026", score: 641, correct: "119 / 180", duration: "4h56" },
		{ date: "06 set. 2026", score: 623, correct: "114 / 180", duration: "5h09" },
	];
	const areas = [
		{ name: "Linguagens", score: 682, color: "#376b4a" },
		{ name: "Ciências humanas", score: 704, color: "#398786" },
		{ name: "Ciências da natureza", score: 615, color: "#d9894b" },
		{ name: "Matemática", score: 735, color: "#c09b42" },
		{ name: "Redação", score: 820, color: "#cc7468" },
	];

	document.querySelector("#student-name").textContent = session.name.split(/\s+/)[0];
	document.querySelector("#student-email").textContent = session.email;
	document.querySelector("#area-chart").innerHTML = areas.map((area) => `
		<div class="area-row">
			<span class="area-name">${area.name}</span>
			<span class="area-track"><span style="--score: ${area.score / 10}%; --bar-color: ${area.color}"></span></span>
			<strong class="area-value">${area.score}</strong>
		</div>
	`).join("");

	const historyRows = document.querySelector("#history-rows");
	attempts.forEach((attempt, index) => {
		const row = document.createElement("tr");
		row.innerHTML = `
			<td><span class="test-name">Simulado ENEM completo</span>${attempt.latest ? '<span class="latest-label">Mais recente</span>' : ""}</td>
			<td>${attempt.date}</td>
			<td><strong class="table-score">${attempt.score}</strong></td>
			<td>${attempt.correct}</td>
			<td>${attempt.duration}</td>
		`;
		row.style.setProperty("--row-index", index);
		historyRows.append(row);
	});

	document.querySelector("#logout-button").addEventListener("click", () => {
		sessionStorage.removeItem("simulaEnemSession");
		window.location.href = "index.html";
	});
}