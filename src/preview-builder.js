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

          // 1. Desenha a imagem base
          ctx.drawImage(img, 0, 0, cols, rows);
          const imgData = ctx.getImageData(0, 0, cols, rows);
          const data = imgData.data;

          // 2. Extrai luminância e aplica matriz de suavização para eliminar ruídos internos (como rendas e texturas)
          const lumMap = new Float32Array(cols * rows);
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const idx = y * cols + x;
              const pIdx = idx * 4;
              const r = data[pIdx];
              const g = data[pIdx + 1];
              const b = data[pIdx + 2];
              // Luminância invertida: silhueta/corpo ganha peso
              const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
              lumMap[idx] = lum;
            }
          }

          // Filtro de Média Local (Box Blur Avançado) para criar volumes orgânicos contínuos e sem espinhos
          const smoothMap = new Float32Array(cols * rows);
          const radius = Math.max(2, Math.floor(cols / 60)); // Raio proporcional à resolução

          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              let sum = 0;
              let count = 0;
              for (let ky = -radius; ky <= radius; ky++) {
                for (let kx = -radius; kx <= radius; kx++) {
                  const nx = x + kx;
                  const ny = y + ky;
                  if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                    sum += lumMap[ny * cols + nx];
                    count++;
                  }
                }
              }
              smoothMap[y * cols + x] = sum / count;
            }
          }

          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          // 3. Mapeamento Geométrico Final para a Malha 3D
          for (let i = 0; i < positions.count; i++) {
            const xIdx = i % cols;
            const yIdx = Math.floor(i / cols);
            const idx = yIdx * cols + xIdx;
            
            const smoothedLum = smoothMap[idx];
            let z = 0;

            // Isola o fundo claro e aplica relevo suave e progressivo nas formas e letras
            if (smoothedLum < 0.95) {
              // Normaliza a profundidade criando um domo/curva anatômica natural
              const depthFactor = 1.0 - (smoothedLum / 0.95);
              z = Math.pow(depthFactor, 1.2) * maxDepthMm;
            } else {
              z = 0; // Base estritamente plana
            }

            positions.setZ(i, z);
          }

          geometry.computeVertexNormals();

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