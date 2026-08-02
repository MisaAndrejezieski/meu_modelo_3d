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

          // 1. Extração de luminância e mapeamento anatômico em camadas
          const rawMap = new Float32Array(cols * rows);
          let minLum = 1.0, maxLum = 0.0;

          for (let i = 0; i < cols * rows; i++) {
            const pIdx = i * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            // Luminância padrão
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            rawMap[i] = lum;
            if (lum < minLum) minLum = lum;
            if (lum > maxLum) maxLum = lum;
          }

          // 2. Detecção de Fundo Neutro para isolar o busto
          const bgR = data[0], bgG = data[1], bgB = data[2];
          const bgLum = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) / 255;

          // 3. Suavização de malha para manter transições orgânicas sem degraus
          const heightMap = new Float32Array(cols * rows);
          const blurRadius = 2;

          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              let sum = 0;
              let weightSum = 0;

              for (let ky = -blurRadius; ky <= blurRadius; ky++) {
                for (let kx = -blurRadius; kx <= blurRadius; kx++) {
                  const nx = x + kx;
                  const ny = y + ky;
                  if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                    const weight = 1 / (1 + Math.abs(kx) + Math.abs(ky));
                    sum += rawMap[ny * cols + nx] * weight;
                    weightSum += weight;
                  }
                }
              }
              heightMap[y * cols + x] = sum / weightSum;
            }
          }

          // 4. Construção da Malha 3D com Hierarquia de Volumes (Nariz, Seios, Renda e Texturas)
          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          for (let i = 0; i < positions.count; i++) {
            const lum = heightMap[i];
            let z = 0;

            // Se o pixel fizer parte da figura e não do fundo plano
            if (Math.abs(lum - bgLum) > 0.05) {
              // Normaliza a altura focando na hierarquia de relevo da escultura
              const normalized = 1.0 - ((lum - minLum) / (maxLum - minLum || 1));
              
              // Curva exponencial ajustada para destacar volumes avantajados (seios) e proeminências (nariz)
              // enquanto preserva as micro-texturas da renda do vestido por cima da pele
              const volumetricProfile = Math.pow(Math.max(0, normalized), 1.35);
              z = volumetricProfile * maxDepthMm;
            } else {
              z = 0; // Base traseira estritamente plana
            }

            positions.setZ(i, z);
          }

          geometry.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            color: 0x1d4ed8,
            roughness: 0.3,
            metalness: 0.1,
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