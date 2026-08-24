const { PDFDocument } = PDFLib;

const fileInput = document.getElementById("fileInput");
const dropArea = document.getElementById("dropArea");
const fileList = document.getElementById("fileList");
const addButton = document.getElementById("addButton");
const clearButton = document.getElementById("clearButton");
const generateButton = document.getElementById("generateButton");
const qualitySelect = document.getElementById("quality");

const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const status = document.getElementById("status");

let files = [];
let draggedIndex = null;

const allowedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
];

function isPdf(file) {
    return file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
}

function isImage(file) {
    return file.type.startsWith("image/") ||
        allowedImageTypes.includes(file.type);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function addFiles(newFiles) {
    const validFiles = Array.from(newFiles).filter(file => {
        return isPdf(file) || isImage(file);
    });

    files.push(...validFiles);
    renderFiles();
}

function renderFiles() {
    fileList.innerHTML = "";

    if (!files.length) {
        fileList.innerHTML = `
        <div class="empty">
          Nenhum arquivo selecionado.
        </div>
      `;
        return;
    }

    files.forEach((file, index) => {
        const item = document.createElement("div");
        item.className = "file-item";
        item.draggable = true;
        item.dataset.index = index;

        const icon = isPdf(file) ? "📕" : "🖼️";
        const type = isPdf(file) ? "PDF" : "Imagem";

        item.innerHTML = `
        <div class="number">${index + 1}</div>
        <div class="hamburger">
            <hr>
            <hr>
            <hr>
        </div>
        <div class="file-icon">${icon}</div>

        <div class="file-info">
          <div class="file-name" title="${escapeHtml(file.name)}">
            ${escapeHtml(file.name)}
          </div>
          <div class="file-type">
            ${type} • ${formatSize(file.size)}
          </div>
        </div>

        <button class="remove" title="Remover">×</button>
      `;

        item.querySelector(".remove").addEventListener("click", (event) => {
            event.stopPropagation();
            files.splice(index, 1);
            renderFiles();
        });

        item.addEventListener("dragstart", () => {
            draggedIndex = index;
            item.style.opacity = "0.5";
        });

        item.addEventListener("dragend", () => {
            draggedIndex = null;
            item.style.opacity = "1";
        });

        item.addEventListener("dragover", (event) => {
            event.preventDefault();
        });

        item.addEventListener("drop", (event) => {
            event.preventDefault();

            const targetIndex = index;

            if (
                draggedIndex === null ||
                draggedIndex === targetIndex
            ) return;

            const movedFile = files.splice(draggedIndex, 1)[0];
            files.splice(targetIndex, 0, movedFile);

            renderFiles();
        });

        fileList.appendChild(item);
    });
}

function escapeHtml(text) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setProgress(value, message) {
    progressWrap.style.display = "block";
    progressBar.style.width = value + "%";
    status.textContent = message;
}

function hideProgress() {
    setTimeout(() => {
        progressWrap.style.display = "none";
        progressBar.style.width = "0%";
    }, 1500);
}

async function imageToJpegBytes(file, quality) {
    const bitmap = await createImageBitmap(file);

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext("2d", {
        alpha: false
    });

    // Fundo branco para imagens PNG/WebP com transparência.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(bitmap, 0, 0);

    bitmap.close();

    const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) {
        throw new Error("Não foi possível converter a imagem.");
    }

    return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height
    };
}

async function addImagePage(pdfDoc, file, quality) {
    const imageData = await imageToJpegBytes(file, quality);

    const image = await pdfDoc.embedJpg(imageData.bytes);

    // 96 DPI:
    // 1 pixel = 72 / 96 pontos.
    // Assim a página fica proporcional ao tamanho da imagem.
    const PT_PER_PIXEL = 72 / 96;

    const width = imageData.width * PT_PER_PIXEL;
    const height = imageData.height * PT_PER_PIXEL;

    const page = pdfDoc.addPage([width, height]);

    page.drawImage(image, {
        x: 0,
        y: 0,
        width,
        height
    });
}

async function addPdfPages(outputPdf, file) {
    const bytes = await file.arrayBuffer();

    const sourcePdf = await PDFDocument.load(bytes, {
        ignoreEncryption: true
    });

    const pages = await outputPdf.copyPages(
        sourcePdf,
        sourcePdf.getPageIndices()
    );

    for (const page of pages) {
        outputPdf.addPage(page);
    }
}

async function generatePdf() {
    if (!files.length) {
        alert("Selecione pelo menos uma imagem ou PDF.");
        return;
    }

    generateButton.disabled = true;
    addButton.disabled = true;

    try {
        const outputPdf = await PDFDocument.create();

        const quality = Number(qualitySelect.value);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            setProgress(
                Math.round((i / files.length) * 100),
                `Processando ${i + 1} de ${files.length}: ${file.name}`
            );

            if (isPdf(file)) {
                await addPdfPages(outputPdf, file);
            } else if (isImage(file)) {
                await addImagePage(outputPdf, file, quality);
            }

            // Permite ao navegador atualizar a interface entre arquivos.
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        setProgress(95, "Finalizando PDF...");

        const pdfBytes = await outputPdf.save({
            useObjectStreams: true
        });

        const blob = new Blob([pdfBytes], {
            type: "application/pdf"
        });

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = "arquivos-juntos.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        setProgress(100, "PDF gerado com sucesso!");

        hideProgress();

    } catch (error) {
        console.error(error);

        alert(
            "Não foi possível gerar o PDF.\n\n" +
            "Detalhes: " +
            (error.message || error)
        );

        status.textContent = "Erro ao gerar o PDF.";
    } finally {
        generateButton.disabled = false;
        addButton.disabled = false;
    }
}

addButton.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);

    // Permite selecionar novamente o mesmo arquivo.
    fileInput.value = "";
});

clearButton.addEventListener("click", () => {
    files = [];
    renderFiles();
});

generateButton.addEventListener("click", generatePdf);

dropArea.addEventListener("dragover", event => {
    event.preventDefault();
    dropArea.classList.add("dragover");
});

dropArea.addEventListener("dragleave", () => {
    dropArea.classList.remove("dragover");
});

dropArea.addEventListener("drop", event => {
    event.preventDefault();
    dropArea.classList.remove("dragover");

    addFiles(event.dataTransfer.files);
});

renderFiles();


/////////////////////////////////
////////TOGGLE DARK MODE/////////
/////////////////////////////////

const themeToggleBtn = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const themeText = document.getElementById('themeText');

  // 1. Verifica se o usuário já salvou uma preferência anterior ou prefere escuro no sistema
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    document.documentElement.classList.add('dark');
    updateToggleUI(true);
  } else {
    document.documentElement.classList.remove('dark');
    updateToggleUI(false);
  }

  // 2. Evento de clique para alternar o tema
  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    
    // Salva a escolha no navegador
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Atualiza ícone e texto
    updateToggleUI(isDark);
  });

  // Função auxiliar para mudar o texto/ícone do botão
  function updateToggleUI(isDark) {
    if (isDark) {
      themeIcon.textContent = '☀️';
      themeText.textContent = 'Modo Claro';
    } else {
      themeIcon.textContent = '🌙';
      themeText.textContent = 'Modo Escuro';
    }
  }