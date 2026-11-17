const MINUTES_PER_QUESTION = 4;
const QUESTION_AREAS = [
	"Linguagens",
	"Ciências humanas",
	"Ciências da natureza",
	"Matemática",
];

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
	const durationSelect = document.querySelector("#duration-select");
	const loadStatus = document.querySelector("#load-status");
	const startButton = document.querySelector("#start-exam");
	const answers = new Map();
	let examQuestions = [];
	let currentIndex = 0;
	let remainingSeconds = 0;
	let timerInterval;

	function normalizeText(text) {
		return text.replace(/\s+/g, " ").trim();
	}

	function isExamMetadataLine(line) {
		return /^\s*-{5,}\s*$/.test(line)
			|| /^\s*(?:TEXTO\s+PARA\s+AS?\s+)?QUEST(?:Õ|O)ES\s+DE\b/i.test(line)
			|| /^\s*(?:LINGUAGENS(?:,\s*C[ÓO]DIGOS)?|CI[ÊE]NCIAS\s+HUMANAS|CI[ÊE]NCIAS\s+DA\s+NATUREZA|MATEM[ÁA]TICA)(?:\s+E(?:\s+SUAS)?(?:\s+TECNOLOGIAS)?)?\s*$/i.test(line)
			|| /^\s*(?:E\s+)?SUAS(?:\s+TECNOLOGIAS)?\.?\s*$/i.test(line)
			|| /^\s*(?:OP[CÇ][AÃ]O\s+(?:INGLÊS|ESPANHOL)|DIA\s+\d+|PROVA\s+DIA\s+\d+\b.*)$/i.test(line)
			|| /^\s*TECNOLOGIAS\s*$/i.test(line);
	}

	function areaFromHeading(text, offset, questionNumber) {
		const beforeQuestion = text.slice(0, offset);
		const areaPatterns = [
			{ name: "Linguagens", pattern: /^\s*LINGUAGENS,?\s*C[ÓO]DIGOS\b/gim },
			{ name: "Ciências humanas", pattern: /^\s*CI[ÊE]NCIAS\s+HUMANAS\b/gim },
			{ name: "Ciências da natureza", pattern: /^\s*CI[ÊE]NCIAS\s+DA\s+NATUREZA\b/gim },
			{ name: "Matemática", pattern: /^\s*MATEM[ÁA]TICA\b/gim },
		];
		let latestArea;
		let latestPosition = -1;

		areaPatterns.forEach(({ name, pattern }) => {
			for (const match of beforeQuestion.matchAll(pattern)) {
				if (match.index > latestPosition) {
					latestPosition = match.index;
					latestArea = name;
				}
			}
		});

		if (latestArea) {
			return latestArea;
		}
		if (questionNumber <= 45) return "Linguagens";
		if (questionNumber <= 90) return "Ciências humanas";
		if (questionNumber <= 135) return "Ciências da natureza";
		return "Matemática";
	}

	function parseAnswerKey(text) {
		const answersByNumber = new Map();
		for (const match of text.matchAll(/^\s*(\d{1,3})\s+([A-E])(?:\s+([A-E]))?/gim)) {
			const number = Number(match[1]);
			const answers = answersByNumber.get(number) || [];
			answers.push(...[match[2], match[3]].filter(Boolean).map((answer) => answer.toUpperCase()));
			answersByNumber.set(number, answers);
		}
		return answersByNumber;
	}

	function parseChoices(lines) {
		const candidates = [];
		lines.forEach((line, index) => {
			const match = line.trim().match(/^([A-E])(?:[.)]\s*|\s+)(\S.*)$/);
			if (match) {
				candidates.push({ letter: match[1], text: match[2], index });
			}
		});

		let bestSequence;
		candidates.forEach((candidate, start) => {
			if (candidate.letter !== "A") return;
			const sequence = [candidate];
			let nextLetterIndex = 1;
			for (let index = start + 1; index < candidates.length && nextLetterIndex < 5; index += 1) {
				if (candidates[index].letter === "ABCDE"[nextLetterIndex]) {
					sequence.push(candidates[index]);
					nextLetterIndex += 1;
				}
			}
			if (sequence.length === 5 && (!bestSequence
				|| sequence[4].index - sequence[0].index < bestSequence[4].index - bestSequence[0].index)) {
				bestSequence = sequence;
			}
		});

		if (!bestSequence) return null;
		const choices = bestSequence.map((choice, index) => {
			const end = bestSequence[index + 1]?.index ?? lines.length;
			const continuation = lines.slice(choice.index + 1, end).join(" ");
			return {
				letter: choice.letter,
				text: normalizeText(`${choice.text} ${continuation}`),
			};
		});
		return choices.every((choice) => choice.text)
			? { choices, firstChoiceIndex: bestSequence[0].index }
			: null;
	}

	function parseQuestionFile(text, year, answerKey) {
		const marker = /^\s*(?:QUEST(?:ÃO|AO)\s*0*(\d{1,3})|0*(\d{1,3})\s+QUEST(?:ÃO|AO))\b.*$/gim;
		const headers = [...text.matchAll(marker)];
		const questions = [];
		const seenNumbers = new Set();
		const occurrences = new Map();

		headers.forEach((header, index) => {
			const number = Number(header[1] || header[2]);
			if (!number || seenNumbers.has(number)) return;
			const occurrence = occurrences.get(number) || 0;
			occurrences.set(number, occurrence + 1);
			const start = header.index + header[0].length;
			const end = headers[index + 1]?.index ?? text.length;
			const rawLines = text.slice(start, end).split(/\r?\n/);
			const imageNotice = /\b(?:tem|cont[ée]m|contendo)\s+(?:uma\s+)?imagem|\(\s*(?:in?magem|tem\s+imagem|imagem\s+nas\s+respostas)\b|\bimagem\s+nas\s+respostas\b/i;
			if (imageNotice.test(header[0]) || imageNotice.test(rawLines.join("\n"))) return;
			const lines = rawLines
				.filter((line) => !isExamMetadataLine(line))
				.map((line) => line.replace(/-{5,}=?/g, ""));

			const parsedChoices = parseChoices(lines);
			const possibleAnswers = answerKey.get(number) || [];
			const correctAnswer = possibleAnswers[Math.min(occurrence, possibleAnswers.length - 1)];
			if (!parsedChoices || !correctAnswer
				|| !parsedChoices.choices.some((choice) => choice.letter === correctAnswer)) return;

			const statement = normalizeText(lines.slice(0, parsedChoices.firstChoiceIndex).join(" "));
			if (!statement) return;

			questions.push({
				id: `${year}-${number}`,
				year,
				number,
				area: areaFromHeading(text, header.index, number),
				statement,
				choices: parsedChoices.choices,
				correctAnswer,
				difficulty: "Média",
				complexity: `${statement} ${parsedChoices.choices.map((choice) => choice.text).join(" ")}`.split(/\s+/).length,
			});
			seenNumbers.add(number);
		});

		return questions;
	}

	function classifyDifficulty(questions) {
		const sorted = [...questions].sort((first, second) => first.complexity - second.complexity);
		sorted.forEach((question, index) => {
			const percentile = index / Math.max(sorted.length, 1);
			question.difficulty = percentile < 0.3 ? "Fácil" : percentile < 0.7 ? "Média" : "Difícil";
		});
	}

	async function loadQuestionBank() {
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
			return parseQuestionFile(questionText, year, parseAnswerKey(answerText));
		}));

		files.forEach((questions) => questionBank.push(...questions));
		classifyDifficulty(questionBank);
		if (!questionBank.length) {
			throw new Error("Nenhuma questão sem aviso de imagem e com alternativas e gabarito disponíveis foi encontrada.");
		}
	}

	function selectedPool() {
		const scope = configForm.elements.scope.value;
		return questionBank.filter((question) => scope === "all" || question.area === subjectSelect.value);
	}

	function selectedDurationMinutes() {
		return Number(durationSelect.value);
	}

	function updateEstimate() {
		const duration = selectedDurationMinutes();
		const requestedCount = questionCountForDuration(duration);
		const pool = selectedPool();
		const availableCount = questionBank.length ? pool.length : requestedCount;
		const count = Math.min(requestedCount, availableCount);
		const distribution = balancedQuestionCounts(pool, count);
		const selectedOption = durationSelect.selectedOptions[0];
		document.querySelector("#question-estimate").innerHTML =
			`<strong>${count} questões</strong> <span>·</span> ${selectedOption.textContent}`;
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
			item.className = "area-result-item";
			const heading = document.createElement("span");
			heading.className = "area-result-name";
			heading.textContent = area;
			const score = document.createElement("strong");
			score.textContent = total ? `${percentage}%` : "Sem questões";
			const detail = document.createElement("small");
			detail.textContent = total ? `${correct} de ${total} acertos` : "Esta área não foi incluída";
			item.append(heading, score, detail);
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

	function renderQuestion() {
		const question = examQuestions[currentIndex];
		document.querySelector("#current-number").textContent = currentIndex + 1;
		document.querySelector("#progress-label").textContent = `Questão ${currentIndex + 1} de ${examQuestions.length}`;
		document.querySelector("#difficulty-badge").textContent = `${question.difficulty} estimada`;
		document.querySelector("#difficulty-badge").dataset.difficulty = question.difficulty.toLowerCase();
		document.querySelector("#question-source").textContent =
			`${question.area} · Prova ${question.year} · Questão ${String(question.number).padStart(2, "0")}`;
		document.querySelector("#question-statement").textContent = question.statement;
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
		document.querySelector("#next-question").hidden = currentIndex === examQuestions.length - 1;
	}

	function finishExam() {
		window.clearInterval(timerInterval);
		setupPanel.hidden = true;
		runPanel.hidden = true;
		resultPanel.hidden = false;

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
	}

	function startExam() {
		const pool = selectedPool();
		if (!pool.length) {
			loadStatus.textContent = "Não há questões disponíveis para essa matéria no acervo sem imagens.";
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
		setupPanel.hidden = true;
		runPanel.hidden = false;
		document.querySelector("#run-kicker").textContent = configForm.elements.scope.value === "all"
			? "SIMULADO COMPLETO"
			: `SIMULADO · ${subjectSelect.value.toUpperCase()}`;
		renderQuestion();
		document.querySelector("#timer").textContent = formatTime(remainingSeconds);
		timerInterval = window.setInterval(() => {
			remainingSeconds -= 1;
			document.querySelector("#timer").textContent = formatTime(remainingSeconds);
			if (remainingSeconds <= 0) finishExam();
		}, 1000);
	}

	document.querySelectorAll('input[name="scope"]').forEach((input) => {
		input.addEventListener("change", () => {
			subjectField.hidden = input.value !== "single";
		});
	});
	configForm.addEventListener("change", updateEstimate);
	configForm.addEventListener("submit", (event) => {
		event.preventDefault();
		startExam();
	});
	document.querySelector("#next-question").addEventListener("click", () => {
		if (currentIndex < examQuestions.length - 1) {
			currentIndex += 1;
			renderQuestion();
		}
	});
	document.querySelector("#previous-question").addEventListener("click", () => {
		if (currentIndex > 0) {
			currentIndex -= 1;
			renderQuestion();
		}
	});
	document.querySelector("#finish-exam").addEventListener("click", finishExam);
	updateEstimate();

	loadQuestionBank().then(() => {
		startButton.disabled = false;
		startButton.textContent = "Começar simulado";
		startButton.insertAdjacentHTML("beforeend", ' <span aria-hidden="true">&#8594;</span>');
		loadStatus.textContent = `${questionBank.length} questões disponíveis sem indicação de imagem.`;
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
