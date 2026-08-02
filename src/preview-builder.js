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

          // 1. Extração de Luminância Avançada para Anatomia e Volumes
          const heightMap = new Float32Array(cols * rows);
          let minVal = 255, maxVal = 0;

          for (let i = 0; i < cols * rows; i++) {
            const pIdx = i * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            // Conversão ponderada para destacar sombras e luzes da escultura 3D
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            heightMap[i] = gray;
            if (gray < minVal) minVal = gray;
            if (gray > maxVal) maxVal = gray;
          }

          // 2. Normalização e Detecção de Fundo Neutro
          // Identifica a cor predominante do fundo para isolar a peça perfeitamente
          const bgR = data[0], bgG = data[1], bgB = data[2];
          const bgGray = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          for (let i = 0; i < positions.count; i++) {
            const gray = heightMap[i];
            let z = 0;

            // Se o pixel difere significativamente do fundo, ele pertence ao modelo 3D
            if (Math.abs(gray - bgGray) > 12) {
              // Normaliza a altura com foco em preservar as curvas suaves da pele e busto
              const normalized = (gray - minVal) / (maxVal - minVal || 1);
              
              // Perfil cúbico refinado para dar densidade e relevo encorpado à escultura
              const organicProfile = Math.pow(normalized, 1.4);
              z = organicProfile * maxDepthMm;
            } else {
              z = 0; // Base estritamente plana no eixo zero
            }

            positions.setZ(i, z);
          }

          geometry.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            color: 0xd69e2e,
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