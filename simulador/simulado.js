// QUESTION_AREAS, parseQuestionFile, parseAnswerKey e classifyDifficulty vêm de parser.js.
const MINUTES_PER_QUESTION = 4;
const IMAGE_BASE_PATH = "../assets/imagens/";

function questionCountForDuration(durationMinutes) {
	return Math.floor(durationMinutes / MINUTES_PER_QUESTION);
}

function balancedQuestionCounts(pool, requestedCount) {
	const capacities = new Map(QUESTION_AREAS.map((area) => [
		area,
		pool.filter((question) => question.area === area).length,
	]));
	const counts = new Map(QUESTION_AREAS.map((area) => [area, 0]));
	let remaining = Math.min(Math.max(0, requestedCount), pool.length);

	while (remaining > 0) {
		let assignedInRound = false;
		for (const area of QUESTION_AREAS) {
			if (remaining === 0) break;
			if (counts.get(area) >= capacities.get(area)) continue;
			counts.set(area, counts.get(area) + 1);
			remaining -= 1;
			assignedInRound = true;
		}
		if (!assignedInRound) break;
	}

	return counts;
}

function shuffleQuestions(items) {
	const shuffled = [...items];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const otherIndex = Math.floor(Math.random() * (index + 1));
		[shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
	}
	return shuffled;
}

function selectBalancedQuestions(pool, requestedCount) {
	const counts = balancedQuestionCounts(pool, requestedCount);
	const selected = QUESTION_AREAS.flatMap((area) =>
		shuffleQuestions(pool.filter((question) => question.area === area)).slice(0, counts.get(area)));
	return shuffleQuestions(selected);
}

function calculateAreaResults(questions, answers) {
	return QUESTION_AREAS.map((area) => {
		const areaQuestions = questions.filter((question) => question.area === area);
		const correct = areaQuestions.filter((question) => answers.get(question.id) === question.correctAnswer).length;
		return {
			area,
			total: areaQuestions.length,
			correct,
			percentage: areaQuestions.length ? Math.round((correct / areaQuestions.length) * 100) : null,
		};
	});
}

async function initializeSimulator() {
	const session = await getSessao();
	const profile = session ? await getPerfil() : null;
	if (!session || profile?.tipo !== "aluno") {
		window.location.replace("../portal/index.html");
		return;
	}

	const questionBank = [];
	const questionYears = [2015, 2016, 2017, 2018, 2019, 2020, 2022, 2023, 2024, 2025];
	const setupPanel = document.querySelector("#setup-panel");
	const runPanel = document.querySelector("#run-panel");
	const resultPanel = document.querySelector("#result-panel");
	const configForm = document.querySelector("#exam-config");
	const subjectField = document.querySelector("#subject-field");
	const subjectSelect = document.querySelector("#subject-select");
	const loadStatus = document.querySelector("#load-status");
	const startButton = document.querySelector("#start-exam");
	const answers = new Map();
	let examQuestions = [];
	let examMeta = null;
	let currentIndex = 0;
	let remainingSeconds = 0;
	let timerInterval;

	async function loadImageIndex() {
		try {
			const response = await fetch(IMAGE_BASE_PATH + "indice.json");
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return new Set(await response.json());
		} catch (error) {
			// Sem índice, as questões com imagem ficam de fora, como antes.
			console.warn("Índice de imagens indisponível; questões com imagem serão omitidas.", error);
			return new Set();
		}
	}

	async function loadQuestionBank() {
		const images = await loadImageIndex();
		const files = await Promise.all(questionYears.map(async (year) => {
			const [questionResponse, answerResponse] = await Promise.all([
				fetch(`../dados/provas/prova-${year}`),
				fetch(`../dados/gabaritos/gabarito-${year}`),
			]);
			if (!questionResponse.ok || !answerResponse.ok) {
				throw new Error(`Não foi possível carregar as questões de ${year}.`);
			}
			const [questionText, answerText] = await Promise.all([
				questionResponse.text(),
				answerResponse.text(),
			]);
			return parseQuestionFile(questionText, year, parseAnswerKey(answerText), {
				images,
				imageBasePath: IMAGE_BASE_PATH,
			});
		}));

		files.forEach((questions) => questionBank.push(...questions));
		classifyDifficulty(questionBank);
		if (!questionBank.length) {
			throw new Error("Nenhuma questão com alternativas e gabarito disponíveis foi encontrada.");
		}
	}

	function selectedPool() {
		const scope = configForm.elements.scope.value;
		return questionBank.filter((question) => scope === "all" || question.area === subjectSelect.value);
	}

	function selectedDurationInput() {
		return configForm.querySelector('input[name="duration"]:checked');
	}

	function selectedDurationMinutes() {
		return Number(selectedDurationInput().value);
	}

	function updateEstimate() {
		const duration = selectedDurationMinutes();
		const requestedCount = questionCountForDuration(duration);
		const pool = selectedPool();
		const availableCount = questionBank.length ? pool.length : requestedCount;
		const count = Math.min(requestedCount, availableCount);
		const distribution = balancedQuestionCounts(pool, count);
		document.querySelector("#question-estimate").innerHTML =
			`<strong>${count} questões</strong> <span>·</span> ${selectedDurationInput().dataset.label}`;
		document.querySelector("#question-distribution").textContent = questionBank.length
			? QUESTION_AREAS
				.filter((area) => distribution.get(area) > 0)
				.map((area) => `${area}: ${distribution.get(area)}`)
				.join(" · ")
			: "Distribuindo questões entre as quatro áreas...";
	}

	function formatTime(seconds) {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const remaining = seconds % 60;
		return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
	}

	function renderAreaRadar(areaResults) {
		const chart = document.querySelector("#area-radar");
		const svgNamespace = "http://www.w3.org/2000/svg";
		const center = { x: 210, y: 180 };
		const radius = 108;
		const angles = [-90, 0, 90, 180];
		const pointsAt = (scale) => angles.map((angle) => {
			const radians = (angle * Math.PI) / 180;
			return {
				x: center.x + Math.cos(radians) * radius * scale,
				y: center.y + Math.sin(radians) * radius * scale,
			};
		});
		const element = (name, attributes, text) => {
			const node = document.createElementNS(svgNamespace, name);
			Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
			if (text) node.textContent = text;
			return node;
		};

		chart.replaceChildren();
		chart.setAttribute("aria-label", `Aproveitamento por área. ${areaResults.map(({ area, total, percentage }) =>
			`${area}: ${total ? `${percentage}%` : "sem questões"}`).join("; ")}.`);
		[0.2, 0.4, 0.6, 0.8, 1].forEach((scale) => {
			chart.append(element("polygon", {
				points: pointsAt(scale).map(({ x, y }) => `${x},${y}`).join(" "),
				class: "radar-grid",
			}));
		});
		pointsAt(1).forEach(({ x, y }) => {
			chart.append(element("line", {
				x1: center.x,
				y1: center.y,
				x2: x,
				y2: y,
				class: "radar-axis",
			}));
		});

		const dataPoints = areaResults.map((result, index) => {
			const angle = (angles[index] * Math.PI) / 180;
			const value = result.percentage ?? 0;
			return {
				x: center.x + Math.cos(angle) * radius * (value / 100),
				y: center.y + Math.sin(angle) * radius * (value / 100),
			};
		});
		chart.append(element("polygon", {
			points: dataPoints.map(({ x, y }) => `${x},${y}`).join(" "),
			class: "radar-result",
		}));
		dataPoints.forEach(({ x, y }, index) => {
			if (areaResults[index].percentage === null) return;
			chart.append(element("circle", {
				cx: x,
				cy: y,
				r: 4,
				class: "radar-point",
			}));
		});

		const labels = [
			{ text: "Linguagens", x: 210, y: 35, anchor: "middle" },
			{ text: "Humanas", x: 345, y: 184, anchor: "start" },
			{ text: "Natureza", x: 210, y: 335, anchor: "middle" },
			{ text: "Matemática", x: 75, y: 184, anchor: "end" },
		];
		labels.forEach(({ text, x, y, anchor }) => {
			chart.append(element("text", { x, y, "text-anchor": anchor, class: "radar-label" }, text));
		});

		document.querySelector("#area-results").replaceChildren(...areaResults.map(({ area, total, correct, percentage }) => {
			const item = document.createElement("li");
			const button = document.createElement("button");
			button.type = "button";
			button.className = "area-result-item";
			button.dataset.area = area;
			button.disabled = !total;
			button.setAttribute("aria-pressed", "false");
			button.setAttribute("aria-controls", "area-review");
			const heading = document.createElement("span");
			heading.className = "area-result-name";
			heading.textContent = area;
			const score = document.createElement("strong");
			score.textContent = total ? `${percentage}%` : "Sem questões";
			const detail = document.createElement("small");
			if (total) {
				const { wrong, blank } = reviewCounts(area);
				const misses = [wrong && `${wrong} errada${wrong > 1 ? "s" : ""}`, blank && `${blank} em branco`].filter(Boolean);
				detail.textContent = `${correct} de ${total} acertos${misses.length ? ` · ${misses.join(" · ")}` : ""}`;
				const action = document.createElement("span");
				action.className = "area-result-action";
				action.setAttribute("aria-hidden", "true");
				action.textContent = "Ver questões →";
				button.append(heading, score, detail, action);
				button.addEventListener("click", () => openAreaReview(area));
			} else {
				detail.textContent = "Esta área não foi incluída";
				button.append(heading, score, detail);
			}
			item.append(button);
			return item;
		}));

		const includedAreas = areaResults.filter(({ total }) => total > 0);
		const insights = document.querySelector("#area-insights");
		if (!includedAreas.length) {
			insights.textContent = "Não há questões por área para analisar neste simulado.";
			return;
		}
		const best = Math.max(...includedAreas.map(({ percentage }) => percentage));
		const needsWork = Math.min(...includedAreas.map(({ percentage }) => percentage));
		const strongestAreas = includedAreas.filter(({ percentage }) => percentage === best).map(({ area }) => area);
		const areasToReview = includedAreas.filter(({ percentage }) => percentage === needsWork).map(({ area }) => area);
		if (includedAreas.length === 1) {
			insights.textContent = `${strongestAreas[0]}: ${best}% de aproveitamento. Faça um simulado com todas as áreas para comparar seu desempenho.`;
			return;
		}
		insights.textContent = `Seu melhor resultado: ${strongestAreas.join(", ")} (${best}%). Para estudar mais: ${areasToReview.join(", ")} (${needsWork}%).`;
	}

	// Enunciado (texto, texto-base compartilhado e imagem) como nós DOM.
	function statementNodes(question) {
		return question.statementBlocks.map((block) => {
			if (block.type === "image") {
				const figure = document.createElement("figure");
				figure.className = "question-figure";
				const image = document.createElement("img");
				image.src = block.src;
				image.alt = `Imagem da questão ${question.number} da prova ${question.year}`;
				image.loading = "lazy";
				image.decoding = "async";
				figure.append(image);
				return figure;
			}
			const paragraph = document.createElement("p");
			if (block.shared) paragraph.className = "question-shared-text";
			paragraph.textContent = block.text;
			return paragraph;
		});
	}

	function renderQuestion() {
		const question = examQuestions[currentIndex];
		document.querySelector("#current-number").textContent = currentIndex + 1;
		document.querySelector("#progress-label").textContent = `Questão ${currentIndex + 1} de ${examQuestions.length}`;
		document.querySelector("#difficulty-badge").textContent = `${question.difficulty} estimada`;
		document.querySelector("#difficulty-badge").dataset.difficulty = question.difficulty.toLowerCase();
		document.querySelector("#question-source").textContent =
			`${question.area} · Prova ${question.year} · Questão ${String(question.number).padStart(2, "0")}`;
		document.querySelector("#question-statement").replaceChildren(...statementNodes(question));
		document.querySelector("#answer-options").replaceChildren(...question.choices.map((choice) => {
			const label = document.createElement("label");
			label.className = "answer-option";
			const input = document.createElement("input");
			input.type = "radio";
			input.name = "answer";
			input.value = choice.letter;
			input.checked = answers.get(question.id) === choice.letter;
			input.addEventListener("change", () => answers.set(question.id, choice.letter));
			const letter = document.createElement("span");
			letter.className = "answer-letter";
			letter.textContent = choice.letter;
			const text = document.createElement("span");
			text.className = "answer-text";
			text.textContent = choice.text;
			label.append(input, letter, text);
			return label;
		}));
		document.querySelector("#previous-question").disabled = currentIndex === 0;
		// Na última questão o botão de avançar vira "Finalizar simulado".
		const isLastQuestion = currentIndex === examQuestions.length - 1;
		const nextButton = document.querySelector("#next-question");
		nextButton.replaceChildren(isLastQuestion ? "Finalizar simulado " : "Próxima questão ");
		const arrow = document.createElement("span");
		arrow.setAttribute("aria-hidden", "true");
		arrow.textContent = "→";
		nextButton.append(arrow);
	}

	// =============================================
	// REVISÃO POR ÁREA (tela de resultado)
	// =============================================

	const REVIEW_FILTERS = [
		{ id: "wrong", label: "Erradas", empty: "Você não errou nenhuma questão respondida nesta área." },
		{ id: "blank", label: "Em branco", empty: "Você respondeu todas as questões desta área." },
		{ id: "all", label: "Todas", empty: "Não há questões desta área no simulado." },
	];
	const STATUS_LABELS = { correct: "Certa", wrong: "Errada", blank: "Em branco" };
	let reviewState = { area: null, filter: "wrong" };

	function questionStatus(question) {
		const answer = answers.get(question.id);
		if (!answer) return "blank";
		return answer === question.correctAnswer ? "correct" : "wrong";
	}

	function reviewCounts(area) {
		const areaQuestions = examQuestions.filter((question) => question.area === area);
		const count = (status) => areaQuestions.filter((question) => questionStatus(question) === status).length;
		return { wrong: count("wrong"), blank: count("blank"), all: areaQuestions.length };
	}

	function openAreaReview(area) {
		const counts = reviewCounts(area);
		// Abre em "Erradas"; se não houver erros, mostra as em branco; senão, todas.
		const filter = counts.wrong ? "wrong" : counts.blank ? "blank" : "all";
		reviewState = { area, filter };
		renderAreaReview();
		const review = document.querySelector("#area-review");
		review.scrollIntoView({ behavior: "smooth", block: "start" });
		document.querySelector("#area-review-heading").focus({ preventScroll: true });
	}

	function closeAreaReview() {
		const previousArea = reviewState.area;
		reviewState = { area: null, filter: "wrong" };
		document.querySelector("#area-review").hidden = true;
		document.querySelectorAll(".area-result-item").forEach((button) => button.setAttribute("aria-pressed", "false"));
		document.querySelector(`.area-result-item[data-area="${previousArea}"]`)?.focus();
	}

	function renderAreaReview() {
		const { area, filter } = reviewState;
		const review = document.querySelector("#area-review");
		review.hidden = false;
		document.querySelectorAll(".area-result-item").forEach((button) => {
			button.setAttribute("aria-pressed", String(button.dataset.area === area));
		});

		const heading = document.querySelector("#area-review-heading");
		heading.textContent = `Questões de ${area}`;
		heading.tabIndex = -1;

		const counts = reviewCounts(area);
		document.querySelector("#review-filters").replaceChildren(...REVIEW_FILTERS.map(({ id, label }) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "review-filter";
			button.setAttribute("aria-pressed", String(id === filter));
			button.textContent = `${label} (${counts[id]})`;
			button.addEventListener("click", () => {
				reviewState.filter = id;
				renderAreaReview();
			});
			return button;
		}));

		const items = examQuestions
			.map((question, index) => ({ question, position: index + 1, status: questionStatus(question) }))
			.filter(({ question, status }) => question.area === area && (filter === "all" || status === filter));

		const empty = document.querySelector("#review-empty");
		empty.hidden = items.length > 0;
		empty.textContent = REVIEW_FILTERS.find(({ id }) => id === filter).empty;
		document.querySelector("#review-list").replaceChildren(...items.map(reviewItem));
	}

	function reviewItem({ question, position, status }) {
		const answer = answers.get(question.id);
		const item = document.createElement("li");
		item.className = "review-item";
		item.dataset.status = status;

		const details = document.createElement("details");
		const summary = document.createElement("summary");
		const title = document.createElement("span");
		title.className = "review-item-title";
		title.textContent = `Questão ${position} do simulado`;
		const source = document.createElement("span");
		source.className = "review-item-source";
		source.textContent = `Prova ${question.year} · Questão ${String(question.number).padStart(2, "0")}${question.language ? ` (${question.language})` : ""}`;
		const badge = document.createElement("span");
		badge.className = "review-status";
		badge.textContent = STATUS_LABELS[status];
		const answerLine = document.createElement("span");
		answerLine.className = "review-item-answer";
		answerLine.textContent = `Sua resposta: ${answer || "—"} · Correta: ${question.correctAnswer}`;
		summary.append(title, badge, source, answerLine);

		const body = document.createElement("div");
		body.className = "review-item-body";
		const statement = document.createElement("div");
		statement.className = "question-statement review-statement";
		statement.append(...statementNodes(question));
		const choices = document.createElement("ul");
		choices.className = "review-choices";
		choices.setAttribute("aria-label", "Alternativas");
		choices.append(...question.choices.map((choice) => {
			const row = document.createElement("li");
			row.className = "review-choice";
			const isCorrect = choice.letter === question.correctAnswer;
			const isChosen = choice.letter === answer;
			if (isCorrect) row.dataset.mark = "correct";
			else if (isChosen) row.dataset.mark = "wrong";
			const letter = document.createElement("span");
			letter.className = "answer-letter";
			letter.textContent = choice.letter;
			const text = document.createElement("span");
			text.className = "review-choice-text";
			text.textContent = choice.text;
			row.append(letter, text);
			const tags = [isChosen && "Sua resposta", isCorrect && "Resposta correta"].filter(Boolean);
			if (tags.length) {
				const tag = document.createElement("span");
				tag.className = "review-choice-tag";
				tag.textContent = tags.join(" · ");
				row.append(tag);
			}
			return row;
		}));
		body.append(statement, choices);
		details.append(summary, body);
		item.append(details);
		return item;
	}

	document.querySelector("#area-review-close").addEventListener("click", closeAreaReview);

	// =============================================
	// PENALIDADE POR SAIR DA TELA DA PROVA
	// 1ª saída: advertência. 2ª saída: a prova é encerrada.
	// "Sair" = o mouse deixar a página por mais de LEAVE_GRACE_MS, ou a janela
	// perder o foco / a aba ficar oculta (troca de aba, Alt+Tab, celular).
	// Uma saída só é contada de novo depois que o aluno volta à página.
	// =============================================

	const MAX_VIOLATIONS = 2;
	const LEAVE_GRACE_MS = 400;
	const examWarning = document.querySelector("#exam-warning");
	const examWarningButton = document.querySelector("#exam-warning-ok");
	let examRunning = false;
	let violations = 0;
	let endedByPenalty = false;
	let isOutside = false;
	let leaveTimer = null;
	// Entrar/sair da tela cheia pode disparar mouseout/blur na transição: ignora por um instante.
	const FULLSCREEN_SETTLE_MS = 1000;
	let ignoreExitsUntil = 0;

	function fullscreenElement() {
		return document.fullscreenElement || document.webkitFullscreenElement || null;
	}

	function enterFullscreen() {
		const root = document.documentElement;
		const request = root.requestFullscreen || root.webkitRequestFullscreen;
		if (!request || fullscreenElement()) return;
		ignoreExitsUntil = Date.now() + FULLSCREEN_SETTLE_MS;
		try {
			// Navegadores sem suporte (ex.: Safari no iPhone) ou que recusem seguem sem tela cheia.
			Promise.resolve(request.call(root)).catch(() => {});
		} catch {
			// idem
		}
	}

	function exitFullscreen() {
		if (!fullscreenElement()) return;
		const exit = document.exitFullscreen || document.webkitExitFullscreen;
		try {
			Promise.resolve(exit?.call(document)).catch(() => {});
		} catch {
			// já saiu
		}
	}

	function resetPenalties() {
		violations = 0;
		endedByPenalty = false;
		isOutside = false;
		window.clearTimeout(leaveTimer);
		examWarning.hidden = true;
		document.querySelector("#penalty-badge").hidden = true;
	}

	function registerExit() {
		window.clearTimeout(leaveTimer);
		// Enquanto a advertência está aberta, o aluno precisa confirmar antes de nova contagem.
		if (!examRunning || isOutside || !examWarning.hidden || Date.now() < ignoreExitsUntil) return;
		isOutside = true;
		violations += 1;
		if (violations >= MAX_VIOLATIONS) {
			endedByPenalty = true;
			finishExam("penalidade");
			return;
		}
		const badge = document.querySelector("#penalty-badge");
		badge.textContent = `${violations} advertência${violations > 1 ? "s" : ""}`;
		badge.hidden = false;
		examWarning.hidden = false;
		examWarningButton.focus();
	}

	function registerReturn() {
		window.clearTimeout(leaveTimer);
		isOutside = false;
	}

	// Mouse saindo da página: mouseout sem elemento de destino = o ponteiro deixou a janela.
	document.addEventListener("mouseout", (event) => {
		if (!examRunning || event.relatedTarget) return;
		// Passar para a barra de rolagem também dispara mouseout sem destino; não conta como saída.
		const root = document.documentElement;
		const onVerticalScrollbar = event.clientX >= root.clientWidth && event.clientX < window.innerWidth;
		const onHorizontalScrollbar = event.clientY >= root.clientHeight && event.clientY < window.innerHeight;
		if (onVerticalScrollbar || onHorizontalScrollbar) return;
		window.clearTimeout(leaveTimer);
		leaveTimer = window.setTimeout(registerExit, LEAVE_GRACE_MS);
	});
	document.addEventListener("mouseover", () => {
		if (examRunning && document.hasFocus()) registerReturn();
		else window.clearTimeout(leaveTimer);
	});
	window.addEventListener("blur", () => {
		if (examRunning) registerExit();
	});
	window.addEventListener("focus", registerReturn);
	document.addEventListener("visibilitychange", () => {
		if (!examRunning) return;
		if (document.hidden) registerExit();
		else registerReturn();
	});
	// Fechar a tela cheia (Esc, F11) durante a prova também conta como sair da tela.
	const onFullscreenChange = () => {
		if (examRunning && !fullscreenElement()) registerExit();
	};
	document.addEventListener("fullscreenchange", onFullscreenChange);
	document.addEventListener("webkitfullscreenchange", onFullscreenChange);

	examWarningButton.addEventListener("click", () => {
		examWarning.hidden = true;
		registerReturn();
		enterFullscreen(); // volta para a tela cheia (o clique permite)
		document.querySelector("#answer-options input:checked, #answer-options input")?.focus({ preventScroll: true });
	});

	// motivo: "manual" (aluno encerrou), "tempo" (relógio zerou) ou "penalidade" (2ª saída da tela).
	function finishExam(motivo = "manual") {
		if (!examRunning) return; // evita encerrar (e salvar) duas vezes
		window.clearInterval(timerInterval);
		examRunning = false;
		finishDialog.hidden = true;
		window.clearTimeout(leaveTimer);
		examWarning.hidden = true;
		exitFullscreen();
		const penalty = document.querySelector("#result-penalty");
		penalty.hidden = !violations;
		penalty.dataset.ended = String(endedByPenalty);
		penalty.textContent = endedByPenalty
			? "Prova encerrada automaticamente: você saiu da tela da prova pela segunda vez. As questões não respondidas até aquele momento foram contadas como em branco."
			: "Você recebeu 1 advertência por sair da tela da prova durante o simulado.";
		setupPanel.hidden = true;
		runPanel.hidden = true;
		resultPanel.hidden = false;
		reviewState = { area: null, filter: "wrong" };
		document.querySelector("#area-review").hidden = true;

		const areaResults = calculateAreaResults(examQuestions, answers);
		renderAreaRadar(areaResults);
		const correct = examQuestions.filter((question) => answers.get(question.id) === question.correctAnswer).length;
		const answered = answers.size;
		const total = examQuestions.length;

		document.querySelector("#result-summary").textContent =
			`${correct} acertos de ${total} questões · ${answered} respondidas · ${total - answered} em branco.`;
		document.querySelector("#result-breakdown").innerHTML = `
			<div><span>Acertos</span><strong>${correct}</strong></div>
			<div><span>Erros</span><strong>${answered - correct}</strong></div>
			<div><span>Em branco</span><strong>${total - answered}</strong></div>
		`;
		document.querySelector("#result-note").textContent =
			"Este resultado considera apenas o número de acertos e não representa uma nota TRI oficial do ENEM.";

		saveResult({
			id: newResultId(),
			criadoEm: new Date().toISOString(),
			modalidade: examMeta.modalidade,
			escopo: examMeta.escopo,
			duracaoMin: examMeta.duracaoMin,
			tempoGastoSeg: Math.max(0, examMeta.totalSeconds - Math.max(0, remainingSeconds)),
			total,
			acertos: correct,
			erros: answered - correct,
			emBranco: total - answered,
			advertencias: violations,
			motivo,
			porArea: areaResults.filter((result) => result.total)
				.map(({ area, total: areaTotal, correct: areaCorrect }) => ({ area, total: areaTotal, acertos: areaCorrect })),
			respostas: examQuestions.map((question) => ({
				questao: question.id,
				resposta: answers.get(question.id) || null,
				correta: question.correctAnswer,
			})),
		});
	}

	// =============================================
	// CONFIRMAÇÃO AO ENCERRAR COM QUESTÕES EM BRANCO
	// =============================================

	const finishDialog = document.querySelector("#finish-dialog");
	const finishDialogConfirm = document.querySelector("#finish-dialog-confirm");
	const finishDialogBack = document.querySelector("#finish-dialog-back");

	function blankQuestionIndexes() {
		return examQuestions.map((question, index) => (answers.has(question.id) ? -1 : index)).filter((index) => index >= 0);
	}

	// Usado pelo botão "Encerrar simulado" e por "Finalizar simulado" na última questão.
	function requestFinish() {
		if (!examRunning) return;
		const blanks = blankQuestionIndexes();
		if (!blanks.length) {
			finishExam("manual");
			return;
		}
		const count = blanks.length;
		document.querySelector("#finish-dialog-title").textContent =
			count === 1 ? "Há 1 questão em branco" : `Há ${count} questões em branco`;
		const positions = blanks.slice(0, 8).map((index) => index + 1).join(", ") + (count > 8 ? "…" : "");
		document.querySelector("#finish-dialog-text").textContent =
			`${count === 1 ? "A questão" : "As questões"} ${positions} ${count === 1 ? "será considerada" : "serão consideradas"} em branco e não ${count === 1 ? "conta" : "contam"} como acerto. Deseja encerrar mesmo assim?`;
		finishDialogBack.textContent = `Ir para a questão ${blanks[0] + 1}`;
		finishDialogBack.dataset.target = String(blanks[0]);
		finishDialog.hidden = false;
		finishDialogBack.focus();
	}

	function closeFinishDialog() {
		finishDialog.hidden = true;
	}

	finishDialogConfirm.addEventListener("click", () => finishExam("manual"));
	finishDialogBack.addEventListener("click", () => {
		closeFinishDialog();
		currentIndex = Number(finishDialogBack.dataset.target) || 0;
		renderQuestion();
		document.querySelector("#answer-options input")?.focus({ preventScroll: true });
	});
	finishDialog.addEventListener("keydown", (event) => {
		if (event.key === "Escape") closeFinishDialog();
	});
	finishDialog.addEventListener("click", (event) => {
		if (event.target === finishDialog) closeFinishDialog();
	});

	// =============================================
	// HISTÓRICO: salva cada resultado neste navegador e, com Supabase, na conta do aluno
	// =============================================

	const HISTORY_LIMIT = 50;
	const historyKey = `portal_atlas_simulados:${profile?.id || session?.user?.email || "aluno"}`;

	function newResultId() {
		if (window.crypto?.randomUUID) return window.crypto.randomUUID();
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
			const random = Math.floor(Math.random() * 16);
			return (char === "x" ? random : (random % 4) + 8).toString(16);
		});
	}

	function readLocalHistory() {
		try {
			const stored = JSON.parse(localStorage.getItem(historyKey));
			return Array.isArray(stored) ? stored : [];
		} catch {
			return [];
		}
	}

	function writeLocalHistory(history) {
		try {
			localStorage.setItem(historyKey, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
			return true;
		} catch {
			return false; // armazenamento cheio, bloqueado ou navegação privada
		}
	}

	async function saveResult(result) {
		const notice = document.querySelector("#result-saved");
		const savedLocally = writeLocalHistory([result, ...readLocalHistory()]);
		let savedRemotely = false;
		let remoteFailed = false;
		if (typeof window.salvarResultadoSimulado === "function") {
			try {
				savedRemotely = Boolean(await window.salvarResultadoSimulado(result));
			} catch (error) {
				remoteFailed = true;
				console.error("Não foi possível salvar o resultado no Supabase:", error);
			}
		}
		notice.dataset.state = savedRemotely || savedLocally ? "ok" : "error";
		if (savedRemotely) notice.textContent = "Resultado salvo na sua conta.";
		else if (savedLocally) {
			notice.textContent = remoteFailed
				? "Resultado salvo neste navegador. Não foi possível enviá-lo à sua conta agora."
				: "Resultado salvo neste navegador.";
		} else notice.textContent = "Não foi possível salvar este resultado. Anote seu desempenho antes de sair da página.";
		notice.hidden = false;
		renderHistory();
	}

	async function loadHistory() {
		const local = readLocalHistory();
		let remote = null;
		if (typeof window.listarResultadosSimulado === "function") {
			try {
				remote = await window.listarResultadosSimulado(HISTORY_LIMIT);
			} catch (error) {
				console.error("Não foi possível carregar o histórico do Supabase:", error);
			}
		}
		const byId = new Map([...(remote || []), ...local].map((result) => [result.id, result]));
		const history = [...byId.values()].sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
		return { history, fromAccount: Array.isArray(remote) };
	}

	function formatDateTime(iso) {
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return "";
		return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
	}

	function formatDuration(seconds) {
		if (seconds < 60) return "menos de 1 min";
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return hours ? `${hours}h${String(minutes).padStart(2, "0")}` : `${minutes} min`;
	}

	async function renderHistory() {
		const { history, fromAccount } = await loadHistory();
		const section = document.querySelector("#exam-history");
		section.hidden = !history.length;
		if (!history.length) return;
		document.querySelector("#exam-history-source").textContent = fromAccount
			? "Seus últimos simulados, salvos na sua conta."
			: "Seus últimos simulados, salvos neste navegador.";
		const reasons = { tempo: "Tempo esgotado", penalidade: "Encerrado por sair da tela" };
		document.querySelector("#exam-history-list").replaceChildren(...history.slice(0, 10).map((result) => {
			const item = document.createElement("li");
			item.className = "exam-history-item";
			if (result.motivo === "penalidade") item.dataset.penalty = "true";
			const title = document.createElement("strong");
			title.textContent = `${result.modalidade} · ${result.escopo}`;
			const score = document.createElement("span");
			score.className = "exam-history-score";
			const percent = result.total ? Math.round((result.acertos / result.total) * 100) : 0;
			score.textContent = `${result.acertos}/${result.total} acertos (${percent}%)`;
			const meta = document.createElement("small");
			meta.textContent = [
				formatDateTime(result.criadoEm),
				`${formatDuration(result.tempoGastoSeg || 0)} de prova`,
				result.emBranco ? `${result.emBranco} em branco` : "",
				reasons[result.motivo] || "",
			].filter(Boolean).join(" · ");
			item.append(title, score, meta);
			return item;
		}));
	}

	function startExam() {
		const pool = selectedPool();
		if (!pool.length) {
			loadStatus.textContent = "Não há questões disponíveis para essa matéria no acervo.";
			loadStatus.hidden = false;
			return;
		}

		const requestedCount = questionCountForDuration(selectedDurationMinutes());
		const actualCount = Math.min(requestedCount, pool.length);
		examQuestions = selectBalancedQuestions(pool, actualCount);
		if (actualCount < requestedCount) {
			remainingSeconds = actualCount * MINUTES_PER_QUESTION * 60;
		} else {
			remainingSeconds = selectedDurationMinutes() * 60;
		}
		currentIndex = 0;
		answers.clear(); // respostas de uma prova anterior não podem contar nesta
		examMeta = {
			modalidade: selectedDurationInput().dataset.mode,
			escopo: configForm.elements.scope.value === "all" ? "Todas as matérias" : subjectSelect.value,
			duracaoMin: Math.round(remainingSeconds / 60),
			totalSeconds: remainingSeconds,
		};
		setupPanel.hidden = true;
		runPanel.hidden = false;
		resetPenalties();
		examRunning = true;
		// Ex.: "TREINO RÁPIDO · TODAS AS MATÉRIAS", "PRÁTICA REAL · MATEMÁTICA".
		document.querySelector("#run-kicker").textContent = `${examMeta.modalidade} · ${examMeta.escopo}`.toUpperCase();
		renderQuestion();
		document.querySelector("#timer").textContent = formatTime(remainingSeconds);
		timerInterval = window.setInterval(() => {
			remainingSeconds -= 1;
			document.querySelector("#timer").textContent = formatTime(remainingSeconds);
			if (remainingSeconds <= 0) finishExam("tempo");
		}, 1000);
	}

	document.querySelectorAll('input[name="scope"]').forEach((input) => {
		input.addEventListener("change", () => {
			subjectField.hidden = input.value !== "single";
		});
	});
	configForm.addEventListener("change", updateEstimate);
	// Modal de confirmação antes de iniciar; ao confirmar, a prova entra em tela cheia.
	const startDialog = document.querySelector("#start-dialog");
	const startDialogConfirm = document.querySelector("#start-dialog-confirm");

	function closeStartDialog() {
		startDialog.hidden = true;
		startButton.focus();
	}

	configForm.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!selectedPool().length) {
			startExam(); // mostra a mensagem de "sem questões" sem abrir o modal
			return;
		}
		startDialog.hidden = false;
		startDialogConfirm.focus();
	});
	document.querySelector("#start-dialog-cancel").addEventListener("click", closeStartDialog);
	startDialog.addEventListener("click", (event) => {
		if (event.target === startDialog) closeStartDialog();
	});
	startDialog.addEventListener("keydown", (event) => {
		if (event.key === "Escape") closeStartDialog();
	});
	startDialogConfirm.addEventListener("click", () => {
		startDialog.hidden = true;
		enterFullscreen(); // precisa acontecer dentro do clique (gesto do usuário)
		startExam();
	});
	document.querySelector("#next-question").addEventListener("click", () => {
		if (currentIndex < examQuestions.length - 1) {
			currentIndex += 1;
			renderQuestion();
		} else {
			requestFinish();
		}
	});
	document.querySelector("#previous-question").addEventListener("click", () => {
		if (currentIndex > 0) {
			currentIndex -= 1;
			renderQuestion();
		}
	});
	document.querySelector("#finish-exam").addEventListener("click", requestFinish);
	updateEstimate();
	renderHistory();

	loadQuestionBank().then(() => {
		startButton.disabled = false;
		startButton.textContent = "Começar simulado";
		startButton.insertAdjacentHTML("beforeend", ' <span aria-hidden="true">&#8594;</span>');
		const withImage = questionBank.filter((question) => question.image).length;
		loadStatus.textContent = `${questionBank.length} questões disponíveis (${withImage} com imagem).`;
		loadStatus.hidden = false;
		updateEstimate();
	}).catch((error) => {
		loadStatus.textContent = `Não foi possível carregar o banco de questões: ${error.message}`;
		loadStatus.hidden = false;
		startButton.textContent = "Questões indisponíveis";
	});
}

initializeSimulator().catch((error) => {
	console.error("Erro ao validar o acesso ao simulado:", error);
	const loadStatus = document.querySelector("#load-status");
	loadStatus.textContent = "Não foi possível validar sua sessão do Portal Atlas. Volte ao portal e entre novamente.";
	loadStatus.hidden = false;
	document.querySelector("#start-exam").disabled = true;
});
