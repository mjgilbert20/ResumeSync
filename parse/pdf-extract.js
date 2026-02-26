// pdf-extract.js — Lightweight PDF text extractor (no dependencies)
// Handles the subset of PDF needed to reliably read resume text:
//   • Uncompressed and zlib-deflated content streams
//   • Tj / TJ / ' / " text operators
//   • Literal strings  (text)  and hex strings  <ABCD>
//   • UTF-16BE strings with BOM, PDFDocEncoding, and raw Latin-1
//
// Usage:
//   const text = await PDFExtract.extractText(arrayBuffer);

const PDFExtract = (() => {

  // ── Tiny inflate (zlib) ─────────────────────────────────────────────────────
  // RFC 1950 zlib wrapper + RFC 1951 DEFLATE implementation.
  // Supports the subset used by PDF FlateDecode (no dynamic huffman needed
  // in practice — most PDF compressors use fixed or stored blocks).

  function inflate(data) {
    // Strip zlib header (2 bytes) and adler-32 checksum (4 bytes at end)
    const src = new Uint8Array(data);
    // zlib header: CMF + FLG, skip 2 bytes
    let pos = 2;

    const out = [];
    let outPos = 0;

    // Prebuilt fixed huffman tables (RFC 1951 §3.2.6)
    function buildFixedLitLenTable() {
      const lengths = new Uint8Array(288);
      for (let i = 0; i <= 143; i++) lengths[i] = 8;
      for (let i = 144; i <= 255; i++) lengths[i] = 9;
      for (let i = 256; i <= 279; i++) lengths[i] = 7;
      for (let i = 280; i <= 287; i++) lengths[i] = 8;
      return buildHuffman(lengths);
    }
    function buildFixedDistTable() {
      const lengths = new Uint8Array(32).fill(5);
      return buildHuffman(lengths);
    }
    function buildHuffman(codeLengths) {
      const maxBits = Math.max(...codeLengths);
      const blCount  = new Uint32Array(maxBits + 1);
      for (const len of codeLengths) if (len) blCount[len]++;
      const nextCode = new Uint32Array(maxBits + 1);
      let code = 0;
      for (let bits = 1; bits <= maxBits; bits++) {
        code = (code + blCount[bits - 1]) << 1;
        nextCode[bits] = code;
      }
      const table = new Map();
      for (let i = 0; i < codeLengths.length; i++) {
        const len = codeLengths[i];
        if (!len) continue;
        const c = nextCode[len];
        nextCode[len]++;
        // Reverse bits for canonical Huffman
        let rev = 0;
        for (let b = 0; b < len; b++) rev = (rev << 1) | ((c >> b) & 1);
        table.set(rev | (len << 16), i);
      }
      return { table, maxBits };
    }

    // Bit reader
    let bitBuf = 0, bitLen = 0;
    function readBits(n) {
      while (bitLen < n) { bitBuf |= src[pos++] << bitLen; bitLen += 8; }
      const val = bitBuf & ((1 << n) - 1);
      bitBuf >>= n; bitLen -= n;
      return val;
    }
    function decodeHuffman({ table, maxBits }) {
      let code = 0;
      for (let bits = 1; bits <= maxBits; bits++) {
        code = (code << 1) | readBits(1);
        const sym = table.get(code | (bits << 16));
        if (sym !== undefined) return sym;
      }
      throw new Error("Bad Huffman code");
    }

    // Extra bits tables
    const lenBase  = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
    const lenExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
    const distBase  = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
    const distExtra = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

    const fixedLit  = buildFixedLitLenTable();
    const fixedDist = buildFixedDistTable();

    let bfinal = 0;
    do {
      bfinal = readBits(1);
      const btype = readBits(2);

      if (btype === 0) {
        // Stored block
        bitBuf = 0; bitLen = 0; // align to byte
        const len = src[pos] | (src[pos + 1] << 8); pos += 4;
        for (let i = 0; i < len; i++) out.push(src[pos++]);
        outPos += len;

      } else if (btype === 1 || btype === 2) {
        // Fixed or dynamic huffman
        let litTable, distTable;
        if (btype === 1) {
          litTable = fixedLit; distTable = fixedDist;
        } else {
          // Dynamic huffman
          const hlit  = readBits(5) + 257;
          const hdist = readBits(5) + 1;
          const hclen = readBits(4) + 4;
          const clOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
          const clLens  = new Uint8Array(19);
          for (let i = 0; i < hclen; i++) clLens[clOrder[i]] = readBits(3);
          const clTable = buildHuffman(clLens);
          const allLens = new Uint8Array(hlit + hdist);
          let i = 0;
          while (i < hlit + hdist) {
            const sym = decodeHuffman(clTable);
            if (sym < 16) { allLens[i++] = sym; }
            else if (sym === 16) { const rep = readBits(2) + 3; for (let r = 0; r < rep; r++) allLens[i++] = allLens[i - 1]; }
            else if (sym === 17) { i += readBits(3) + 3; }
            else { i += readBits(7) + 11; }
          }
          litTable  = buildHuffman(allLens.slice(0, hlit));
          distTable = buildHuffman(allLens.slice(hlit));
        }

        let sym;
        while ((sym = decodeHuffman(litTable)) !== 256) {
          if (sym < 256) {
            out.push(sym); outPos++;
          } else {
            const li   = sym - 257;
            const len  = lenBase[li]  + readBits(lenExtra[li]);
            const di   = decodeHuffman(distTable);
            const dist = distBase[di] + readBits(distExtra[di]);
            for (let k = 0; k < len; k++) { out.push(out[outPos - dist]); outPos++; }
          }
        }
      } else {
        throw new Error("Reserved BTYPE");
      }
    } while (!bfinal);

    return new Uint8Array(out);
  }

  // ── PDF byte helpers ────────────────────────────────────────────────────────

  function uint8ToString(arr, start, end) {
    let s = "";
    for (let i = start; i < end; i++) s += String.fromCharCode(arr[i]);
    return s;
  }

  // Decode a PDF string token (literal or hex) to a JS string
  function decodePDFString(raw) {
    if (raw.startsWith("<")) {
      // Hex string
      const hex = raw.slice(1, -1).replace(/\s/g, "");
      const bytes = [];
      for (let i = 0; i < hex.length; i += 2)
        bytes.push(parseInt(hex.slice(i, i + 2), 16));
      // UTF-16BE with BOM?
      if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        let s = "";
        for (let i = 2; i + 1 < bytes.length; i += 2)
          s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
        return s;
      }
      // UTF-16BE without BOM (heuristic: many zero bytes)
      const zeros = bytes.filter(b => b === 0).length;
      if (zeros > bytes.length / 3 && bytes.length % 2 === 0) {
        let s = "";
        for (let i = 0; i + 1 < bytes.length; i += 2)
          s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
        return s;
      }
      // PDFDocEncoding / Latin-1
      return bytes.map(b => String.fromCharCode(b)).join("");
    }

    // Literal string — strip outer parens, handle escape sequences
    const inner = raw.slice(1, -1);
    let s = "";
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "\\" && i + 1 < inner.length) {
        const next = inner[++i];
        if      (next === "n")  s += "\n";
        else if (next === "r")  s += "\r";
        else if (next === "t")  s += "\t";
        else if (next === "b")  s += "\b";
        else if (next === "f")  s += "\f";
        else if (next === "(")  s += "(";
        else if (next === ")")  s += ")";
        else if (next === "\\") s += "\\";
        else if (next >= "0" && next <= "7") {
          // Octal: up to 3 digits
          let oct = next;
          if (i + 1 < inner.length && inner[i + 1] >= "0" && inner[i + 1] <= "7") oct += inner[++i];
          if (i + 1 < inner.length && inner[i + 1] >= "0" && inner[i + 1] <= "7") oct += inner[++i];
          s += String.fromCharCode(parseInt(oct, 8));
        } else s += next;
      } else {
        s += inner[i];
      }
    }
    // Detect UTF-16BE BOM in literal strings
    if (s.charCodeAt(0) === 0xFE && s.charCodeAt(1) === 0xFF) {
      let out = "";
      for (let i = 2; i + 1 < s.length; i += 2)
        out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
      return out;
    }
    return s;
  }

  // ── Content stream text extraction ─────────────────────────────────────────
  // Parse PDF content stream operators and collect text runs.

  function extractFromStream(streamText) {
    // Tokenise: find string tokens, numbers, and operator words
    const tokens = [];
    let i = 0;
    const s = streamText;
    const len = s.length;

    while (i < len) {
      // Skip whitespace
      if (/\s/.test(s[i])) { i++; continue; }

      if (s[i] === "%") {
        // Comment — skip to end of line
        while (i < len && s[i] !== "\n" && s[i] !== "\r") i++;
        continue;
      }

      if (s[i] === "(") {
        // Literal string — track nested parens
        let depth = 1, j = i + 1;
        while (j < len && depth > 0) {
          if (s[j] === "\\" && j + 1 < len) { j += 2; continue; }
          if (s[j] === "(") depth++;
          if (s[j] === ")") depth--;
          j++;
        }
        tokens.push({ type: "str", val: s.slice(i, j) });
        i = j;
        continue;
      }

      if (s[i] === "<") {
        if (s[i + 1] === "<") {
          // Dictionary — skip
          let depth = 1, j = i + 2;
          while (j < len && depth > 0) {
            if (s[j] === "<" && s[j + 1] === "<") { depth++; j += 2; }
            else if (s[j] === ">" && s[j + 1] === ">") { depth--; j += 2; }
            else j++;
          }
          i = j;
        } else {
          // Hex string
          let j = i + 1;
          while (j < len && s[j] !== ">") j++;
          tokens.push({ type: "str", val: s.slice(i, j + 1) });
          i = j + 1;
        }
        continue;
      }

      if (s[i] === "[") {
        // Array — collect all tokens inside
        const arr = []; let j = i + 1;
        // We'll parse this recursively by advancing and collecting
        let depth = 1;
        let arrStr = "[";
        j = i + 1;
        while (j < len && depth > 0) {
          if (s[j] === "[") depth++;
          if (s[j] === "]") { depth--; if (!depth) break; }
          arrStr += s[j++];
        }
        tokens.push({ type: "arr", val: arrStr });
        i = j + 1;
        continue;
      }

      // Number or operator word
      let j = i;
      while (j < len && !/[\s<>()\[\]{}/%]/.test(s[j])) j++;
      if (j > i) { tokens.push({ type: "word", val: s.slice(i, j) }); i = j; }
      else i++;
    }

    // Scan tokens for text operators
    const parts = [];
    let inText = false;
    let currentWordSpacing = 0;
    let currentCharSpacing = 0;

    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];

      if (tok.type === "word") {
        const op = tok.val;

        if (op === "BT") { inText = true; continue; }
        if (op === "ET") { inText = false; parts.push("\n"); continue; }

        if (!inText) continue;

        if (op === "Tf") {
          // Font change — treat as potential word boundary
          parts.push(" ");
        }

        if (op === "Td" || op === "TD" || op === "T*") {
          // Move to new line
          parts.push(" ");
        }

        if (op === "Tm") {
          // Text matrix — new text position, likely new line
          parts.push(" ");
        }

        if (op === "Tj" || op === "'" || op === '"') {
          // Single string
          const strTok = tokens[t - 1];
          if (strTok?.type === "str") {
            if (op === "'") parts.push("\n");
            if (op === '"') parts.push("\n");
            parts.push(decodePDFString(strTok.val));
          }
        }

        if (op === "TJ") {
          // Array of strings and kerning numbers
          const arrTok = tokens[t - 1];
          if (arrTok?.type === "arr") {
            // Extract strings from inside the array
            const inner = arrTok.val;
            let k = 0;
            while (k < inner.length) {
              if (/\s/.test(inner[k])) { k++; continue; }
              if (inner[k] === "(") {
                let depth = 1, j = k + 1;
                while (j < inner.length && depth > 0) {
                  if (inner[j] === "\\" && j + 1 < inner.length) { j += 2; continue; }
                  if (inner[j] === "(") depth++;
                  if (inner[j] === ")") depth--;
                  j++;
                }
                parts.push(decodePDFString(inner.slice(k, j)));
                k = j;
              } else if (inner[k] === "<") {
                let j = k + 1;
                while (j < inner.length && inner[j] !== ">") j++;
                parts.push(decodePDFString(inner.slice(k, j + 1)));
                k = j + 1;
              } else {
                // Number (kerning) — large negative gap means word space
                let j = k;
                while (j < inner.length && /[0-9.\-+]/.test(inner[j])) j++;
                if (j > k) {
                  const kern = parseFloat(inner.slice(k, j));
                  if (kern < -100) parts.push(" "); // heuristic word boundary
                  k = j;
                } else k++;
              }
            }
          }
        }
      }
    }

    return parts.join("").replace(/\r/g, "\n");
  }

  // ── Main entry point ────────────────────────────────────────────────────────

  async function extractText(arrayBuffer) {
    const raw = new Uint8Array(arrayBuffer);
    const full = uint8ToString(raw, 0, raw.length);

    // Find all content streams
    // Strategy: locate "stream\r\n" or "stream\n" markers, read until endstream
    const allText = [];

    // Also collect stream dictionaries for FlateDecode detection
    // We scan for obj...stream...endstream blocks
    const streamRe = /stream[\r\n]/g;
    let match;
    while ((match = streamRe.exec(full)) !== null) {
      const streamStart = match.index + match[0].length;

      // Look backwards for the stream's dictionary to detect FlateDecode
      const dictEnd   = match.index;
      const dictStart = full.lastIndexOf("obj", dictEnd);
      const dictText  = dictStart >= 0 ? full.slice(dictStart, dictEnd) : "";

      // Find endstream
      const endIdx = full.indexOf("endstream", streamStart);
      if (endIdx < 0) continue;

      let streamBytes = raw.slice(streamStart, endIdx);

      // Attempt FlateDecode (zlib) if indicated or as a heuristic
      const isFlate = /FlateDecode|Flate/.test(dictText);
      if (isFlate || (streamBytes[0] === 0x78 && (streamBytes[1] === 0x01 || streamBytes[1] === 0x9C || streamBytes[1] === 0xDA))) {
        try {
          streamBytes = inflate(streamBytes);
        } catch {
          // Not deflated or corrupt — use raw bytes
        }
      }

      // Heuristic: only process streams that look like content streams
      // (contain BT/ET or text operators)
      const streamStr = uint8ToString(streamBytes, 0, Math.min(streamBytes.length, 100000));
      if (!/\bBT\b|\bTj\b|\bTJ\b/.test(streamStr)) continue;

      try {
        const text = extractFromStream(streamStr);
        if (text.trim().length > 5) allText.push(text);
      } catch {
        // Skip unparseable streams
      }
    }

    if (allText.length === 0) {
      throw new Error("Could not extract text from this PDF. It may be scanned or image-only.");
    }

    // Join pages with newlines and clean up excessive whitespace
    return allText
      .join("\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return { extractText };
})();

// Expose as an unambiguous global so classic scripts (popup.js) can reach it
window.PDFExtract = PDFExtract;
