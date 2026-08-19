/**
 * Mandiri CSV Statement Parser & Converter
 */

const MandiriParser = {
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
            throw new Error("File CSV tidak memiliki baris data yang cukup.");
        }

        const headerLine = lines[0];
        let delimiter = ';';
        if ((headerLine.match(/;/g) || []).length < (headerLine.match(/,/g) || []).length) {
            delimiter = ',';
        }

        const headers = this.parseCSVLine(headerLine, delimiter).map(h => h.toLowerCase().trim());
        let dateIdx = headers.findIndex(h => h.includes('postdate') || h.includes('date') || h.includes('tanggal'));
        let labelIdx = headers.findIndex(h => h.includes('remarks') || h.includes('additionaldesc') || h.includes('keterangan'));
        let creditIdx = headers.findIndex(h => h.includes('credit') || h.includes('kredit'));
        let debitIdx = headers.findIndex(h => h.includes('debit'));

        if (dateIdx === -1) dateIdx = 2;
        if (labelIdx === -1) labelIdx = 3;

        const records = [];

        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVLine(lines[i], delimiter);
            if (row.length < 2) continue;

            const rawDate = row[dateIdx] || '';
            const rawLabel = row[labelIdx] || (row[labelIdx + 1] ? row[labelIdx + 1] : '');

            const formattedDate = this.formatDateOnly(rawDate);
            const trimmedLabel = this.cleanLabel(rawLabel);

            let creditVal = 0;
            let debitVal = 0;

            if (creditIdx !== -1 && row[creditIdx]) creditVal = parseFloat(row[creditIdx].replace(/,/g, '')) || 0;
            if (debitIdx !== -1 && row[debitIdx]) debitVal = parseFloat(row[debitIdx].replace(/,/g, '')) || 0;

            if (creditIdx === -1 && debitIdx === -1) {
                if (row[5]) creditVal = parseFloat(row[5].replace(/,/g, '')) || 0;
                if (row[6]) debitVal = parseFloat(row[6].replace(/,/g, '')) || 0;
            }

            let amount = 0;
            if (creditVal > 0) amount = Math.abs(creditVal);
            else if (debitVal > 0) amount = -Math.abs(debitVal);

            records.push({
                no: records.length + 1,
                date: formattedDate,
                label: trimmedLabel,
                partner: "",
                amount: amount,
                debet: debitVal,
                credit: creditVal
            });
        }

        return {
            records: records
        };
    }
};

window.MandiriParser = MandiriParser;
