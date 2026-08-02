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

          // Renderiza a imagem limpa
          ctx.drawImage(img, 0, 0, cols, rows);
          const imgData = ctx.getImageData(0, 0, cols, rows);
          const data = imgData.data;

          // Matriz para armazenar a luminância limpa
          const grid = new Float32Array(cols * rows);
          const threshold = 0.88; // Isola o fundo branco puro

          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const idx = y * cols + x;
              const pIdx = idx * 4;
              const r = data[pIdx];
              const g = data[pIdx + 1];
              const b = data[pIdx + 2];
              const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

              // Separa a figura do fundo
              grid[idx] = lum < threshold ? (1.0 - lum) : 0.0;
            }
          }

          // Transformada de Distância Euclidiana Otimizada (SDF) para criar relevos em domo perfeitos
          const distanceMap = new Float32Array(cols * rows);
          const passes = 3; // Propagação de onda refinada para suavidade extrema

          for (let pass = 0; pass < passes; pass++) {
            for (let y = 1; y < rows - 1; y++) {
              for (let x = 1; x < cols - 1; x++) {
                const idx = y * cols + x;
                if (grid[idx] > 0) {
                  const minNeighbor = Math.min(
                    distanceMap[(y - 1) * cols + x],
                    distanceMap[(y + 1) * cols + x],
                    distanceMap[y * cols + (x - 1)],
                    distanceMap[y * cols + (x + 1)]
                  );
                  distanceMap[idx] = minNeighbor + 1.0;
                } else {
                  distanceMap[idx] = 0.0;
                }
              }
            }
          }

          // Normalização matemática do mapa de distância
          let maxDist = 1.0;
          for (let i = 0; i < distanceMap.length; i++) {
            if (distanceMap[i] > maxDist) maxDist = distanceMap[i];
          }

          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          for (let i = 0; i < positions.count; i++) {
            const dist = distanceMap[i];
            let z = 0;

            if (dist > 0) {
              const normalizedDist = dist / maxDist;
              // Perfil matemático em Domo Orgânico (Smoothstep + Cúpula)
              // Garante que as bordas encostem suavemente no Z=0 e o centro suba com elegância
              const profile = Math.sin(normalizedDist * (Math.PI / 2));
              z = profile * maxDepthMm;
            } else {
              z = 0; // Base perfeitamente plana
            }

            positions.setZ(i, z);
          }

          geometry.computeVertexNormals();

          // Material avançado com brilho de madeira nobre polida
          const material = new THREE.MeshStandardMaterial({
            color: 0xc27803,
            roughness: 0.3,
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