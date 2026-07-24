import type * as THREE from 'three';
import type { AudioFeatures } from '../audio/types';

export type ModeCategory = 'organic' | 'particles' | 'retro' | 'ambient' | 'lineart' | 'experimental';

export interface ModeMeta {
  id: string;
  name: string;
  category: ModeCategory;
  description: string;
  // 1 = gering, 3 = hoch. Hilft Dynamic Resolution bei Übergängen
  gpuCost: 1 | 2 | 3;
  // Sättigungsschub nach AgX, 0 = keiner
  vivid?: number;
}

export interface ModeContext {
  renderer: THREE.WebGLRenderer;
  // 256×1-LUT der aktiven Palette
  palette: THREE.Texture;
}

export interface VisualMode {
  init(ctx: ModeContext): void | Promise<void>;
  resize(width: number, height: number): void;
  update(audio: AudioFeatures): void;
  // In das übergebene HDR-Target zeichnen (RGBA16F, linear)
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void;
  dispose(): void;
}

export interface ModeDefinition {
  meta: ModeMeta;
  create(): VisualMode;
}
