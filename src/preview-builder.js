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

          ctx.drawImage(img, 0, 0, cols, rows);
          const imgData = ctx.getImageData(0, 0, cols, rows);
          const data = imgData.data;

          // 1. Extração e Normalização de Luminância
          const lumMap = new Float32Array(cols * rows);
          for (let i = 0; i < cols * rows; i++) {
            const pIdx = i * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            // Luminância padrão invertida para que áreas escuras/traços ganhem altura
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            lumMap[i] = lum;
          }

          // 2. Limiar Adaptativo Automático (Otsu) para isolar o fundo da peça
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

          // 3. Suavização Gaussiana leve para eliminar texturas barulhentas (como rendas) 
          // preservando os volumes anatômicos e letras cursivas
          const smoothMap = new Float32Array(cols * rows);
          const radius = 1;
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              let sumVal = 0;
              let count = 0;
              for (let ky = -radius; ky <= radius; ky++) {
                for (let kx = -radius; kx <= radius; kx++) {
                  const nx = x + kx;
                  const ny = y + ky;
                  if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                    sumVal += lumMap[ny * cols + nx];
                    count++;
                  }
                }
              }
              smoothMap[y * cols + x] = sumVal / count;
            }
          }

          // 4. Construção da Malha 3D Híbrida (Anatomia + Cursivas + Base Plana)
          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          for (let i = 0; i < positions.count; i++) {
            const lum = smoothMap[i];
            let z = 0;

            // Se o pixel estiver abaixo do limiar de fundo (ou seja, faz parte do desenho/texto)
            if (lum < (otsuThreshold * 0.98)) {
              // Intensidade proporcional baseada no sombreamento interno da arte
              const intensity = 1.0 - (lum / otsuThreshold);
              // Curva exponencial balanceada para dar volume orgânico às curvas e nitidez às letras
              const profile = Math.pow(Math.max(0, intensity), 1.2);
              z = profile * maxDepthMm;
            } else {
              z = 0; // Fundo estritamente plano na base zero
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