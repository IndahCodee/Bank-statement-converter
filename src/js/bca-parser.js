/**
 * BCA Bank Statement Parser Engine (PDF & TXT)
 * Extracts text from PDF client-side using PDF.js and parses transactions.
 */

const BCAParser = {
    checkNominalPattern(tx) {
        if (!tx) return false;
        let zz = tx.trim();
        if (zz.startsWith("-")) zz = zz.substring(1);
        if (zz.length < 4 || zz.startsWith("0")) return false;

        // Pattern format: 200,856.00 or 4,827,323.97 (Ribuan koma, desimal titik 2 digit)
        return /^\d{1,3}(,\d{3})*\.\d{2}$/.test(zz);
    },

    /**
     * Ekstraksi teks dari ArrayBuffer PDF BCA menggunakan PDF.js
     */
    async extractTextFromPDF(arrayBuffer) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error("Library PDF.js belum dimuat. Pastikan koneksi internet aktif untuk memuat library.");
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        const pageTexts = [];

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Filter item teks yang valid
            const items = textContent.items.filter(item => item.str && item.str.trim().length > 0);

            const lines = [];
            const yThreshold = 3.5; // Toleransi threshold vertikal baris teks

            // Urutkan item: Y menurun (atas ke bawah), X menaik (kiri ke kanan)
            items.sort((a, b) => {
                const yDiff = b.transform[5] - a.transform[5];
                if (Math.abs(yDiff) > yThreshold) {
                    return yDiff;
                }
                return a.transform[4] - b.transform[4];
            });

            let currentLine = [];
            let currentY = null;

            for (const item of items) {
                const y = item.transform[5];
                if (currentY === null || Math.abs(currentY - y) <= yThreshold) {
                    currentLine.push(item);
                    if (currentY === null) currentY = y;
                } else {
                    currentLine.sort((a, b) => a.transform[4] - b.transform[4]);
                    lines.push(currentLine.map(it => it.str).join(' '));
                    currentLine = [item];
                    currentY = y;
                }
            }

            if (currentLine.length > 0) {
                currentLine.sort((a, b) => a.transform[4] - b.transform[4]);
                lines.push(currentLine.map(it => it.str).join(' '));
            }

            pageTexts.push(`----------------------- Page ${pageNum}-----------------------\n` + lines.join('\n'));
        }

        return pageTexts.join('\n\n');
    },

    /**
     * Parse ArrayBuffer PDF langsung
     */
    async parsePDF(arrayBuffer) {
        const text = await this.extractTextFromPDF(arrayBuffer);
        return this.parse(text);
    },

    /**
     * Parse teks mentah rekening koran BCA
     */
    parse(content) {
        let rawLines = content.split(/\r?\n/);

        // Step 1: Normalisasi Spasi & Filter Metadata Dasar
        let cleanedLines = [];
        let nama = "";
        let noRek = "";
        let year = new Date().getFullYear().toString();
        let periode = "";

        for (let line of rawLines) {
            let trimmed = line.replace(/\s+/g, ' ').trim();
            if (trimmed.length === 0) continue;
            if (trimmed.includes("---- Page")) continue;

            // Metadata Header Extractor
            if (trimmed.includes("NO. REKENING :") || trimmed.includes("NO. REKENING:") || trimmed.includes("NO. REKENING")) {
                const parts = trimmed.split(/NO\.\s*REKENING\s*:?/i);
                if (parts.length > 1) {
                    const candidate = parts[0].trim();
                    if (candidate && !nama) nama = candidate;
                    noRek = parts[1].trim();
                }
            }

            if (trimmed.includes("PERIODE :") || trimmed.includes("PERIODE:") || trimmed.includes("PERIODE")) {
                const parts = trimmed.split(/PERIODE\s*:?/i);
                if (parts.length > 1) {
                    periode = parts[1].trim();
                    const yearMatch = periode.match(/\b(20\d{2})\b/);
                    if (yearMatch) year = yearMatch[1];
                }
            }

            cleanedLines.push(trimmed);
        }

        // Step 2: Hapus Header & Footer Page berulang
        let filteredLines = [];
        let isSkippingHeader = true;

        for (let i = 0; i < cleanedLines.length; i++) {
            let line = cleanedLines[i];

            if (line.includes("TANGGAL KETERANGAN CBG MUTASI SALDO") || (line.includes("TANGGAL") && line.includes("KETERANGAN") && line.includes("MUTASI") && line.includes("SALDO"))) {
                isSkippingHeader = false;
                continue;
            }

            if (line.includes("Bersambung ke halaman berikut") || line.includes("Bersambung ke Halaman berikut")) {
                isSkippingHeader = true;
                continue;
            }

            if (line.includes("SALDO AKHIR :") || line.includes("SALDO AKHIR:")) {
                isSkippingHeader = true;
                continue;
            }

            if (isSkippingHeader) continue;

            // Skip baris SALDO AWAL
            if (line.match(/^\d{2}\/\d{2}\s+SALDO\s+AWAL/i)) {
                continue;
            }

            filteredLines.push(line);
        }

        // Step 3: Multiline Merger & Grouping Transaksi
        let transactionGroups = [];
        let currentTrx = null;

        for (let i = 0; i < filteredLines.length; i++) {
            let line = filteredLines[i];
            let dateMatch = line.match(/^(\d{2}\/\d{2})\s+(.*)$/);

            let isTrxStart = false;
            let dateStr = "";
            let lineBody = line;

            if (dateMatch) {
                dateStr = dateMatch[1];
                lineBody = dateMatch[2].trim();
                let words = lineBody.split(' ');
                let lastWord = words[words.length - 1];

                // Cek apakah word terakhir = DB atau format Nominal
                if (lastWord === "DB" || this.checkNominalPattern(lastWord)) {
                    isTrxStart = true;
                }
            }

            if (isTrxStart) {
                if (currentTrx) transactionGroups.push(currentTrx);
                currentTrx = {
                    rawDate: dateStr,
                    mainLine: lineBody,
                    notes: []
                };
            } else {
                if (currentTrx) {
                    currentTrx.notes.push(line);
                }
            }
        }
        if (currentTrx) transactionGroups.push(currentTrx);

        // Step 4: Parse DB, CR, Keterangan, and Saldo per Transaksi
        let records = [];

        for (let i = 0; i < transactionGroups.length; i++) {
            let group = transactionGroups[i];
            let dateParts = group.rawDate.split('/');
            let day = dateParts[0];
            let month = dateParts[1];
            let isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

            let words = group.mainLine.split(' ');
            let lastWord = words[words.length - 1];
            let secondLastWord = words.length > 1 ? words[words.length - 2] : '';

            let saldo = null;
            let lineForAmount = group.mainLine;

            // Cek apakah ada Saldo di baris yang sama
            if (secondLastWord === "DB" && this.checkNominalPattern(lastWord)) {
                saldo = parseFloat(lastWord.replace(/,/g, ''));
                lineForAmount = group.mainLine.substring(0, group.mainLine.length - lastWord.length).trim();
            } else if (this.checkNominalPattern(secondLastWord) && this.checkNominalPattern(lastWord)) {
                saldo = parseFloat(lastWord.replace(/,/g, ''));
                lineForAmount = group.mainLine.substring(0, group.mainLine.length - lastWord.length).trim();
            }

            // Tentukan Tipe DB / CR
            let wordsAmount = lineForAmount.split(' ');
            let type = 'CR';
            let amount = 0;
            let descMain = '';

            if (lineForAmount.endsWith("DB")) {
                type = 'DB';
                let nominalStr = wordsAmount[wordsAmount.length - 2];
                amount = parseFloat(nominalStr.replace(/,/g, '')) || 0;
                descMain = wordsAmount.slice(0, wordsAmount.length - 2).join(' ');
            } else {
                type = 'CR';
                let nominalStr = wordsAmount[wordsAmount.length - 1];
                amount = parseFloat(nominalStr.replace(/,/g, '')) || 0;
                descMain = wordsAmount.slice(0, wordsAmount.length - 1).join(' ');
            }

            // Gabungkan catatan lanjutan (multiline)
            let fullDescription = descMain;
            if (group.notes.length > 0) {
                fullDescription += " " + group.notes.join(' ');
            }
            fullDescription = fullDescription.replace(/\s+/g, ' ').trim();

            let debet = (type === 'DB') ? amount : 0;
            let credit = (type === 'CR') ? amount : 0;

            records.push({
                no: i + 1,
                date: isoDate,
                rawDate: group.rawDate,
                description: fullDescription,
                debet: debet,
                credit: credit,
                type: type,
                amount: (type === 'CR') ? amount : -amount,
                printedSaldo: saldo,
                calculatedSaldo: 0
            });
        }

        // Step 5: Rekonstruksi Saldo & Integrity Check
        let integrityIssues = 0;
        for (let i = 0; i < records.length; i++) {
            let rec = records[i];
            if (i === 0) {
                rec.calculatedSaldo = rec.printedSaldo !== null ? rec.printedSaldo : (rec.credit - rec.debet);
            } else {
                let prevSaldo = records[i - 1].calculatedSaldo;
                rec.calculatedSaldo = rec.printedSaldo !== null ? rec.printedSaldo : (prevSaldo - rec.debet + rec.credit);

                // Verifikasi konsistensi saldo jika ada printed saldo
                if (rec.printedSaldo !== null) {
                    let expectedSaldo = prevSaldo - rec.debet + rec.credit;
                    if (Math.abs(rec.printedSaldo - expectedSaldo) > 2) {
                        integrityIssues++;
                    }
                }
            }
        }

        return {
            nama: nama,
            noRek: noRek,
            year: year,
            periode: periode,
            records: records,
            integrityIssues: integrityIssues
        };
    }
};

window.BCAParser = BCAParser;
