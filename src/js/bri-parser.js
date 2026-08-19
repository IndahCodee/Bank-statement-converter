/**
 * BRI CSV Statement Parser & Converter
 */

const BRIParser = {
    parseCSVLine(line, delimiter) {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"' || c === "'") {
                inQuotes = !inQuotes;
            } else if (c === delimiter && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += c;
            }
        }
        result.push(cur);
        return result;
    },

    formatDateOnly(dtStr) {
        if (!dtStr) return '';
        let clean = dtStr.trim();

        // Cth: 01-01-25 4:50 atau 01-01-2025
        const match = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
        if (match) {
            let day = match[1].padStart(2, '0');
            let month = match[2].padStart(2, '0');
            let year = match[3];
            if (year.length === 2) year = '20' + year;
            return `${year}-${month}-${day}`;
        }

        const matchYMD = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (matchYMD) {
            let year = matchYMD[1];
            let month = matchYMD[2].padStart(2, '0');
            let day = matchYMD[3].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        const d = new Date(clean);
        if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
        return clean;
    },

    cleanLabel(rawText) {
        if (!rawText) return '';
        return rawText
            .replace(/^["']|["']$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    parse(csvContent) {
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
            throw new Error("File CSV BRI tidak memiliki baris data yang cukup.");
        }

        const headerLine = lines[0];
        let delimiter = ';';
        if ((headerLine.match(/;/g) || []).length < (headerLine.match(/,/g) || []).length) {
            delimiter = ',';
        }

        const headers = this.parseCSVLine(headerLine, delimiter).map(h => h.toUpperCase().trim());
        
        let noRekIdx = headers.findIndex(h => h.includes('NOREK') || h.includes('NO_REK'));
        let dateIdx = headers.findIndex(h => h.includes('TGL_TRAN') || h.includes('TGL_EFEKTIF') || h.includes('DATE'));
        let descIdx = headers.findIndex(h => h.includes('REMARK_CUSTOM') || h.includes('DESK_TRAN') || h.includes('TRREMK'));
        let debitIdx = headers.findIndex(h => h.includes('MUTASI_DEBET') || h.includes('DEBET') || h.includes('DEBIT'));
        let creditIdx = headers.findIndex(h => h.includes('MUTASI_KREDIT') || h.includes('KREDIT') || h.includes('CREDIT'));
        let saldoIdx = headers.findIndex(h => h.includes('SALDO_AKHIR_MUTASI') || h.includes('SALDO'));

        if (dateIdx === -1) dateIdx = 2;
        if (descIdx === -1) descIdx = 6;

        let detectedNoRek = "";
        const records = [];

        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i], delimiter);
            if (row.length < 3) continue;

            if (!detectedNoRek && noRekIdx !== -1 && row[noRekIdx]) {
                detectedNoRek = row[noRekIdx];
            }

            const rawDate = row[dateIdx] || '';
            
            // Prioritaskan REMARK_CUSTOM jika ada, jika tidak pakai DESK_TRAN
            let rawLabel = '';
            let remarkCustomIdx = headers.indexOf('REMARK_CUSTOM');
            if (remarkCustomIdx !== -1 && row[remarkCustomIdx] && row[remarkCustomIdx].trim()) {
                rawLabel = row[remarkCustomIdx];
            } else if (descIdx !== -1 && row[descIdx]) {
                rawLabel = row[descIdx];
            }

            const formattedDate = this.formatDateOnly(rawDate);
            const trimmedLabel = this.cleanLabel(rawLabel);

            let debitVal = 0;
            let creditVal = 0;
            let saldoVal = 0;

            if (debitIdx !== -1 && row[debitIdx]) {
                debitVal = parseFloat(row[debitIdx].replace(/,/g, '')) || 0;
            }
            if (creditIdx !== -1 && row[creditIdx]) {
                creditVal = parseFloat(row[creditIdx].replace(/,/g, '')) || 0;
            }
            if (saldoIdx !== -1 && row[saldoIdx]) {
                saldoVal = parseFloat(row[saldoIdx].replace(/,/g, '')) || 0;
            }

            let type = creditVal > 0 ? 'CR' : 'DB';
            let amount = creditVal > 0 ? creditVal : -debitVal;

            records.push({
                no: records.length + 1,
                date: formattedDate,
                rawDate: rawDate,
                description: trimmedLabel,
                debet: debitVal,
                credit: creditVal,
                type: type,
                amount: amount,
                calculatedSaldo: saldoVal
            });
        }

        return {
            bank: "BRI",
            noRek: detectedNoRek,
            records: records
        };
    }
};

window.BRIParser = BRIParser;
