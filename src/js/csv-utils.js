/**
 * Universal CSV Parsing & Normalization Engine
 * Handles Windows/DOS (\r\n), Unix (\n), Macintosh (\r), UTF-8 BOM,
 * and auto-detects delimiters (comma, semicolon, tab, pipe).
 */

const CSVUtils = {
    /**
     * Normalisasi baris dan membersihkan UTF-8 BOM
     */
    normalizeText(text) {
        if (!text) return '';
        let clean = String(text);
        // Hapus UTF-8 BOM jika ada
        if (clean.charCodeAt(0) === 0xFEFF) {
            clean = clean.substring(1);
        }
        // Ubah semua variasi newline (\r\n, \r) menjadi \n
        return clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    },

    /**
     * Deteksi delimiter otomatis berdasarkan frekuensi pada baris header dan sampel
     */
    detectDelimiter(normalizedText) {
        const lines = normalizedText.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return ';';

        const sampleLines = lines.slice(0, Math.min(5, lines.length));
        const delimiters = [';', ',', '\t', '|'];
        const scores = { ';': 0, ',': 0, '\t': 0, '|': 0 };

        for (let line of sampleLines) {
            for (let d of delimiters) {
                // Hitung karakter di luar tanda kutip
                let inQuotes = false;
                let count = 0;
                for (let i = 0; i < line.length; i++) {
                    let c = line[i];
                    if (c === '"' || c === "'") inQuotes = !inQuotes;
                    else if (c === d && !inQuotes) count++;
                }
                scores[d] += count;
            }
        }

        let bestDelim = ';';
        let maxCount = -1;
        for (let d of delimiters) {
            if (scores[d] > maxCount) {
                maxCount = scores[d];
                bestDelim = d;
            }
        }

        return maxCount > 0 ? bestDelim : ';';
    },

    /**
     * Parser baris CSV sesuai standar RFC 4180
     */
    parseLine(line, delimiter) {
        const result = [];
        let cur = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const c = line[i];

            if (c === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    // Escaped double quote ("")
                    cur += '"';
                    i += 2;
                    continue;
                }
                inQuotes = !inQuotes;
            } else if (c === delimiter && !inQuotes) {
                result.push(cur.trim());
                cur = '';
            } else {
                cur += c;
            }
            i++;
        }
        result.push(cur.trim());
        return result;
    },

    /**
     * Parsing teks CSV lengkap menjadi array 2D
     */
    parse(csvText, forcedDelimiter = null) {
        const normalized = this.normalizeText(csvText);
        const delimiter = forcedDelimiter || this.detectDelimiter(normalized);
        const lines = normalized.split('\n').filter(l => l.trim().length > 0);

        const rows = [];
        for (let line of lines) {
            const row = this.parseLine(line, delimiter);
            if (row.length > 0 && row.some(cell => cell.length > 0)) {
                rows.push(row);
            }
        }

        return {
            delimiter: delimiter,
            rows: rows
        };
    }
};

window.CSVUtils = CSVUtils;
