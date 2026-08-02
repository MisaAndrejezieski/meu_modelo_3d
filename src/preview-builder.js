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

          // Desenha a imagem redimensionada para a resolução escolhida
          ctx.drawImage(img, 0, 0, cols, rows);
          const imgData = ctx.getImageData(0, 0, cols, rows);
          const data = imgData.data;

          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          // Encontra o tom mais claro da imagem para usá-lo automaticamente como referência de fundo
          let minLum = 1.0;
          let maxLum = 0.0;

          for (let i = 0; i < positions.count; i++) {
            const pIdx = i * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            if (lum < minLum) minLum = lum;
            if (lum > maxLum) maxLum = lum;
          }

          // Constrói os volumes 3D baseados na densidade real da imagem
          for (let i = 0; i < positions.count; i++) {
            const pIdx = i * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            
            let z = 0;
            
            // Tratamento dinâmico: pixels mais claros que o limiar do fundo ficam zerados (base plana)
            // Textos, traços e volumes corpóreos ganham altura tridimensional proporcional
            if (lum < 0.96) {
              // Normaliza a intensidade entre 0 e 1 com base no brilho
              const intensity = Math.max(0, 1.0 - (lum / 0.96));
              
              // Curva matemática exponencial (Power) para dar volume encorpado e suave às curvas e letras
              z = Math.pow(intensity, 1.4) * maxDepthMm;
            } else {
              z = 0; // Fundo estritamente plano na base
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