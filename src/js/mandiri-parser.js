/**
 * Mandiri Statement Parser & Converter (CSV & XLSX)
 * Supports Kopra Mandiri, Mandiri Online, and custom CSV/XLSX formats.
 */

const MandiriParser = {
    formatDateOnly(dtStr) {
        if (!dtStr) return '';
        let clean = String(dtStr).trim();

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
        return String(rawText)
            .replace(/^["']|["']$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    parseAmount(val) {
        if (val === null || val === undefined || val === '') return 0;
        let str = String(val).trim();
        let isNegative = str.endsWith('-') || str.startsWith('-');
        str = str.replace(/[^\d.]/g, '');
        let num = parseFloat(str) || 0;
        return isNegative ? -Math.abs(num) : Math.abs(num);
    },

    /**
     * Parsing file CSV Mandiri menggunakan Universal CSVUtils
     */
    parse(csvContent) {
        const parsed = (typeof CSVUtils !== 'undefined')
            ? CSVUtils.parse(csvContent)
            : { rows: csvContent.split(/\r?\n/).map(l => l.split(';')) };

        if (!parsed.rows || parsed.rows.length < 2) {
            throw new Error("File CSV Bank Mandiri tidak memiliki baris data yang cukup.");
        }

        return this.parseFromRows(parsed.rows);
    },

    /**
     * Parsing file Excel (.xlsx / .xls) Mandiri
     */
    parseWorkbook(workbook) {
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!rows || rows.length < 2) {
            throw new Error("File Excel Bank Mandiri tidak memiliki baris data yang cukup.");
        }

        return this.parseFromRows(rows);
    },

    /**
     * Core processing logic for 2D array of rows
     */
    parseFromRows(rows) {
        let nama = "";
        let noRek = "";
        let periode = "";

        // Ekstraksi Metadata Header Mandiri (Baris 1-15)
        for (let i = 0; i < Math.min(15, rows.length); i++) {
            let rowText = rows[i].map(c => String(c)).join(' ');
            if (rowText.match(/Account\s*(?:No|Number)\s*[:=]/i) || rowText.match(/No\.?\s*Rekening\s*[:=]/i)) {
                let m = rowText.match(/(?:Account\s*(?:No|Number)|No\.?\s*Rekening)\s*[:=]\s*(\d+)/i);
                if (m) noRek = m[1];
            }
            if (rowText.match(/Account\s*Name\s*[:=]/i) || rowText.match(/Nama\s*Rekening\s*[:=]/i)) {
                let m = rowText.match(/(?:Account\s*Name|Nama\s*Rekening)\s*[:=]\s*([^\n\r,;]+)/i);
                if (m) nama = m[1].trim();
            }
            if (rowText.match(/Period\s*[:=]/i) || rowText.match(/Periode\s*[:=]/i)) {
                let m = rowText.match(/(?:Period|Periode)\s*[:=]\s*([^\n\r,;]+)/i);
                if (m) periode = m[1].trim();
            }
        }

        // Cari Baris Header Tabel
        let headerRowIdx = -1;
        let colIdx = {
            date: -1,
            desc: -1,
            debit: -1,
            credit: -1,
            balance: -1
        };

        for (let i = 0; i < rows.length; i++) {
            let row = rows[i].map(c => String(c).trim().toLowerCase());
            let dateFound = row.findIndex(c => c.includes('postdate') || c.includes('post date') || c.includes('posting date') || c.includes('tgl transaksi') || c.includes('tanggal') || c === 'date');
            let descFound = row.findIndex(c => c.includes('remarks') || c.includes('additionaldesc') || c.includes('keterangan') || c.includes('uraian') || c.includes('description'));

            if (dateFound !== -1 && descFound !== -1) {
                headerRowIdx = i;
                colIdx.date = dateFound;
                colIdx.desc = descFound;
                colIdx.debit = row.findIndex(c => c.includes('debit') || c.includes('debet') || c === 'dr');
                colIdx.credit = row.findIndex(c => c.includes('credit') || c.includes('kredit') || c === 'cr');
                colIdx.balance = row.findIndex(c => c.includes('balance') || c.includes('saldo'));
                break;
            }
        }

        // Validasi Format Header
        if (headerRowIdx === -1) {
            throw new Error("Format kolom Bank Mandiri tidak dikenali. Pastikan file memiliki kolom Tanggal (PostDate), Keterangan (Remarks), dan Nominal Debit/Kredit.");
        }

        const records = [];

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 2) continue;

            const rawDate = row[colIdx.date];
            if (!rawDate || String(rawDate).trim() === '') continue;

            const formattedDate = this.formatDateOnly(rawDate);
            if (!formattedDate) continue;

            let rawLabel = row[colIdx.desc] || '';
            // Cek jika ada kolom keterangan tambahan tepat di sebelahnya
            if (colIdx.desc + 1 < row.length && row[colIdx.desc + 1] && !row[colIdx.desc + 1].match(/^[\d,.-]+$/)) {
                rawLabel += ' ' + row[colIdx.desc + 1];
            }
            const trimmedLabel = this.cleanLabel(rawLabel);

            let debitVal = colIdx.debit !== -1 ? Math.abs(this.parseAmount(row[colIdx.debit])) : 0;
            let creditVal = colIdx.credit !== -1 ? Math.abs(this.parseAmount(row[colIdx.credit])) : 0;
            let balanceVal = colIdx.balance !== -1 ? Math.abs(this.parseAmount(row[colIdx.balance])) : 0;

            // Jika debit & credit bernilai 0 tapi ada baris data
            if (debitVal === 0 && creditVal === 0) continue;

            let type = creditVal > 0 ? 'CR' : 'DB';
            let amount = creditVal > 0 ? creditVal : -debitVal;

            records.push({
                no: records.length + 1,
                date: formattedDate,
                rawDate: String(rawDate),
                description: trimmedLabel,
                debet: debitVal,
                credit: creditVal,
                type: type,
                amount: amount,
                calculatedSaldo: balanceVal
            });
        }

        if (records.length === 0) {
            throw new Error("Tidak ditemukan transaksi valid pada file Bank Mandiri ini. Periksa apakah baris data kosong atau terpotong.");
        }

        return {
            bank: "Bank Mandiri",
            nama: nama,
            noRek: noRek,
            periode: periode,
            records: records
        };
    }
};

window.MandiriParser = MandiriParser;
