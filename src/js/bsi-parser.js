/**
 * BSI Excel (.xlsx) Statement Parser & Converter
 */

const BSIParser = {
    formatDateOnly(dtStr) {
        if (!dtStr) return '';
        let clean = String(dtStr).trim();

        // Cth: 01-01-2025 04.33 atau 01/01/2025
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

    parse(workbook) {
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Konversi ke array 2 dimensi
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rawData.length < 5) {
            throw new Error("File Excel BSI tidak memiliki baris data yang cukup.");
        }

        let nama = "";
        let noRek = "";
        let periode = "";

        // Ekstraksi Metadata Header BSI (Baris 1-14)
        for (let i = 0; i < Math.min(15, rawData.length); i++) {
            let rowText = rawData[i].map(c => String(c)).join(' ');
            if (rowText.includes('Rekening :') || rowText.includes('REKENING :')) {
                let match = rowText.match(/Rekening\s*:\s*(?:REKENING\s*:\s*)?(?:IDR\s*)?(\d+)/i);
                if (match) noRek = match[1];
                let namaMatch = rowText.match(/-\s*([^-\n]+)$/);
                if (namaMatch) nama = namaMatch[1].trim();
            }
            if (rowText.includes('Periode :') || rowText.includes('PERIODE :')) {
                let pMatch = rowText.match(/Periode\s*:\s*([^\n\r]+)/i);
                if (pMatch) periode = pMatch[1].trim();
            }
        }

        // Cari Baris Header Tabel (mencari 'Waktu Transaksi' / 'Deskripsi' / 'Debet')
        let headerRowIdx = -1;
        let colIdx = {
            date: -1,
            desc: -1,
            pengirim: -1,
            penerima: -1,
            debet: -1,
            kredit: -1,
            saldo: -1
        };

        for (let i = 0; i < rawData.length; i++) {
            let row = rawData[i].map(c => String(c).trim().toLowerCase());
            let dateFound = row.findIndex(c => c.includes('waktu transaksi') || c.includes('tanggal') || c.includes('date'));
            let descFound = row.findIndex(c => c.includes('deskripsi') || c.includes('keterangan') || c.includes('uraian'));

            if (dateFound !== -1 && descFound !== -1) {
                headerRowIdx = i;
                colIdx.date = dateFound;
                colIdx.desc = descFound;
                colIdx.pengirim = row.findIndex(c => c.includes('nama pengirim') || c.includes('pengirim'));
                colIdx.penerima = row.findIndex(c => c.includes('nama penerima') || c.includes('penerima'));
                colIdx.debet = row.findIndex(c => c.includes('debet') || c.includes('debit'));
                colIdx.kredit = row.findIndex(c => c.includes('kredit') || c.includes('credit'));
                colIdx.saldo = row.findIndex(c => c.includes('saldo'));
                break;
            }
        }

        if (headerRowIdx === -1) {
            throw new Error("Header tabel mutasi BSI tidak ditemukan (kolom Waktu Transaksi / Deskripsi).");
        }

        const records = [];

        for (let i = headerRowIdx + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;

            const rawDate = row[colIdx.date];
            if (!rawDate) continue;

            const formattedDate = this.formatDateOnly(rawDate);
            if (!formattedDate) continue;

            let deskripsi = row[colIdx.desc] ? String(row[colIdx.desc]).trim() : '';
            let pengirim = (colIdx.pengirim !== -1 && row[colIdx.pengirim]) ? String(row[colIdx.pengirim]).trim() : '';
            let penerima = (colIdx.penerima !== -1 && row[colIdx.penerima]) ? String(row[colIdx.penerima]).trim() : '';

            // Bentuk label lengkap yang informatif
            let fullLabel = deskripsi;
            if (pengirim && !fullLabel.includes(pengirim)) {
                fullLabel += ` - Pengirim: ${pengirim}`;
            }
            if (penerima && !fullLabel.includes(penerima)) {
                fullLabel += ` - Penerima: ${penerima}`;
            }
            fullLabel = this.cleanLabel(fullLabel);

            let debetVal = colIdx.debet !== -1 ? Math.abs(this.parseAmount(row[colIdx.debet])) : 0;
            let creditVal = colIdx.kredit !== -1 ? Math.abs(this.parseAmount(row[colIdx.kredit])) : 0;
            let saldoVal = colIdx.saldo !== -1 ? Math.abs(this.parseAmount(row[colIdx.saldo])) : 0;

            let type = creditVal > 0 ? 'CR' : 'DB';
            let amount = creditVal > 0 ? creditVal : -debetVal;

            records.push({
                no: records.length + 1,
                date: formattedDate,
                rawDate: String(rawDate),
                description: fullLabel,
                debet: debetVal,
                credit: creditVal,
                type: type,
                amount: amount,
                calculatedSaldo: saldoVal
            });
        }

        return {
            bank: "BSI",
            nama: nama,
            noRek: noRek,
            periode: periode,
            records: records
        };
    }
};

window.BSIParser = BSIParser;
