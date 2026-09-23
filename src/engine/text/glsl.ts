// textAt(g) liefert (Deckung, Farbe)
export const textGlsl = `
uniform sampler2D uText;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform float uAtlasRows;
// Daraus ergibt sich das Mip-Level
uniform float uAtlasCellPx;
uniform float uCellPx;

vec2 textAt(vec2 g) {
  vec2 cell = floor(g);
  float best = 0.0;
  float color = 0.0;
  for (int dy = -1; dy <= 1; dy++)
  for (int dx = -1; dx <= 1; dx++) {
    vec2 c = cell + vec2(float(dx), float(dy));
    if (c.x < 0.0 || c.y < 0.0 || c.x >= uGrid.x || c.y >= uGrid.y) continue;
    vec4 d = texelFetch(uText, ivec2(c), 0);
    float glyph = floor(d.r * 255.0 + 0.5);
    if (glyph < 0.5) continue;
    float scale = max(d.b * 255.0 / 64.0, 0.05);
    vec2 local = (g - (c + 0.5)) / scale + 0.5;
    if (local.x < 0.0 || local.y < 0.0 || local.x > 1.0 || local.y > 1.0) continue;
    vec2 a = vec2(mod(glyph, 16.0), floor(glyph / 16.0));
    vec2 auv = vec2((a.x + local.x) / 16.0, 1.0 - (a.y + local.y) / uAtlasRows);
    // Mip-Level von Hand, keine Ableitungen in der Schleife
    float lod = max(log2(uAtlasCellPx / max(uCellPx * scale, 1.0)), 0.0);
    float cov = textureLod(uAtlas, auv, lod).a * d.g;
    if (cov > best) { best = cov; color = d.a; }
  }
  return vec2(best, color);
}
`;

// Bildröhre: Wölbung, Scanlines, Schattenmaske, Vignette
export const crtGlsl = `
vec2 crtCurve(vec2 uv, float k) {
  vec2 c = uv - 0.5;
  return uv + c * dot(c, c) * k;
}
bool crtOutside(vec2 uv) { return uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0; }
vec3 crtFinish(vec3 col, vec2 uv, vec2 fragCoord, float lines) {
  col *= 0.86 + 0.14 * sin(uv.y * lines * 3.14159 * 2.0);
  // Feine RGB-Schattenmaske
  float m = mod(fragCoord.x, 3.0);
  col *= vec3(m < 1.0 ? 1.05 : 0.95, m >= 1.0 && m < 2.0 ? 1.05 : 0.95, m >= 2.0 ? 1.05 : 0.95);
  vec2 c = uv - 0.5;
  col *= smoothstep(0.78, 0.3, length(c * vec2(1.0, 1.1)));
  return col;
}
`;
