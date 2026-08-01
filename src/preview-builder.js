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

          // Suavização leve para evitar picos na malha
          ctx.filter = 'blur(2px)';
          ctx.drawImage(img, 0, 0, cols, rows);

          const imgData = ctx.getImageData(0, 0, cols, rows);
          const data = imgData.data;

          const heightMm = widthMm * (rows / cols);
          const geometry = new THREE.PlaneGeometry(widthMm, heightMm, cols - 1, rows - 1);
          const positions = geometry.attributes.position;

          for (let i = 0; i < positions.count; i++) {
            const xIdx = i % cols;
            const yIdx = Math.floor(i / cols);
            const pixelIndex = (yIdx * cols + xIdx) * 4;

            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];
            
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            
            // CORREÇÃO DE VOLUME CORRETO (RELEVO POSITIVO):
            // O fundo branco (luminance próximo de 1.0) deve ser Z = 0 (base plana).
            // Queremos que áreas com cor/conteúdo ganhem altura positiva. 
            // Usamos diretamente o inverso do branco para empurrar o relevo para cima:
            let z = 0;
            if (luminance < 0.95) { // Tudo que não for o fundo branco puro ganha volume
              // Quanto mais denso/colorido, maior o relevo (limitado ao maxDepthMm)
              const intensity = 1.0 - luminance;
              z = intensity * maxDepthMm; 
            } else {
              z = 0; // Fundo estritamente plano na base
            }

            positions.setZ(i, z);
          }

          geometry.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            color: 0xd69e2e,
            roughness: 0.4,
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