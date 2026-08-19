/**
 * BRI Statement Parser & Converter (CSV & XLSX)
 * Supports CMS BRI, QLola, and BRImo statement formats.
 */

const BRIParser = {
    formatDateOnly(dtStr) {
        if (!dtStr) return '';
        let clean = String(dtStr).trim();

        // Cth: 01-01-25 4:50 atau 01-01-2025 atau 01/01/2025
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
     * Parsing file CSV BRI menggunakan Universal CSVUtils
     */
    parse(csvContent) {
        const parsed = (typeof CSVUtils !== 'undefined')
            ? CSVUtils.parse(csvContent)
            : { rows: csvContent.split(/\r?\n/).map(l => l.split(';')) };

        if (!parsed.rows || parsed.rows.length < 2) {
            throw new Error("File CSV Bank BRI tidak memiliki baris data yang cukup.");
        }

        return this.parseFromRows(parsed.rows);
    },

    /**
     * Parsing file Excel (.xlsx / .xls) BRI
     */
    parseWorkbook(workbook) {
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!rows || rows.length < 2) {
            throw new Error("File Excel Bank BRI tidak memiliki baris data yang cukup.");
        }

        return this.parseFromRows(rows);
    },

    /**
     * Core processing logic for 2D array of rows
     */
    parseFromRows(rows) {
        let detectedNoRek = "";
        let headerRowIdx = -1;
        let colIdx = {
            noRek: -1,
            date: -1,
            desc: -1,
            remarkCustom: -1,
            debit: -1,
            credit: -1,
            saldo: -1
        };

        for (let i = 0; i < Math.min(15, rows.length); i++) {
            let row = rows[i].map(c => String(c).trim().toUpperCase());
            let dateFound = row.findIndex(c => c.includes('TGL_TRAN') || c.includes('TGL_EFEKTIF') || c.includes('TANGGAL') || c === 'DATE');
            let descFound = row.findIndex(c => c.includes('DESK_TRAN') || c.includes('REMARK_CUSTOM') || c.includes('TRREMK') || c.includes('KETERANGAN') || c.includes('URAIAN'));

            if (dateFound !== -1 && descFound !== -1) {
                headerRowIdx = i;
                colIdx.date = dateFound;
                colIdx.desc = descFound;
                colIdx.remarkCustom = row.findIndex(c => c.includes('REMARK_CUSTOM') || c.includes('REMARK'));
                colIdx.noRek = row.findIndex(c => c.includes('NOREK') || c.includes('NO_REK') || c.includes('NO REKENING'));
                colIdx.debit = row.findIndex(c => c.includes('MUTASI_DEBET') || c.includes('DEBET') || c.includes('DEBIT'));
                colIdx.credit = row.findIndex(c => c.includes('MUTASI_KREDIT') || c.includes('KREDIT') || c.includes('CREDIT'));
                colIdx.saldo = row.findIndex(c => c.includes('SALDO_AKHIR_MUTASI') || c.includes('SALDO'));
                break;
            }
        }

        // Validasi Format Header
        if (headerRowIdx === -1) {
            throw new Error("Format kolom Bank BRI tidak dikenali. Pastikan file memiliki kolom Tanggal (TGL_TRAN), Keterangan (DESK_TRAN / REMARK_CUSTOM), dan Mutasi Debet/Kredit.");
        }

        const records = [];

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 3) continue;

            if (!detectedNoRek && colIdx.noRek !== -1 && row[colIdx.noRek]) {
                detectedNoRek = String(row[colIdx.noRek]).trim();
            }

            const rawDate = row[colIdx.date];
            if (!rawDate || String(rawDate).trim() === '') continue;

            const formattedDate = this.formatDateOnly(rawDate);
            if (!formattedDate) continue;

            // Prioritaskan REMARK_CUSTOM jika ada isinya, jika tidak pakai DESK_TRAN
            let rawLabel = '';
            if (colIdx.remarkCustom !== -1 && row[colIdx.remarkCustom] && String(row[colIdx.remarkCustom]).trim()) {
                rawLabel = String(row[colIdx.remarkCustom]).trim();
            } else if (colIdx.desc !== -1 && row[colIdx.desc]) {
                rawLabel = String(row[colIdx.desc]).trim();
            }

            const trimmedLabel = this.cleanLabel(rawLabel);

            let debitVal = colIdx.debit !== -1 ? Math.abs(this.parseAmount(row[colIdx.debit])) : 0;
            let creditVal = colIdx.credit !== -1 ? Math.abs(this.parseAmount(row[colIdx.credit])) : 0;
            let saldoVal = colIdx.saldo !== -1 ? Math.abs(this.parseAmount(row[colIdx.saldo])) : 0;

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
                calculatedSaldo: saldoVal
            });
        }

        if (records.length === 0) {
            throw new Error("Tidak ditemukan transaksi valid pada file Bank BRI ini. Periksa apakah baris data kosong.");
        }

        return {
            bank: "Bank BRI",
            noRek: detectedNoRek,
            records: records
        };
    }
};

window.BRIParser = BRIParser;
