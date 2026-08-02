import * as THREE from 'three';

export function buildSVGPreview(file, widthMm, cutDepth) {
  return new Promise((resolve) => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(widthMm, widthMm * 0.75, cutDepth);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x4a5568, 
      roughness: 0.5, 
      side: THREE.DoubleSide 
    });
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

          // CORREÇÃO 1: Segurança para o navegador não travar
          const safeResolution = Math.min(resolution, 300);
          const cols = safeResolution;
          const rows = Math.round(safeResolution * (img.height / img.width));
          canvas.width = cols;
          canvas.height = rows;

          ctx.drawImage(img, 0, 0, cols, rows);
          const imgData = ctx.getImageData(0, 0, cols, rows);
          const data = imgData.data;

          // 1. Extração inicial de luminância
          const rawMap = new Float32Array(cols * rows);
          for (let i = 0; i < cols * rows; i++) {
            const pIdx = i * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            rawMap[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          }

          // 2. Suavização Avançada por Matriz (Taludes e barrancos)
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

          // 3. Construção da malha
          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          // Pega o maior brilho para usar como referência zero (não furar a porta)
          let maxLum = 0;
          for(let i = 0; i < heightMap.length; i++) {
            if(heightMap[i] > maxLum) maxLum = heightMap[i];
          }

          for (let i = 0; i < positions.count; i++) {
            const lum = heightMap[i];
            // CORREÇÃO DE PROFUNDIDADE: O mais claro fica em 0, o mais escuro desce
            const z = (1.0 - (lum / maxLum)) * maxDepthMm;
            positions.setZ(i, -z); 
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

          // CORREÇÃO 2: A MALDITA ROTAÇÃO PARA O VISUALIZADOR ENXERGAR
          // Isso deita o plano no chão para a câmera ver de cima
          group.rotation.x = -Math.PI / 2;

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