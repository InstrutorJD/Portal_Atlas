const sessionValue = sessionStorage.getItem("simulaEnemSession");

if (!sessionValue) {
	window.location.replace("index.html");
} else {
	const session = JSON.parse(sessionValue);
	document.querySelector("#student-name").textContent = session.name.split(/\s+/)[0];
	document.querySelector("#logout-button").addEventListener("click", () => {
		sessionStorage.removeItem("simulaEnemSession");
		window.location.href = "index.html";
	});
}
