// Voxelcraft — a browser Minecraft-style sandbox
// Three.js + custom chunked voxel renderer + procedural texture atlas
import * as THREE from 'three';

// ---------- Constants ----------
const CHUNK_SIZE = 16;          // X, Z
const CHUNK_HEIGHT = 64;        // Y
const RENDER_DISTANCE = 4;      // chunks in each direction
const GRAVITY = 28;
const JUMP_VELOCITY = 9.0;
const WALK_SPEED = 4.5;
const SPRINT_SPEED = 7.5;
const FLY_SPEED = 12.0;
const PLAYER_HEIGHT = 1.8;
const PLAYER_WIDTH = 0.6;
const REACH = 6.0;

// Block IDs
const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,
  LEAVES: 6,
  PLANKS: 7,
  GLASS: 8,
  BRICK: 9,
  WATER: 10,
  COBBLE: 11,
  SNOW: 12,
};

// Block face order: +x, -x, +y, -y, +z, -z   (right, left, top, bottom, front, back)
// Each block has up to 6 face texture tiles. tiles[i] = atlas tile index.
const BLOCKS = {
  [B.GRASS]:   { name: 'Grass',  tiles: [3, 3, 0, 2, 3, 3], solid: true },
  [B.DIRT]:    { name: 'Dirt',   tiles: [2, 2, 2, 2, 2, 2], solid: true },
  [B.STONE]:   { name: 'Stone',  tiles: [1, 1, 1, 1, 1, 1], solid: true },
  [B.SAND]:    { name: 'Sand',   tiles: [4, 4, 4, 4, 4, 4], solid: true },
  [B.WOOD]:    { name: 'Wood',   tiles: [6, 6, 5, 5, 6, 6], solid: true },
  [B.LEAVES]:  { name: 'Leaves', tiles: [7, 7, 7, 7, 7, 7], solid: true, transparent: true },
  [B.PLANKS]:  { name: 'Planks', tiles: [8, 8, 8, 8, 8, 8], solid: true },
  [B.GLASS]:   { name: 'Glass',  tiles: [9, 9, 9, 9, 9, 9], solid: true, transparent: true },
  [B.BRICK]:   { name: 'Brick',  tiles: [10,10,10,10,10,10], solid: true },
  [B.WATER]:   { name: 'Water',  tiles: [11,11,11,11,11,11], solid: false, transparent: true, liquid: true },
  [B.COBBLE]:  { name: 'Cobble', tiles: [12,12,12,12,12,12], solid: true },
  [B.SNOW]:    { name: 'Snow',   tiles: [13,13,13,13,13,13], solid: true },
};

// Hotbar block list
const HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.WOOD, B.PLANKS, B.LEAVES, B.SAND, B.BRICK, B.GLASS];

// ---------- Procedural pixel-art texture atlas ----------
// 16x16 tiles, 4x4 grid = 64x64 atlas. Tile index 0..15.
const TILE = 16;
const ATLAS_COLS = 4;
const ATLAS_SIZE = TILE * ATLAS_COLS;

function rngFor(seed) {
  let s = seed | 0;
  return function () {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function fillTile(ctx, tx, ty, draw) {
  // draw(px, py) returns [r,g,b] in 0..255 for each pixel
  const img = ctx.createImageData(TILE, TILE);
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const c = draw(px, py);
      const i = (py * TILE + px) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = c[3] ?? 255;
    }
  }
  ctx.putImageData(img, tx * TILE, ty * TILE);
}

function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');

  const noise = (seed) => {
    const r = rngFor(seed);
    const buf = new Float32Array(TILE * TILE);
    for (let i = 0; i < buf.length; i++) buf[i] = r();
    return (x, y) => buf[y * TILE + x];
  };

  // tile 0: grass top
  const gTop = noise(7);
  fillTile(ctx, 0, 0, (x, y) => {
    const n = gTop(x, y);
    const base = [82, 158, 64];
    const v = (n - 0.5) * 30;
    return [base[0] + v, base[1] + v, base[2] + v * 0.5];
  });

  // tile 1: stone
  const sN = noise(13);
  fillTile(ctx, 1, 0, (x, y) => {
    const n = sN(x, y);
    const v = 110 + (n - 0.5) * 50;
    return [v, v, v + 4];
  });

  // tile 2: dirt
  const dN = noise(19);
  fillTile(ctx, 2, 0, (x, y) => {
    const n = dN(x, y);
    return [120 + (n - 0.5) * 35, 80 + (n - 0.5) * 25, 50 + (n - 0.5) * 18];
  });

  // tile 3: grass side (dirt with green top fringe)
  const gSide = noise(23);
  fillTile(ctx, 3, 0, (x, y) => {
    const n = gSide(x, y);
    if (y < 4) {
      // grassy top
      const v = (n - 0.5) * 30;
      return [70 + v, 150 + v, 55 + v * 0.5];
    } else if (y === 4) {
      // jagged transition
      const j = ((x * 13 + 7) % 5) < 2 ? 1 : 0;
      if (j) return [70, 150, 55];
      return [120 + (n - 0.5) * 35, 80 + (n - 0.5) * 25, 50];
    }
    return [120 + (n - 0.5) * 35, 80 + (n - 0.5) * 25, 50 + (n - 0.5) * 18];
  });

  // tile 4: sand
  const saN = noise(29);
  fillTile(ctx, 0, 1, (x, y) => {
    const n = saN(x, y);
    return [220 + (n - 0.5) * 25, 200 + (n - 0.5) * 20, 140 + (n - 0.5) * 20];
  });

  // tile 5: wood top (rings)
  fillTile(ctx, 1, 1, (x, y) => {
    const cx = 7.5, cy = 7.5;
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.sin(r * 1.6) * 0.5 + 0.5;
    const base = 110 + ring * 30;
    return [base + 25, base, base * 0.55];
  });

  // tile 6: wood side (vertical bark)
  fillTile(ctx, 2, 1, (x, y) => {
    const stripe = Math.sin(x * 0.9) * 0.5 + 0.5;
    const noise2 = ((x * 31 + y * 17) % 7) / 7;
    const base = 95 + stripe * 25 + noise2 * 8;
    return [base + 20, base * 0.85, base * 0.5];
  });

  // tile 7: leaves (mottled green with alpha gaps for transparency style)
  const leafN = noise(41);
  fillTile(ctx, 3, 1, (x, y) => {
    const n = leafN(x, y);
    const dark = n < 0.18;
    const r = 40 + n * 50;
    const g = 105 + n * 80;
    const b = 35 + n * 40;
    if (dark) return [r * 0.6, g * 0.6, b * 0.6, 220];
    return [r, g, b, 255];
  });

  // tile 8: planks
  fillTile(ctx, 0, 2, (x, y) => {
    const row = Math.floor(y / 4);
    const offset = (row % 2) * 8;
    const xx = (x + offset) % 16;
    const grain = Math.sin((xx + row * 3) * 1.4) * 0.5 + 0.5;
    const isLine = (y % 4 === 0) || (xx === 0);
    if (isLine) return [110, 70, 35];
    const base = 165 + grain * 25;
    return [base, base * 0.78, base * 0.45];
  });

  // tile 9: glass (mostly transparent with frame)
  fillTile(ctx, 1, 2, (x, y) => {
    const edge = (x === 0 || y === 0 || x === 15 || y === 15);
    if (edge) return [200, 230, 240, 240];
    return [200, 230, 245, 50];
  });

  // tile 10: brick
  fillTile(ctx, 2, 2, (x, y) => {
    const row = Math.floor(y / 4);
    const offset = (row % 2) * 8;
    const xx = (x + offset) % 16;
    const isMortar = (y % 4 === 0) || (xx % 8 === 0);
    if (isMortar) return [80, 80, 80];
    const n = ((xx * 13 + y * 7) % 11) / 11;
    return [165 + n * 30, 70 + n * 20, 55 + n * 15];
  });

  // tile 11: water
  const wN = noise(53);
  fillTile(ctx, 3, 2, (x, y) => {
    const n = wN(x, y);
    return [40 + n * 30, 110 + n * 40, 200 + n * 30, 200];
  });

  // tile 12: cobblestone
  fillTile(ctx, 0, 3, (x, y) => {
    const cellX = Math.floor(x / 4);
    const cellY = Math.floor(y / 4);
    const seedN = ((cellX * 73 + cellY * 31) % 17) / 17;
    const inX = x % 4, inY = y % 4;
    const isEdge = (inX === 0 || inY === 0);
    const v = isEdge ? 75 : 120 + seedN * 50;
    return [v, v, v + 6];
  });

  // tile 13: snow
  fillTile(ctx, 1, 3, (x, y) => {
    const n = ((x * 17 + y * 23) % 13) / 13;
    const v = 235 + n * 18;
    return [v, v, 255];
  });

  // tiles 14, 15: unused (fill with magenta debug)
  for (let i = 14; i <= 15; i++) {
    const tx = i % ATLAS_COLS, ty = Math.floor(i / ATLAS_COLS);
    fillTile(ctx, tx, ty, () => [255, 0, 255]);
  }

  return canvas;
}

// UV coords for tile index in atlas
function tileUV(idx) {
  const tx = idx % ATLAS_COLS;
  const ty = Math.floor(idx / ATLAS_COLS);
  const u0 = tx / ATLAS_COLS;
  const v0 = 1 - (ty + 1) / ATLAS_COLS;
  const u1 = (tx + 1) / ATLAS_COLS;
  const v1 = 1 - ty / ATLAS_COLS;
  return [u0, v0, u1, v1];
}

// ---------- World / Chunk ----------
class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.dirty = true;
    this.solidMesh = null;
    this.transparentMesh = null;
  }
  index(x, y, z) {
    return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
  }
  get(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return -1;
    return this.blocks[this.index(x, y, z)];
  }
  set(x, y, z, v) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
    this.blocks[this.index(x, y, z)] = v;
    this.dirty = true;
  }
}

class World {
  constructor(scene, atlasTexture) {
    this.scene = scene;
    this.chunks = new Map();
    this.atlas = atlasTexture;

    this.solidMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      vertexColors: true,
      side: THREE.FrontSide,
    });
    this.transparentMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    });

    // Simple value noise (deterministic)
    this.seed = 1337;
  }

  key(cx, cz) { return `${cx},${cz}`; }

  // ---- Terrain generation ----
  hash2(x, z) {
    let h = x * 374761393 + z * 668265263 + this.seed * 1442695040888963407;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  }
  // smooth value-noise
  vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const a = this.hash2(xi, zi);
    const b = this.hash2(xi + 1, zi);
    const c = this.hash2(xi, zi + 1);
    const d = this.hash2(xi + 1, zi + 1);
    const sx = xf * xf * (3 - 2 * xf);
    const sz = zf * zf * (3 - 2 * zf);
    return a * (1 - sx) * (1 - sz) + b * sx * (1 - sz) + c * (1 - sx) * sz + d * sx * sz;
  }
  fbm(x, z) {
    let v = 0, amp = 1, freq = 1, sum = 0;
    for (let i = 0; i < 4; i++) {
      v += this.vnoise(x * freq, z * freq) * amp;
      sum += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return v / sum;
  }
  heightAt(wx, wz) {
    const base = 24;
    const h1 = this.fbm(wx * 0.012, wz * 0.012) * 18;
    const h2 = this.fbm(wx * 0.04, wz * 0.04) * 6;
    return Math.floor(base + h1 + h2);
  }

  generateChunk(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const SEA = 22;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const h = this.heightAt(wx, wz);

        for (let y = 0; y <= h; y++) {
          let block;
          if (y === 0) block = B.STONE;
          else if (y < h - 4) block = B.STONE;
          else if (y < h) block = B.DIRT;
          else {
            // top block
            if (h <= SEA) block = B.SAND;
            else if (h > 38) block = B.SNOW;
            else block = B.GRASS;
          }
          chunk.blocks[chunk.index(x, y, z)] = block;
        }
        // Water fill
        for (let y = h + 1; y <= SEA; y++) {
          chunk.blocks[chunk.index(x, y, z)] = B.WATER;
        }
        // Beach: thin sand at sea+1 if the surface is JUST at sea level
        if (h === SEA + 1) {
          chunk.blocks[chunk.index(x, h, z)] = B.SAND;
        }
      }
    }

    // Trees
    const treeRng = rngFor(cx * 73856093 ^ cz * 19349663 ^ this.seed);
    const treeCount = Math.floor(treeRng() * 4);
    for (let t = 0; t < treeCount; t++) {
      const lx = 2 + Math.floor(treeRng() * (CHUNK_SIZE - 4));
      const lz = 2 + Math.floor(treeRng() * (CHUNK_SIZE - 4));
      const wx = cx * CHUNK_SIZE + lx;
      const wz = cz * CHUNK_SIZE + lz;
      const h = this.heightAt(wx, wz);
      if (h <= SEA + 1 || h > 38) continue; // no trees in water/beach/snow
      const trunkH = 4 + Math.floor(treeRng() * 3);
      // trunk
      for (let i = 1; i <= trunkH; i++) {
        if (h + i < CHUNK_HEIGHT) chunk.blocks[chunk.index(lx, h + i, lz)] = B.WOOD;
      }
      // leaves canopy (3x3x3 + cap)
      const top = h + trunkH;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = 0; dy <= 1; dy++) {
            const ax = lx + dx, ay = top - 1 + dy, az = lz + dz;
            if (ax < 0 || ax >= CHUNK_SIZE || az < 0 || az >= CHUNK_SIZE) continue;
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            if (ay < 0 || ay >= CHUNK_HEIGHT) continue;
            if (chunk.blocks[chunk.index(ax, ay, az)] === B.AIR) {
              chunk.blocks[chunk.index(ax, ay, az)] = B.LEAVES;
            }
          }
        }
      }
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const ax = lx + dx, ay = top + 1, az = lz + dz;
          if (ax < 0 || ax >= CHUNK_SIZE || az < 0 || az >= CHUNK_SIZE) continue;
          if (Math.abs(dx) + Math.abs(dz) === 2) continue;
          if (ay < CHUNK_HEIGHT && chunk.blocks[chunk.index(ax, ay, az)] === B.AIR) {
            chunk.blocks[chunk.index(ax, ay, az)] = B.LEAVES;
          }
        }
      }
    }

    chunk.dirty = true;
    this.chunks.set(this.key(cx, cz), chunk);
    return chunk;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.key(cx, cz));
  }

  // World-space block read (returns AIR for missing chunks)
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return B.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return B.AIR;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return chunk.blocks[chunk.index(lx, wy, lz)];
  }

  setBlock(wx, wy, wz, v) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    chunk.blocks[chunk.index(lx, wy, lz)] = v;
    chunk.dirty = true;
    // mark neighbors dirty if on boundary
    if (lx === 0) { const n = this.getChunk(cx - 1, cz); if (n) n.dirty = true; }
    if (lx === CHUNK_SIZE - 1) { const n = this.getChunk(cx + 1, cz); if (n) n.dirty = true; }
    if (lz === 0) { const n = this.getChunk(cx, cz - 1); if (n) n.dirty = true; }
    if (lz === CHUNK_SIZE - 1) { const n = this.getChunk(cx, cz + 1); if (n) n.dirty = true; }
  }

  isSolidAt(wx, wy, wz) {
    const id = this.getBlock(wx, wy, wz);
    if (id === B.AIR) return false;
    const def = BLOCKS[id];
    return def && def.solid;
  }

  // ---- Meshing ----
  buildMesh(chunk) {
    const solidPos = [], solidNorm = [], solidUv = [], solidIdx = [], solidCol = [];
    const tPos = [], tNorm = [], tUv = [], tIdx = [], tCol = [];
    let solidVtx = 0, tVtx = 0;

    const addFace = (transparent, x, y, z, dir, tile, light) => {
      const [u0, v0, u1, v1] = tileUV(tile);
      let verts, normal;
      // dir: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
      switch (dir) {
        case 0: // +X
          verts = [[1,0,0],[1,1,0],[1,1,1],[1,0,1]];
          normal = [1,0,0];
          break;
        case 1: // -X
          verts = [[0,0,1],[0,1,1],[0,1,0],[0,0,0]];
          normal = [-1,0,0];
          break;
        case 2: // +Y
          verts = [[0,1,1],[1,1,1],[1,1,0],[0,1,0]];
          normal = [0,1,0];
          break;
        case 3: // -Y
          verts = [[0,0,0],[1,0,0],[1,0,1],[0,0,1]];
          normal = [0,-1,0];
          break;
        case 4: // +Z
          verts = [[1,0,1],[1,1,1],[0,1,1],[0,0,1]];
          normal = [0,0,1];
          break;
        case 5: // -Z
          verts = [[0,0,0],[0,1,0],[1,1,0],[1,0,0]];
          normal = [0,0,-1];
          break;
      }
      const uvs = [[u0,v0],[u0,v1],[u1,v1],[u1,v0]];

      const arrPos = transparent ? tPos : solidPos;
      const arrNorm = transparent ? tNorm : solidNorm;
      const arrUv = transparent ? tUv : solidUv;
      const arrIdx = transparent ? tIdx : solidIdx;
      const arrCol = transparent ? tCol : solidCol;
      let vbase = transparent ? tVtx : solidVtx;

      for (let i = 0; i < 4; i++) {
        arrPos.push(x + verts[i][0], y + verts[i][1], z + verts[i][2]);
        arrNorm.push(normal[0], normal[1], normal[2]);
        arrUv.push(uvs[i][0], uvs[i][1]);
        arrCol.push(light, light, light);
      }
      arrIdx.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
      if (transparent) tVtx += 4; else solidVtx += 4;
    };

    // face shading: AO-ish per direction
    const faceLight = [0.78, 0.78, 1.0, 0.55, 0.86, 0.86];

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = chunk.blocks[chunk.index(x, y, z)];
          if (id === B.AIR) continue;
          const def = BLOCKS[id];
          const transparent = !!def.transparent || !!def.liquid;

          const wx = chunk.cx * CHUNK_SIZE + x;
          const wz = chunk.cz * CHUNK_SIZE + z;

          // 6 neighbors
          const nbs = [
            this.getBlock(wx + 1, y, wz),
            this.getBlock(wx - 1, y, wz),
            this.getBlock(wx, y + 1, wz),
            this.getBlock(wx, y - 1, wz),
            this.getBlock(wx, y, wz + 1),
            this.getBlock(wx, y, wz - 1),
          ];

          for (let f = 0; f < 6; f++) {
            const nb = nbs[f];
            // Render face if neighbor is air, or neighbor is transparent and different from us
            const nbDef = BLOCKS[nb];
            const nbAir = nb === B.AIR;
            const nbTransparent = nbDef && (nbDef.transparent || nbDef.liquid);
            let render = false;
            if (nbAir) render = true;
            else if (nbTransparent && nb !== id) render = true;
            // For transparent blocks against same id, skip (so leaves don't double-up)
            if (transparent && nb === id) render = false;

            if (render) {
              addFace(transparent, x, y, z, f, def.tiles[f], faceLight[f]);
            }
          }
        }
      }
    }

    // Dispose old meshes
    if (chunk.solidMesh) {
      this.scene.remove(chunk.solidMesh);
      chunk.solidMesh.geometry.dispose();
    }
    if (chunk.transparentMesh) {
      this.scene.remove(chunk.transparentMesh);
      chunk.transparentMesh.geometry.dispose();
    }

    if (solidPos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(solidPos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(solidNorm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(solidUv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(solidCol, 3));
      g.setIndex(solidIdx);
      const mesh = new THREE.Mesh(g, this.solidMaterial);
      mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk.solidMesh = mesh;
    } else {
      chunk.solidMesh = null;
    }
    if (tPos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(tNorm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(tUv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(tCol, 3));
      g.setIndex(tIdx);
      const mesh = new THREE.Mesh(g, this.transparentMaterial);
      mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk.transparentMesh = mesh;
    } else {
      chunk.transparentMesh = null;
    }
    chunk.dirty = false;
  }

  // Remesh dirty chunks per frame, throttled
  remeshDirty(maxPerFrame = 2) {
    let n = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        this.buildMesh(chunk);
        n++;
        if (n >= maxPerFrame) break;
      }
    }
  }

  ensureChunksAround(playerX, playerZ, radius, onProgress) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const want = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        want.push([pcx + dx, pcz + dz]);
      }
    }
    // Sort by distance
    want.sort((a, b) => (a[0]-pcx)**2 + (a[1]-pcz)**2 - ((b[0]-pcx)**2 + (b[1]-pcz)**2));
    let made = 0;
    for (const [cx, cz] of want) {
      if (!this.chunks.has(this.key(cx, cz))) {
        this.generateChunk(cx, cz);
        made++;
      }
    }
    // Unload far chunks
    for (const [k, ch] of this.chunks) {
      const d = Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cz - pcz));
      if (d > radius + 1) {
        if (ch.solidMesh) { this.scene.remove(ch.solidMesh); ch.solidMesh.geometry.dispose(); }
        if (ch.transparentMesh) { this.scene.remove(ch.transparentMesh); ch.transparentMesh.geometry.dispose(); }
        this.chunks.delete(k);
      }
    }
    return made;
  }
}

// ---------- Player ----------
class Player {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(0, 50, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.eyeHeight = PLAYER_HEIGHT - 0.2;
    this.width = PLAYER_WIDTH;
  }

  applyRotation() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  // AABB collision: clamp movement using world solid blocks
  move(world, dx, dy, dz) {
    // Move along each axis separately for clean axis-aligned response
    const half = this.width / 2;

    const collideAtY = (px, py, pz) => {
      const minX = Math.floor(px - half);
      const maxX = Math.floor(px + half);
      const minY = Math.floor(py);
      const maxY = Math.floor(py + PLAYER_HEIGHT - 0.001);
      const minZ = Math.floor(pz - half);
      const maxZ = Math.floor(pz + half);
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          for (let z = minZ; z <= maxZ; z++) {
            if (world.isSolidAt(x, y, z)) return true;
          }
        }
      }
      return false;
    };

    // X axis
    if (dx !== 0) {
      const newX = this.position.x + dx;
      if (!collideAtY(newX, this.position.y, this.position.z)) {
        this.position.x = newX;
      } else {
        this.velocity.x = 0;
      }
    }
    // Z axis
    if (dz !== 0) {
      const newZ = this.position.z + dz;
      if (!collideAtY(this.position.x, this.position.y, newZ)) {
        this.position.z = newZ;
      } else {
        this.velocity.z = 0;
      }
    }
    // Y axis
    if (dy !== 0) {
      const newY = this.position.y + dy;
      if (!collideAtY(this.position.x, newY, this.position.z)) {
        this.position.y = newY;
        this.onGround = false;
      } else {
        if (dy < 0) this.onGround = true;
        this.velocity.y = 0;
      }
    }
  }

  syncCamera() {
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    this.applyRotation();
  }
}

// ---------- Voxel raycast (DDA) ----------
function raycastVoxel(world, origin, dir, maxDist) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
  const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
  const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));

  const nextX = x + (dir.x > 0 ? 1 : 0);
  const nextY = y + (dir.y > 0 ? 1 : 0);
  const nextZ = z + (dir.z > 0 ? 1 : 0);

  let tMaxX = Math.abs((nextX - origin.x) / (dir.x || 1e-9));
  let tMaxY = Math.abs((nextY - origin.y) / (dir.y || 1e-9));
  let tMaxZ = Math.abs((nextZ - origin.z) / (dir.z || 1e-9));

  let face = null;
  let traveled = 0;

  while (traveled <= maxDist) {
    const id = world.getBlock(x, y, z);
    const def = BLOCKS[id];
    if (id !== B.AIR && def && def.solid) {
      return { hit: true, x, y, z, face };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; traveled = tMaxX; tMaxX += tDeltaX;
      face = stepX > 0 ? [-1, 0, 0] : [1, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY; traveled = tMaxY; tMaxY += tDeltaY;
      face = stepY > 0 ? [0, -1, 0] : [0, 1, 0];
    } else {
      z += stepZ; traveled = tMaxZ; tMaxZ += tDeltaZ;
      face = stepZ > 0 ? [0, 0, -1] : [0, 0, 1];
    }
  }
  return { hit: false };
}

// ---------- Block icon renderer (for hotbar) ----------
function renderBlockIcon(blockId) {
  // Render a 40x40 isometric-ish block using 2D canvas
  const def = BLOCKS[blockId];
  const c = document.createElement('canvas');
  c.width = 40; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Draw three quads for the visible faces using atlas tiles (top, side-right, side-front)
  const atlas = atlasCanvas;
  const tileSrc = (idx) => {
    const tx = (idx % ATLAS_COLS) * TILE;
    const ty = Math.floor(idx / ATLAS_COLS) * TILE;
    return [tx, ty, TILE, TILE];
  };

  // Simple top-down + side draw at iso angle
  // Top face (lighter)
  ctx.save();
  ctx.translate(20, 8);
  ctx.transform(1, 0.5, -1, 0.5, 0, 0);
  const [tx, ty, tw, th] = tileSrc(def.tiles[2]);
  ctx.drawImage(atlas, tx, ty, tw, th, 0, 0, 16, 16);
  ctx.restore();

  // Front-right (-Z face uses tile index 5, but in iso we want side: use tile 4 +Z)
  ctx.save();
  ctx.translate(20, 16);
  ctx.transform(1, 0.5, 0, 1, 0, 0);
  const [tx2, ty2, tw2, th2] = tileSrc(def.tiles[4]);
  ctx.drawImage(atlas, tx2, ty2, tw2, th2, 0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 16, 16);
  ctx.restore();

  // Front-left
  ctx.save();
  ctx.translate(4, 24);
  ctx.transform(1, -0.5, 0, 1, 0, 0);
  const [tx3, ty3, tw3, th3] = tileSrc(def.tiles[0]);
  ctx.drawImage(atlas, tx3, ty3, tw3, th3, 0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, 0, 16, 16);
  ctx.restore();

  return c;
}

// ---------- Main game ----------
let atlasCanvas; // global so block icons can read

async function main() {
  // Build atlas
  atlasCanvas = buildAtlas();
  const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
  atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.needsUpdate = true;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('canvas-wrap').appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ecae6);
  scene.fog = new THREE.Fog(0x9ecae6, CHUNK_SIZE * 1.5, CHUNK_SIZE * (RENDER_DISTANCE + 0.5));

  // Camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

  // Lights
  const sun = new THREE.DirectionalLight(0xfff5d6, 1.0);
  sun.position.set(50, 80, 30);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xb6c5e3, 0.55);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xa0c8ff, 0x6b5a3a, 0.35);
  scene.add(hemi);

  // World
  const world = new World(scene, atlasTexture);
  const player = new Player(camera);

  // Spawn at world origin's surface
  const spawnH = world.heightAt(0, 0);
  player.position.set(0.5, spawnH + 2, 0.5);
  player.syncCamera();

  // Initial chunks
  const loaderFill = document.getElementById('loader-fill');
  const loaderText = document.getElementById('loader-text');
  const total = (RENDER_DISTANCE * 2 + 1) ** 2;
  let generated = 0;

  const generateInitial = () => {
    return new Promise((resolve) => {
      const tick = () => {
        const before = world.chunks.size;
        // Generate up to a few chunks per tick
        const pcx = 0, pcz = 0;
        let made = 0;
        const want = [];
        for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
          for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
            const k = world.key(pcx + dx, pcz + dz);
            if (!world.chunks.has(k)) want.push([pcx + dx, pcz + dz]);
          }
        }
        want.sort((a, b) => (a[0]**2 + a[1]**2) - (b[0]**2 + b[1]**2));
        for (let i = 0; i < 3 && i < want.length; i++) {
          world.generateChunk(want[i][0], want[i][1]);
          made++;
        }
        generated = world.chunks.size;
        loaderFill.style.width = `${Math.min(100, (generated / total) * 100)}%`;
        loaderText.textContent = `Building chunks… ${generated}/${total}`;
        if (generated >= total) {
          // mesh them all
          for (const ch of world.chunks.values()) world.buildMesh(ch);
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();
    });
  };

  await generateInitial();

  // Hide loading, reveal start screen (start was visible behind loading already)
  document.getElementById('loading-screen').classList.add('hidden');

  // ---- HUD: hotbar ----
  const hotbarEl = document.getElementById('hotbar');
  let activeSlot = 0;
  const slotEls = [];
  for (let i = 0; i < HOTBAR.length; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === 0 ? ' active' : '');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    slot.appendChild(num);
    const icon = renderBlockIcon(HOTBAR[i]);
    slot.appendChild(icon);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = BLOCKS[HOTBAR[i]].name;
    slot.appendChild(name);
    hotbarEl.appendChild(slot);
    slotEls.push(slot);
  }
  function setActiveSlot(i) {
    activeSlot = ((i % HOTBAR.length) + HOTBAR.length) % HOTBAR.length;
    slotEls.forEach((s, j) => s.classList.toggle('active', j === activeSlot));
  }

  // ---- Input ----
  const keys = new Set();
  let pointerLocked = false;
  let paused = false;

  const startScreen = document.getElementById('start-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const hud = document.getElementById('hud');
  const debugEl = document.getElementById('debug');
  let debugVisible = false;

  function showHud() { hud.classList.remove('hidden'); }
  function hideHud() { hud.classList.add('hidden'); }

  document.getElementById('play-btn').addEventListener('click', () => {
    startScreen.classList.add('hidden');
    showHud();
    requestPointer();
  });
  document.getElementById('resume-btn').addEventListener('click', () => {
    pauseScreen.classList.add('hidden');
    paused = false;
    requestPointer();
  });

  function requestPointer() {
    const el = renderer.domElement;
    el.requestPointerLock = el.requestPointerLock || el.mozRequestPointerLock;
    if (el.requestPointerLock) {
      try { el.requestPointerLock(); } catch (e) {}
    }
  }

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === renderer.domElement);
    if (!pointerLocked && !startScreen.classList.contains('hidden') === false) {
      // if we've started the game and lock dropped, show pause
      if (startScreen.classList.contains('hidden')) {
        paused = true;
        pauseScreen.classList.remove('hidden');
      }
    }
  });

  // Click anywhere on canvas during play to re-grab pointer
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (startScreen.classList.contains('hidden') === false) return;
    if (paused) {
      pauseScreen.classList.add('hidden');
      paused = false;
      requestPointer();
      return;
    }
    if (!pointerLocked) {
      requestPointer();
      return;
    }
    handleClick(e.button);
  });

  // Mouse look
  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked || paused) return;
    const sensitivity = 0.0022;
    player.yaw -= e.movementX * sensitivity;
    player.pitch -= e.movementY * sensitivity;
    const limit = Math.PI / 2 - 0.001;
    player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!startScreen.classList.contains('hidden')) return;
      paused = true;
      pauseScreen.classList.remove('hidden');
      if (document.exitPointerLock) document.exitPointerLock();
      return;
    }
    if (e.code === 'F3' || e.key === 'F3') {
      debugVisible = !debugVisible;
      debugEl.classList.toggle('hidden', !debugVisible);
      e.preventDefault();
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      player.flying = !player.flying;
      player.velocity.set(0, 0, 0);
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < HOTBAR.length) setActiveSlot(idx);
      return;
    }
    keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });
  document.addEventListener('wheel', (e) => {
    if (paused || !pointerLocked) return;
    if (e.deltaY > 0) setActiveSlot(activeSlot + 1);
    else if (e.deltaY < 0) setActiveSlot(activeSlot - 1);
    e.preventDefault();
  }, { passive: false });

  // Resize
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // Block break/place
  function handleClick(button) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone();
    const r = raycastVoxel(world, origin, dir, REACH);
    if (!r.hit) return;
    if (button === 0) {
      // break
      world.setBlock(r.x, r.y, r.z, B.AIR);
    } else if (button === 2) {
      // place
      const px = r.x + r.face[0];
      const py = r.y + r.face[1];
      const pz = r.z + r.face[2];
      // don't place inside player
      const half = player.width / 2;
      const minX = Math.floor(player.position.x - half), maxX = Math.floor(player.position.x + half);
      const minY = Math.floor(player.position.y), maxY = Math.floor(player.position.y + PLAYER_HEIGHT - 0.001);
      const minZ = Math.floor(player.position.z - half), maxZ = Math.floor(player.position.z + half);
      if (px >= minX && px <= maxX && py >= minY && py <= maxY && pz >= minZ && pz <= maxZ) return;
      if (world.getBlock(px, py, pz) !== B.AIR) return;
      world.setBlock(px, py, pz, HOTBAR[activeSlot]);
    }
  }

  // Suppress context menu so right-click can place
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- Block highlight (selection wireframe) ----
  const highlightGeom = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  const highlightEdges = new THREE.EdgesGeometry(highlightGeom);
  const highlightMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 });
  const highlight = new THREE.LineSegments(highlightEdges, highlightMat);
  highlight.visible = false;
  scene.add(highlight);

  // ---- Day/night cycle ----
  let timeOfDay = 0.25; // 0..1, 0.25 = morning

  // ---- Game loop ----
  const clock = new THREE.Clock();
  let fps = 0, frames = 0, lastFpsTime = performance.now();

  function update(dt) {
    if (paused) return;

    // Movement input
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const move = new THREE.Vector3();
    if (keys.has('KeyW')) move.add(forward);
    if (keys.has('KeyS')) move.sub(forward);
    if (keys.has('KeyA')) move.sub(right);
    if (keys.has('KeyD')) move.add(right);
    if (move.lengthSq() > 0) move.normalize();

    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');

    if (player.flying) {
      const speed = FLY_SPEED * (sprint ? 1.7 : 1);
      const vx = move.x * speed;
      const vz = move.z * speed;
      let vy = 0;
      if (keys.has('Space')) vy += speed;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) vy -= speed * 0.6; // already factored into sprint, but ok
      // override: if both shift+space, prefer up
      if (keys.has('Space') && (keys.has('ShiftLeft') || keys.has('ShiftRight'))) vy = speed;
      else if (!keys.has('Space') && (keys.has('ShiftLeft') || keys.has('ShiftRight'))) vy = -speed;
      player.move(world, vx * dt, vy * dt, vz * dt);
    } else {
      const speed = (sprint ? SPRINT_SPEED : WALK_SPEED);
      // horizontal velocity is direct (no inertia for crisp control)
      player.velocity.x = move.x * speed;
      player.velocity.z = move.z * speed;
      // gravity
      player.velocity.y -= GRAVITY * dt;
      if (player.velocity.y < -50) player.velocity.y = -50;

      // jump
      if (keys.has('Space') && player.onGround) {
        player.velocity.y = JUMP_VELOCITY;
        player.onGround = false;
      }
      player.move(world, player.velocity.x * dt, player.velocity.y * dt, player.velocity.z * dt);
      // small "ground check" — try moving down a hair to detect ground
      if (player.velocity.y === 0) {
        const probe = -0.05;
        const before = player.position.y;
        player.move(world, 0, probe, 0);
        if (player.position.y === before) player.onGround = true;
        else { player.position.y = before; }
      }
    }

    // catch fall-through: respawn if very low
    if (player.position.y < -10) {
      player.position.set(0.5, world.heightAt(0, 0) + 3, 0.5);
      player.velocity.set(0, 0, 0);
    }

    player.syncCamera();

    // Stream chunks
    world.ensureChunksAround(player.position.x, player.position.z, RENDER_DISTANCE);
    world.remeshDirty(2);

    // Raycast for highlight
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const r = raycastVoxel(world, camera.position, dir, REACH);
    if (r.hit) {
      highlight.visible = true;
      highlight.position.set(r.x + 0.5, r.y + 0.5, r.z + 0.5);
    } else {
      highlight.visible = false;
    }

    // Day/night cycle (very slow): one full day every ~6 minutes
    timeOfDay = (timeOfDay + dt / 360) % 1;
    const sunAngle = timeOfDay * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    sun.position.set(sunX * 100, sunY * 100, 30);
    const dayBlend = Math.max(0, Math.min(1, sunY * 1.5 + 0.4));
    sun.intensity = 0.2 + dayBlend * 0.9;
    ambient.intensity = 0.25 + dayBlend * 0.4;
    const dayCol = new THREE.Color(0x8ecae6);
    const nightCol = new THREE.Color(0x0a1828);
    const skyCol = nightCol.clone().lerp(dayCol, dayBlend);
    scene.background = skyCol;
    scene.fog.color.copy(skyCol);

    // Debug overlay
    if (debugVisible) {
      const cx = Math.floor(player.position.x / CHUNK_SIZE);
      const cz = Math.floor(player.position.z / CHUNK_SIZE);
      const lookBlock = r.hit ? `${BLOCKS[world.getBlock(r.x, r.y, r.z)]?.name || '?'} @ ${r.x},${r.y},${r.z}` : '—';
      debugEl.textContent =
`Voxelcraft (debug)
FPS: ${fps}
XYZ: ${player.position.x.toFixed(2)} / ${player.position.y.toFixed(2)} / ${player.position.z.toFixed(2)}
Chunk: ${cx}, ${cz}    Loaded: ${world.chunks.size}
Yaw/Pitch: ${(player.yaw * 180/Math.PI).toFixed(0)}° / ${(player.pitch * 180/Math.PI).toFixed(0)}°
Mode: ${player.flying ? 'Flying' : 'Walking'}
Time: ${(timeOfDay * 24).toFixed(1)}h
Looking at: ${lookBlock}
Holding: ${BLOCKS[HOTBAR[activeSlot]].name}`;
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    update(dt);
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - lastFpsTime >= 500) {
      fps = Math.round((frames * 1000) / (now - lastFpsTime));
      frames = 0;
      lastFpsTime = now;
    }
  }
  loop();

  // Expose for testing
  window.__game = { world, player, camera, scene, renderer, BLOCKS, B, HOTBAR };
}

main().catch((err) => {
  console.error(err);
  const ld = document.getElementById('loading-screen');
  ld.innerHTML = `<div class="start-card"><h2 class="logo small">ERROR</h2><p class="hint">${err.message}</p></div>`;
});
