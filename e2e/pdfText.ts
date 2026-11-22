import { inflateSync } from 'node:zlib';

/**
 * Minimal text extraction for the PDFs Chromium makes with page.pdf(), used by the print tests to check what
 * is on each physical page. Not a general PDF parser: it handles uncompressed and Flate-compressed streams,
 * Type0 fonts with a ToUnicode map (how Chromium embeds text), and Tj / TJ text operators.
 * Returns one string per page, in page order. Words may be split or joined differently from the screen, so
 * callers should compare with whitespace removed.
 */
interface Obj { dict: string; stream?: Buffer }

function parseObjects(buf: Buffer): Map<number, Obj> {
  const s = buf.toString('latin1');
  const out = new Map<number, Obj>();
  const re = /(\d+)\s+0\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endobj', start);
    if (end < 0) break;
    const body = s.slice(start, end);
    const si = body.search(/\bstream\r?\n/);
    if (si < 0) { out.set(Number(m[1]), { dict: body }); continue; }
    const dict = body.slice(0, si);
    const dataStart = start + si + body.slice(si).match(/^stream\r?\n/)![0].length;
    // Use the declared length: compressed data can itself end in a byte that looks like a line break.
    const len = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    let dataEnd: number;
    if (len) dataEnd = dataStart + Number(len[1]);
    else {
      dataEnd = s.lastIndexOf('endstream', end);
      if (s[dataEnd - 1] === '\n') dataEnd--;
      if (s[dataEnd - 1] === '\r') dataEnd--;
    }
    let data = buf.subarray(dataStart, dataEnd);
    if (/\/FlateDecode/.test(dict)) {
      try { data = inflateSync(data); } catch { /* leave as is */ }
    }
    out.set(Number(m[1]), { dict, stream: data });
    re.lastIndex = end;
  }
  return out;
}

const ref = (dict: string, key: string): number | undefined => {
  const m = dict.match(new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`));
  return m ? Number(m[1]) : undefined;
};

function parseCMap(text: string): { map: Map<number, string>; bytes: number } {
  const map = new Map<number, string>();
  const hexToStr = (h: string) => {
    let r = '';
    for (let i = 0; i + 4 <= h.length; i += 4) r += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return r;
  };
  const cs = text.match(/begincodespacerange\s*<([0-9a-fA-F]+)>/);
  const bytes = cs ? cs[1]!.length / 2 : 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(p[1]!, 16), hexToStr(p[2]!));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(p[1]!, 16), hi = parseInt(p[2]!, 16);
      if (p[3]!.startsWith('[')) {
        const items = [...p[3]!.matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => hexToStr(x[1]!));
        items.forEach((v, i) => map.set(lo + i, v));
      } else {
        const base = p[3]!.slice(1, -1);
        const first = parseInt(base.slice(-4), 16), prefix = hexToStr(base.slice(0, -4));
        for (let c = lo; c <= hi; c++) map.set(c, prefix + String.fromCharCode(first + (c - lo)));
      }
    }
  }
  return { map, bytes };
}

function decodeHex(hex: string, cmap: { map: Map<number, string>; bytes: number } | undefined): string {
  const h = hex.replace(/\s+/g, '');
  if (!cmap) return '';
  const w = cmap.bytes * 2;
  let r = '';
  for (let i = 0; i + w <= h.length; i += w) r += cmap.map.get(parseInt(h.slice(i, i + w), 16)) ?? '';
  return r;
}

function pageOrder(objs: Map<number, Obj>): number[] {
  const catalog = [...objs.values()].find((o) => /\/Type\s*\/Catalog/.test(o.dict));
  const root = catalog ? ref(catalog.dict, 'Pages') : undefined;
  const walk = (id: number | undefined): number[] => {
    if (id === undefined) return [];
    const o = objs.get(id);
    if (!o) return [];
    if (/\/Type\s*\/Page\b(?!s)/.test(o.dict)) return [id];
    const kids = o.dict.match(/\/Kids\s*\[([^\]]*)\]/);
    return kids ? [...kids[1]!.matchAll(/(\d+)\s+0\s+R/g)].flatMap((k) => walk(Number(k[1]))) : [];
  };
  return walk(root);
}

export async function pdfPageTexts(pdf: Buffer): Promise<string[]> {
  const objs = parseObjects(pdf);
  const cmapCache = new Map<number, { map: Map<number, string>; bytes: number }>();
  const fontCMap = (fontId: number) => {
    if (cmapCache.has(fontId)) return cmapCache.get(fontId);
    const tu = ref(objs.get(fontId)?.dict ?? '', 'ToUnicode');
    const stream = tu !== undefined ? objs.get(tu)?.stream : undefined;
    const c = stream ? parseCMap(stream.toString('latin1')) : undefined;
    if (c) cmapCache.set(fontId, c);
    return c;
  };
  return pageOrder(objs).map((pid) => {
    const page = objs.get(pid)!;
    let res = page.dict;
    const resRef = ref(page.dict, 'Resources');
    if (resRef !== undefined) res = objs.get(resRef)?.dict ?? '';
    let fontDict = res.match(/\/Font\s*<<([\s\S]*?)>>/)?.[1] ?? '';
    const fontRef = ref(res, 'Font');
    if (!fontDict && fontRef !== undefined) fontDict = objs.get(fontRef)?.dict ?? '';
    const fonts = new Map([...fontDict.matchAll(/\/([^\s/<>[\]]+)\s+(\d+)\s+0\s+R/g)].map((f) => [f[1]!, Number(f[2])]));
    const contents = page.dict.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/)?.[1] ?? '';
    const streams = [...contents.matchAll(/(\d+)\s+0\s+R/g)].map((c) => objs.get(Number(c[1]))?.stream?.toString('latin1') ?? '');
    let text = '';
    let cur: { map: Map<number, string>; bytes: number } | undefined;
    for (const cs of streams) {
      const tokens = cs.matchAll(/\/([^\s/<>[\]()]+)\s+[\d.]+\s+Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9a-fA-F\s]*)>\s*Tj|\b(ET|Td|TD|T\*|Tm)\b/g);
      for (const t of tokens) {
        if (t[1] !== undefined) { const id = fonts.get(t[1]); cur = id !== undefined ? fontCMap(id) : undefined; }
        else if (t[2] !== undefined) {
          for (const part of t[2].matchAll(/<([0-9a-fA-F\s]*)>|(-?[\d.]+)/g)) {
            if (part[1] !== undefined) text += decodeHex(part[1], cur);
            else if (Number(part[2]) < -200) text += ' ';
          }
        } else if (t[3] !== undefined) text += decodeHex(t[3], cur);
        else text += ' ';
      }
    }
    return text;
  });
}
