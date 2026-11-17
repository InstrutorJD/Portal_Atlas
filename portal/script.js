const modeButtons = document.querySelectorAll("[data-mode]");
const loginForm = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");
const signupPassword = document.querySelector("#signup-password");
const confirmPassword = document.querySelector("#signup-confirm-password");
const testUser = {
	name: "Estudante de demonstração",
	email: "teste@simulaenem.com",
	password: "enem2026",
};

function setMode(mode) {
	const isLogin = mode === "login";

	loginForm.hidden = !isLogin;
	signupForm.hidden = isLogin;
	document.querySelector("#form-heading").innerHTML = isLogin
		? "A sua preparação<br>continua <span>daqui.</span>"
		: "Seu próximo passo<br>começa <span>agora.</span>";
	document.querySelector(".form-kicker").textContent = isLogin
		? "BOM TER VOCÊ POR AQUI"
		: "VAMOS COMEÇAR?";

	modeButtons.forEach((button) => {
		const isActive = button.dataset.mode === mode;
		button.classList.toggle("is-active", isActive);
		button.setAttribute("aria-pressed", String(isActive));
	});
}

modeButtons.forEach((button) => {
	button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("[data-password]").forEach((button) => {
	button.addEventListener("click", () => {
		const input = document.getElementById(button.dataset.password);
		const shouldShow = input.type === "password";
		input.type = shouldShow ? "text" : "password";
		button.textContent = shouldShow ? "Ocultar" : "Mostrar";
		button.setAttribute("aria-label", `${shouldShow ? "Ocultar" : "Mostrar"} senha`);
	});
});

function updatePasswordValidity() {
	confirmPassword.setCustomValidity(
		confirmPassword.value && confirmPassword.value !== signupPassword.value
			? "As senhas não coincidem."
			: "",
	);
}

signupPassword.addEventListener("input", updatePasswordValidity);
confirmPassword.addEventListener("input", updatePasswordValidity);

loginForm.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!loginForm.reportValidity()) {
		return;
	}

	const status = document.querySelector("#login-status");
	const email = loginForm.elements.email.value.trim().toLowerCase();
	const password = loginForm.elements.password.value;

	if (email !== testUser.email || password !== testUser.password) {
		status.textContent = "E-mail ou senha incorretos. Use as credenciais de demonstração exibidas nesta tela.";
		status.hidden = false;
		return;
	}

	sessionStorage.setItem("simulaEnemSession", JSON.stringify({
		name: testUser.name,
		email: testUser.email,
	}));
	window.location.href = "inicio.html";
});

signupForm.addEventListener("submit", (event) => {
	event.preventDefault();
	updatePasswordValidity();

	if (!signupForm.reportValidity()) {
		return;
	}

	const status = document.querySelector("#signup-status");
	status.textContent = "Dados validados. Para criar sua conta, conecte este formulário a um serviço de autenticação.";
	status.hidden = false;
});

loginForm.addEventListener("input", () => {
	document.querySelector("#login-status").hidden = true;
});

signupForm.addEventListener("input", () => {
	document.querySelector("#signup-status").hidden = true;
});
