/**
 * Main Application Logic for Bank Statement Converter (Mandiri, BCA, BRI, BSI)
 * Supports universal CSV (Mac/DOS/BOM), Mandiri XLSX/CSV, BRI XLSX/CSV, BSI HTML/XLSX, and BCA PDF.
 */

let currentBank = 'mandiri';
let selectedFile = null;
let currentStatementData = null; // { bank, nama, noRek, periode, records: [...] }

document.addEventListener('DOMContentLoaded', () => {
    // Setup Drag and Drop
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFile(e.target.files[0]);
            }
        });
    }

    // Tab Event Listeners
    ['mandiri', 'bca', 'bri', 'bsi'].forEach(bank => {
        const tab = document.getElementById('tab' + bank.toUpperCase());
        if (tab) {
            tab.addEventListener('click', () => switchBank(bank));
        }
    });

    // Action Buttons
    const downloadOdooBtn = document.getElementById('downloadOdooBtn');
    const downloadMutasiBtn = document.getElementById('downloadMutasiBtn');

    if (downloadOdooBtn) downloadOdooBtn.addEventListener('click', downloadOdooStatement);
    if (downloadMutasiBtn) downloadMutasiBtn.addEventListener('click', downloadMutasiTable);
});

window.switchBank = function(bank) {
    currentBank = bank;
    selectedFile = null;
    currentStatementData = null;

    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const uploadLabel = document.getElementById('uploadLabel');
    const uploadSublabel = document.getElementById('uploadSublabel');
    const rulesTitle = document.getElementById('rulesTitle');
    const rulesList = document.getElementById('rulesList');
    const downloadOdooBtn = document.getElementById('downloadOdooBtn');
    const downloadMutasiBtn = document.getElementById('downloadMutasiBtn');

    if (fileInput) fileInput.value = '';
    if (fileNameDisplay) fileNameDisplay.style.display = 'none';
    hideStatus();
    hidePreview();

    // Toggle active tab classes
    ['mandiri', 'bca', 'bri', 'bsi'].forEach(b => {
        const tab = document.getElementById('tab' + b.toUpperCase());
        if (tab) tab.classList.toggle('active', b === bank);
    });

    if (downloadOdooBtn) downloadOdooBtn.disabled = true;
    if (downloadMutasiBtn) downloadMutasiBtn.disabled = true;

    if (bank === 'mandiri') {
        if (fileInput) fileInput.accept = ".csv, .xlsx, .xls";
        if (uploadLabel) uploadLabel.innerText = "Pilih atau Seret File Rekening Koran Mandiri";
        if (uploadSublabel) uploadSublabel.innerText = "Format: .csv / .xlsx / .xls (Kopra / Mandiri Online)";
        if (rulesTitle) rulesTitle.innerText = "Keterangan Format File Bank Mandiri:";
        if (rulesList) {
            rulesList.innerHTML = `
                <li>Mendukung file <code>.csv</code> maupun <code>.xlsx / .xls</code> asli unduhan Kopra / Mandiri Online.</li>
                <li>Kolom otomatis terdeteksi: <code>PostDate/Date</code>, <code>Remarks/Keterangan</code>, <code>Credit</code>, <code>Debit</code>.</li>
                <li>Mendukung ekspor ke <b>Odoo Clean (.xlsx)</b> dan <b>Tabel Mutasi Lengkap (.xlsx)</b>.</li>
            `;
        }
    } else if (bank === 'bca') {
        if (fileInput) fileInput.accept = ".pdf";
        if (uploadLabel) uploadLabel.innerText = "Pilih atau Seret File PDF Rekening Koran BCA";
        if (uploadSublabel) uploadSublabel.innerText = "Format: .pdf (E-Statement Rekening Giro / Tabungan BCA)";
        if (rulesTitle) rulesTitle.innerText = "Keterangan Format File Bank BCA:";
        if (rulesList) {
            rulesList.innerHTML = `
                <li>File input berupa <code>.pdf</code> unduhan e-statement mutasi rekening BCA.</li>
                <li>Mendukung ekstraksi otomatis multiline catatan transfer bertingkat (berita acara/nama pengirim).</li>
                <li>Memisahkan transaksi <b>Debet (DB)</b> vs <b>Credit (CR)</b> dan merekonstruksi saldo berjalan secara presisi.</li>
            `;
        }
    } else if (bank === 'bri') {
        if (fileInput) fileInput.accept = ".csv, .xlsx, .xls";
        if (uploadLabel) uploadLabel.innerText = "Pilih atau Seret File Rekening Koran BRI";
        if (uploadSublabel) uploadSublabel.innerText = "Format: .csv / .xlsx (CMS BRI / QLola / BRImo)";
        if (rulesTitle) rulesTitle.innerText = "Keterangan Format File Bank BRI:";
        if (rulesList) {
            rulesList.innerHTML = `
                <li>Mendukung file <code>.csv</code> maupun <code>.xlsx</code> unduhan mutasi rekening BRI (CMS / QLola / BRImo).</li>
                <li>Mendeteksi kolom: <code>TGL_TRAN</code>, <code>DESK_TRAN / REMARK_CUSTOM</code>, <code>MUTASI_DEBET</code>, <code>MUTASI_KREDIT</code>, <code>SALDO_AKHIR_MUTASI</code>.</li>
                <li>Mendukung ekspor ke <b>Odoo Clean (.xlsx)</b> dan <b>Tabel Mutasi Lengkap (.xlsx)</b>.</li>
            `;
        }
    } else if (bank === 'bsi') {
        if (fileInput) fileInput.accept = ".xlsx, .xls";
        if (uploadLabel) uploadLabel.innerText = "Pilih atau Seret File Excel Rekening Koran BSI";
        if (uploadSublabel) uploadSublabel.innerText = "Format: .xlsx / .xls (BSI Net Banking / CMS Giro Wadiah)";
        if (rulesTitle) rulesTitle.innerText = "Keterangan Format File Bank BSI:";
        if (rulesList) {
            rulesList.innerHTML = `
                <li>Mendukung file <code>.xlsx</code> murni maupun <code>.xls</code> web export dari BSI (Giro Institusi / Tabungan).</li>
                <li>Ekstraksi otomatis header: No. Rekening, Periode, serta kolom <code>Waktu Transaksi</code>, <code>Deskripsi</code>, <code>Debet</code>, <code>Kredit</code>, <code>Saldo Riil</code>.</li>
                <li>Mendukung ekspor ke <b>Odoo Clean (.xlsx)</b> dan <b>Tabel Mutasi Lengkap (.xlsx)</b>.</li>
            `;
        }
    }
};

window.handleFileSelect = function(event) {
    if (event.target.files && event.target.files.length > 0) {
        handleFile(event.target.files[0]);
    }
};

function handleFile(file) {
    selectedFile = file;
    const nameDisplay = document.getElementById('fileNameDisplay');
    if (nameDisplay) {
        nameDisplay.innerText = "📁 " + file.name + ` (${(file.size / 1024).toFixed(1)} KB)`;
        nameDisplay.style.display = 'inline-block';
    }
    hideStatus();
    hidePreview();

    const ext = file.name.toLowerCase().split('.').pop();

    if (currentBank === 'mandiri') {
        if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
            showStatus("Format file tidak sesuai. Untuk Bank Mandiri, mohon gunakan file .csv atau .xlsx / .xls asli dari Kopra / Mandiri Online.", "error");
            return;
        }
        processMandiriFile(file);
    } else if (currentBank === 'bca') {
        if (ext !== 'pdf') {
            showStatus("Format file tidak sesuai. Untuk Bank BCA, mohon gunakan file e-statement digital .pdf asli dari BCA.", "error");
            return;
        }
        processBCAFile(file);
    } else if (currentBank === 'bri') {
        if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
            showStatus("Format file tidak sesuai. Untuk Bank BRI, mohon gunakan file .csv atau .xlsx dari CMS BRI / QLola / BRImo.", "error");
            return;
        }
        processBRIFile(file);
    } else if (currentBank === 'bsi') {
        if (ext !== 'xlsx' && ext !== 'xls') {
            showStatus("Format file tidak sesuai. Untuk Bank BSI, mohon gunakan file e-statement .xlsx atau .xls dari BSI Net Banking.", "error");
            return;
        }
        processBSIFile(file);
    }
}

function showStatus(msg, type) {
    const statusBox = document.getElementById('statusBox');
    if (statusBox) {
        statusBox.innerText = msg;
        statusBox.className = 'status-box ' + type;
        statusBox.style.display = 'block';
    }
}

function hideStatus() {
    const statusBox = document.getElementById('statusBox');
    if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.className = 'status-box';
    }
}

function hidePreview() {
    const accountCard = document.getElementById('accountCard');
    const previewSection = document.getElementById('previewSection');
    if (accountCard) accountCard.style.display = 'none';
    if (previewSection) previewSection.style.display = 'none';
}

function updateSuccessState(statementData) {
    currentStatementData = statementData;
    const downloadOdooBtn = document.getElementById('downloadOdooBtn');
    const downloadMutasiBtn = document.getElementById('downloadMutasiBtn');
    const accountCard = document.getElementById('accountCard');

    if (downloadOdooBtn) downloadOdooBtn.disabled = false;
    if (downloadMutasiBtn) downloadMutasiBtn.disabled = false;

    // Tampilkan Card Info
    if (accountCard) {
        document.getElementById('metaBank').innerText = statementData.bank || currentBank.toUpperCase();
        document.getElementById('metaNama').innerText = statementData.nama || "(Tidak tertera di file)";
        document.getElementById('metaNoRek').innerText = statementData.noRek || "(Tidak tertera di file)";
        document.getElementById('metaPeriode').innerText = statementData.periode || "-";

        const metaIntegrity = document.getElementById('metaIntegrity');
        if (metaIntegrity) {
            if (statementData.integrityIssues && statementData.integrityIssues > 0) {
                metaIntegrity.innerText = `Peringatan (${statementData.integrityIssues} selisih saldo)`;
                metaIntegrity.className = 'meta-value warning';
            } else {
                metaIntegrity.innerText = "Valid (100% Cocok)";
                metaIntegrity.className = 'meta-value success';
            }
        }
        accountCard.style.display = 'block';
    }

    renderPreviewTable(statementData.records);
    showStatus(`Berhasil memproses ${statementData.records.length} transaksi (${statementData.bank || currentBank.toUpperCase()}). Siap diunduh.`, "success");
}

// 1. Process Mandiri (CSV / XLSX / XLS)
function processMandiriFile(file) {
    showStatus("Sedang membaca dan memproses mutasi Bank Mandiri...", "info");
    const ext = file.name.toLowerCase().split('.').pop();

    if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const parsed = window.MandiriParser.parseWorkbook(workbook);

                if (!parsed || parsed.records.length === 0) {
                    showStatus("Gagal: Tidak ditemukan transaksi valid pada file Excel Mandiri ini.", "error");
                    return;
                }

                updateSuccessState({
                    bank: "Bank Mandiri",
                    nama: parsed.nama,
                    noRek: parsed.noRek,
                    periode: parsed.periode,
                    records: parsed.records,
                    integrityIssues: 0
                });
            } catch (err) {
                console.error(err);
                showStatus("Gagal memproses file Mandiri: " + err.message, "error");
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const content = evt.target.result;
                const parsed = window.MandiriParser.parse(content);

                if (!parsed || parsed.records.length === 0) {
                    showStatus("Gagal: Tidak ditemukan transaksi valid pada file CSV Mandiri ini.", "error");
                    return;
                }

                updateSuccessState({
                    bank: "Bank Mandiri",
                    nama: parsed.nama,
                    noRek: parsed.noRek,
                    periode: parsed.periode,
                    records: parsed.records,
                    integrityIssues: 0
                });
            } catch (err) {
                console.error(err);
                showStatus("Gagal memproses file Mandiri: " + err.message, "error");
            }
        };
        reader.readAsText(file);
    }
}

// 2. Process BCA (PDF)
function processBCAFile(file) {
    showStatus("Sedang membaca dan memproses mutasi PDF BCA...", "info");
    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const arrayBuffer = evt.target.result;
            const parsed = await window.BCAParser.parsePDF(arrayBuffer);

            if (!parsed || parsed.records.length === 0) {
                showStatus("Gagal: Tidak ditemukan transaksi mutasi pada file PDF BCA ini. Pastikan file bukan hasil scan foto/gambar.", "error");
                return;
            }

            updateSuccessState({
                bank: "Bank BCA",
                nama: parsed.nama,
                noRek: parsed.noRek,
                periode: parsed.periode || parsed.year,
                records: parsed.records,
                integrityIssues: parsed.integrityIssues
            });
        } catch (err) {
            console.error(err);
            showStatus("Terjadi error parsing PDF BCA: " + err.message, "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

// 3. Process BRI (CSV / XLSX)
function processBRIFile(file) {
    showStatus("Sedang membaca dan memproses mutasi Bank BRI...", "info");
    const ext = file.name.toLowerCase().split('.').pop();

    if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const parsed = window.BRIParser.parseWorkbook(workbook);

                if (!parsed || parsed.records.length === 0) {
                    showStatus("Gagal: Tidak ditemukan transaksi valid pada file Excel BRI ini.", "error");
                    return;
                }

                updateSuccessState({
                    bank: "Bank BRI",
                    nama: "",
                    noRek: parsed.noRek,
                    periode: "",
                    records: parsed.records,
                    integrityIssues: 0
                });
            } catch (err) {
                console.error(err);
                showStatus("Gagal memproses file BRI: " + err.message, "error");
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const content = evt.target.result;
                const parsed = window.BRIParser.parse(content);

                if (!parsed || parsed.records.length === 0) {
                    showStatus("Gagal: Tidak ditemukan transaksi valid pada file CSV BRI ini.", "error");
                    return;
                }

                updateSuccessState({
                    bank: "Bank BRI",
                    nama: "",
                    noRek: parsed.noRek,
                    periode: "",
                    records: parsed.records,
                    integrityIssues: 0
                });
            } catch (err) {
                console.error(err);
                showStatus("Gagal memproses file BRI: " + err.message, "error");
            }
        };
        reader.readAsText(file);
    }
}

// 4. Process BSI (HTML .xls / XLSX)
function processBSIFile(file) {
    showStatus("Sedang membaca dan memproses mutasi BSI...", "info");
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const buffer = evt.target.result;
            const data = new Uint8Array(buffer);

            // Deteksi apakah file berupa HTML Table (.xls web export dari BSI) atau Binary Excel
            const textSample = new TextDecoder('utf-8').decode(data.slice(0, 2000));
            let parsed = null;

            if (textSample.includes('<table') || textSample.includes('<tr') || textSample.includes('<html')) {
                const fullText = new TextDecoder('utf-8').decode(data);
                parsed = window.BSIParser.parseHtml(fullText);
            } else {
                const workbook = XLSX.read(data, { type: 'array' });
                parsed = window.BSIParser.parseWorkbook(workbook);
            }

            if (!parsed || parsed.records.length === 0) {
                showStatus("Gagal: Tidak ditemukan transaksi pada file Excel / XLS BSI ini.", "error");
                return;
            }

            updateSuccessState({
                bank: "Bank Syariah Indonesia (BSI)",
                nama: parsed.nama,
                noRek: parsed.noRek,
                periode: parsed.periode,
                records: parsed.records,
                integrityIssues: 0
            });
        } catch (err) {
            console.error(err);
            showStatus("Terjadi error parsing BSI: " + err.message, "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

function renderPreviewTable(records) {
    const previewTableHead = document.getElementById('previewTableHead');
    const previewTableBody = document.getElementById('previewTableBody');
    const previewTitle = document.getElementById('previewTitle');
    const previewCount = document.getElementById('previewCount');
    const previewSection = document.getElementById('previewSection');

    if (previewTableHead) {
        previewTableHead.innerHTML = `
            <th>No</th>
            <th>Tanggal</th>
            <th>Keterangan / Deskripsi</th>
            <th>Debet</th>
            <th>Credit</th>
            <th>Saldo</th>
        `;
    }
    if (previewTableBody) {
        previewTableBody.innerHTML = records.slice(0, 100).map(r => `
            <tr>
                <td>${r.no}</td>
                <td>${r.date}</td>
                <td>${r.description}</td>
                <td style="color: ${r.debet > 0 ? '#fca5a5' : '#6b7280'}">
                    ${r.debet > 0 ? r.debet.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                </td>
                <td style="color: ${r.credit > 0 ? '#6ee7b7' : '#6b7280'}">
                    ${r.credit > 0 ? r.credit.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                </td>
                <td style="font-weight: 600;">
                    ${r.calculatedSaldo > 0 ? r.calculatedSaldo.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                </td>
            </tr>
        `).join('');
    }

    if (previewTitle) previewTitle.innerText = `Preview Transaksi (${currentBank.toUpperCase()})`;
    if (previewCount) previewCount.innerText = `${records.length} transaksi`;
    if (previewSection) previewSection.style.display = 'block';
}

function downloadOdooStatement() {
    if (!currentStatementData || !currentStatementData.records) return;

    const excelRows = [["Date", "Label", "Partner", "Amount"]];
    for (let r of currentStatementData.records) {
        excelRows.push([
            r.date,
            r.description,
            "",
            r.amount
        ]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    XLSX.utils.book_append_sheet(wb, ws, "Bank Statement Lines");

    const baseName = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, "") : `${currentBank}_statement`;
    const outName = `${baseName}_odoo.xlsx`;
    XLSX.writeFile(wb, outName);
    showStatus(`Berhasil mengunduh format Odoo: ${outName}`, "success");
}

function downloadMutasiTable() {
    if (!currentStatementData || !currentStatementData.records) return;

    const excelRows = [
        ["No", "Tanggal", "Keterangan", "Debet", "Credit", "D/C", "Saldo"]
    ];

    for (let r of currentStatementData.records) {
        excelRows.push([
            r.no,
            r.date,
            r.description,
            r.debet,
            r.credit,
            r.type,
            r.calculatedSaldo || ""
        ]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    XLSX.utils.book_append_sheet(wb, ws, "Mutasi Rekening");

    const baseName = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, "") : `${currentBank}_statement`;
    const outName = `${baseName}_mutasi_lengkap.xlsx`;
    XLSX.writeFile(wb, outName);
    showStatus(`Berhasil mengunduh Tabel Mutasi Lengkap: ${outName}`, "success");
}
