import * as THREE from 'three';

export function buildSVGPreview(file, widthMm, cutDepth) {
  return new Promise((resolve) => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(widthMm, widthMm * 0.75, cutDepth);
    const material = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.5 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -cutDepth / 2;
    group.add(mesh);

    resolve({
      group,
      metadata: { depthMm: cutDepth }
    });
  });
}

export function buildRasterPreview(file, widthMm, maxDepthMm, resolution) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const cols = resolution;
          const rows = Math.round(resolution * (img.height / img.width));
          canvas.width = cols;
          canvas.height = rows;

          // ============================================================
          // PASSO 1: DETECÇÃO AUTOMÁTICA DE FUNDO
          // ============================================================
          // Desenha e analisa a imagem para encontrar o fundo dominante
          ctx.drawImage(img, 0, 0, cols, rows);
          const imgData = ctx.getImageData(0, 0, cols, rows);
          const data = imgData.data;

          // Mapeia a luminância de cada pixel
          const lumMap = new Float32Array(cols * rows);
          let maxLum = 0;
          let minLum = 1;

          for (let i = 0; i < cols * rows; i++) {
            const pIdx = i * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            lumMap[i] = lum;
            if (lum > maxLum) maxLum = lum;
            if (lum < minLum) minLum = lum;
          }

          // ============================================================
          // PASSO 2: BINARIZAÇÃO COM OTSU - THRESHOLD ADAPTATIVO
          // ============================================================
          // Encontra o melhor limiar para separar figura do fundo
          // Usando o método de Otsu (análise de histograma)
          const hist = new Array(256).fill(0);
          for (let i = 0; i < cols * rows; i++) {
            const val = Math.floor(lumMap[i] * 255);
            hist[val]++;
          }

          let totalPixels = cols * rows;
          let sum = 0;
          for (let i = 0; i < 256; i++) sum += i * hist[i];

          let sumB = 0;
          let wB = 0;
          let wF = 0;
          let varMax = 0;
          let threshold = 0;

          for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) continue;
            wF = totalPixels - wB;
            if (wF === 0) break;

            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const varBetween = wB * wF * (mB - mF) * (mB - mF);

            if (varBetween > varMax) {
              varMax = varBetween;
              threshold = t;
            }
          }

          const otsuThreshold = threshold / 255;

          // Matriz binária: 1 = figura, 0 = fundo
          const binaryMap = new Float32Array(cols * rows);
          for (let i = 0; i < cols * rows; i++) {
            binaryMap[i] = lumMap[i] < otsuThreshold ? 1.0 : 0.0;
          }

          // ============================================================
          // PASSO 3: PREENCHIMENTO DE FUROS (Flood Fill / Closing)
          // ============================================================
          // Remove pequenos buracos internos (como olhos, bocas, etc)
          const closedMap = new Float32Array(binaryMap);
          
          // Passada de dilatação (preenche buracos pequenos)
          const kernelSize = Math.max(1, Math.floor(Math.min(cols, rows) / 200));
          for (let iter = 0; iter < 2; iter++) {
            const temp = new Float32Array(closedMap);
            for (let y = kernelSize; y < rows - kernelSize; y++) {
              for (let x = kernelSize; x < cols - kernelSize; x++) {
                const idx = y * cols + x;
                let sum = 0;
                let count = 0;
                for (let ky = -kernelSize; ky <= kernelSize; ky++) {
                  for (let kx = -kernelSize; kx <= kernelSize; kx++) {
                    sum += temp[(y + ky) * cols + (x + kx)];
                    count++;
                  }
                }
                closedMap[idx] = sum / count > 0.5 ? 1.0 : 0.0;
              }
            }
          }

          // ============================================================
          // PASSO 4: TRANSFORMADA DE DISTÂNCIA EUCLIDIANA (SDF)
          // ============================================================
          const distMap = new Float32Array(cols * rows);
          const INF = 1e9;

          for (let i = 0; i < cols * rows; i++) {
            distMap[i] = closedMap[i] === 0 ? 0 : INF;
          }

          // Passada Forward
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const idx = y * cols + x;
              if (closedMap[idx] > 0) {
                let d = distMap[idx];
                if (x > 0) d = Math.min(d, distMap[y * cols + (x - 1)] + 1);
                if (y > 0) d = Math.min(d, distMap[(y - 1) * cols + x] + 1);
                if (x > 0 && y > 0) d = Math.min(d, distMap[(y - 1) * cols + (x - 1)] + 1.414);
                if (x < cols - 1 && y > 0) d = Math.min(d, distMap[(y - 1) * cols + (x + 1)] + 1.414);
                distMap[idx] = d;
              }
            }
          }

          // Passada Backward
          for (let y = rows - 1; y >= 0; y--) {
            for (let x = cols - 1; x >= 0; x--) {
              const idx = y * cols + x;
              if (closedMap[idx] > 0) {
                let d = distMap[idx];
                if (x < cols - 1) d = Math.min(d, distMap[y * cols + (x + 1)] + 1);
                if (y < rows - 1) d = Math.min(d, distMap[(y + 1) * cols + x] + 1);
                if (x < cols - 1 && y < rows - 1) d = Math.min(d, distMap[(y + 1) * cols + (x + 1)] + 1.414);
                if (x > 0 && y < rows - 1) d = Math.min(d, distMap[(y + 1) * cols + (x - 1)] + 1.414);
                distMap[idx] = d;
              }
            }
          }

          let maxDist = 1.0;
          for (let i = 0; i < cols * rows; i++) {
            if (distMap[i] > maxDist && distMap[i] < INF) maxDist = distMap[i];
          }

          // ============================================================
          // PASSO 5: CONSTRUÇÃO DA MALHA 3D
          // ============================================================
          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          for (let i = 0; i < positions.count; i++) {
            const dist = distMap[i];
            let z = 0;

            if (dist > 0 && dist < INF) {
              const t = Math.min(1.0, dist / maxDist);
              // Perfil suave em domo para volumes orgânicos
              const profile = Math.pow(Math.sin(t * Math.PI / 2), 0.9);
              z = profile * maxDepthMm;
            } else {
              z = 0;
            }

            positions.setZ(i, z);
          }

          geometry.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            color: 0xd69e2e,
            roughness: 0.35,
            metalness: 0.05,
            side: THREE.DoubleSide,
            flatShading: false
          });

          const mesh = new THREE.Mesh(geometry, material);
          const group = new THREE.Group();
          group.add(mesh);

          resolve({
            group,
            metadata: {
              imageData: data,
              cols,
              rows,
              heightMm,
              maxHeightMm: maxDepthMm
            }
          });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}