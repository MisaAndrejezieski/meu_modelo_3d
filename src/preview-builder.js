import * as THREE from 'three';

export function buildRasterPreview(file, widthMm, maxDepthMm, resolution) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // REDUÇÃO DE RESOLUÇÃO PARA O VISUALIZADOR NÃO TRAVAR
          // Se o usuário pediu 500, mas o navegador vai travar, limitamos a 300.
          const safeResolution = Math.min(resolution, 300); 
          const cols = safeResolution;
          const rows = Math.round(safeResolution * (img.height / img.width));
          
          canvas.width = cols;
          canvas.height = rows;

          ctx.drawImage(img, 0, 0, cols, rows);
          const imgData = ctx.getImageData(0, 0, cols, rows);
          const data = imgData.data;

          // 1. Extração de luminância
          const rawMap = new Float32Array(cols * rows);
          for (let i = 0; i < cols * rows; i++) {
            const pIdx = i * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            rawMap[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          }

          // 2. Suavização Avançada (Aqui estão seus barrancos de tecido)
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

          // Encontrar o valor máximo de brilho para normalizar
          let maxLum = 0;
          for(let i = 0; i < heightMap.length; i++) {
            if(heightMap[i] > maxLum) maxLum = heightMap[i];
          }

          for (let i = 0; i < positions.count; i++) {
            const lum = heightMap[i];
            // Inverte para que o mais escuro seja o mais fundo
            // E garante que o ponto mais alto seja o nível 0 (sem furar a porta)
            const z = (1.0 - (lum / maxLum)) * maxDepthMm;
            positions.setZ(i, -z); // Coloca o Z para baixo no visualizador
          }

          geometry.computeVertexNormals();

          // Material mais bonito para o seu visualizador
          const material = new THREE.MeshStandardMaterial({
            color: 0xd4af37, // Dourado para ficar bonito na tela
            roughness: 0.6,
            metalness: 0.3,
            side: THREE.DoubleSide,
            flatShading: false
          });

          const mesh = new THREE.Mesh(geometry, material);
          const group = new THREE.Group();
          group.add(mesh);

          // Rotaciona para ficar deitado como na tela da máquina
          group.rotation.x = -Math.PI / 2;

          resolve({
            group,
            metadata: {
              cols,
              rows,
              heightMm,
              maxDepthMm
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