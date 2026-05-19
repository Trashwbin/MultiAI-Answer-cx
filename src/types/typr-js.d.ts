declare module 'typr.js' {
  type ParsedFont = unknown;

  interface TyprStatic {
    parse(buffer: Uint8Array | ArrayBuffer): ParsedFont;
    U: {
      codeToGlyph(font: ParsedFont, code: number): number;
      glyphToPath(font: ParsedFont, glyph: number): unknown;
    };
  }

  const Typr: TyprStatic;
  export default Typr;
}

