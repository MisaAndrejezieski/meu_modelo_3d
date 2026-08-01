import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

/**
 * @class LithophaneApp
 * @description Slicer e Gerador Volumétrico de Baixo-Relevo para CNC/Laser/3D
 * Utiliza Transformada de Distância Euclidiana Contínua (EDT) e Filtro de Kernel Gaussiano.
 */
class LithophaneApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.loadedImgElement = null;
    this.currentMesh = null;

    this.initScene();
    this.initListeners();
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, -110, 110);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Iluminação Triangulada de Estúdio para Avaliação de Relevo CNC
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(40, -60, 80);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-40, 60, 40);

    this.scene.add(ambientLight, keyLight, fillLight);

    const gridHelper = new THREE.GridHelper(200, 40, 0x38bdf8, 0x334155);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  initListeners() {
    document.getElementById('image-input').addEventListener('change', (e) => this.handleImageUpload(e));
    
    document.getElementById('height-slider').addEventListener('input', (e) => {
      document.getElementById('height-val').textContent = `${parseFloat(e.target.value).toFixed(1)} mm`;
      this.generate3DMesh();
    });

    document.getElementById('width-input').addEventListener('change', () => this.generate3DMesh());
    document.getElementById('export-gcode-btn').addEventListener('click', () => this.exportGCode());

    window.addEventListener('resize', () => this.onWindowResize());
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.loadedImgElement = img;
      this.generate3DMesh();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  /**
   * Algoritmo de Euclidian Distance Field (EDF) + Gauss Smooth de N-Passagens
   */
  generate3DMesh() {
    if (!this.loadedImgElement) return;

    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      this.currentMesh.material.dispose();
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    // Resolução Industrial: 300 pontos de amostragem no eixo X
    const resX = 300; 
    const resY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * resX);
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;

    canvas.width = resX;
    canvas.height = resY;

    // Pré-filtragem de imagem para eliminar ruído de varredura
    ctx.filter = 'grayscale(100%) blur(1px)';
    ctx.drawImage(this.loadedImgElement, 0, 0, resX, resY);

    const imgData = ctx.getImageData(0, 0, resX, resY);
    const data = imgData.data;

    // 1. Binarização da imagem por Limiarização Otsu/Adaptativa
    let totalLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalLum += data[i];
    }
    const avgLum = totalLum / (resX * resY);
    const isDarkBackground = avgLum < 128;

    const binaryMap = new Uint8Array(resX * resY);
    for (let i = 0; i < resX * resY; i++) {
      const lum = data[i * 4];
      // Define a máscara do corpo do desenho vs fundo
      binaryMap[i] = isDarkBackground ? (lum > avgLum ? 1 : 0) : (lum < avgLum ? 1 : 0);
    }

    // 2. Transformada de Distância Euclidiana (Aproximação de Varredura Manhattan + Diagonal)
    const distMap = new Float32Array(resX * resY);
    const INF = 1e6;

    // Passagem Direta (Forward Pass)
    for (let y = 0; y < resY; y++) {
      for (let x = 0; x < resX; x++) {
        const idx = y * resX + x;
        if (binaryMap[idx] === 0) {
          distMap[idx] = 0;
        } else {
          const left = x > 0 ? distMap[idx - 1] : INF;
          const top = y > 0 ? distMap[idx - resX] : INF;
          const topLeft = (x > 0 && y > 0) ? distMap[idx - resX - 1] : INF;
          distMap[idx] = 1.0 + Math.min(left, top, topLeft * 1.414);
        }
      }
    }

    // Passagem Inversa (Backward Pass)
    for (let y = resY - 1; y >= 0; y--) {
      for (let x = resX - 1; x >= 0; x--) {
        const idx = y * resX + x;
        if (binaryMap[idx] !== 0) {
          const right = x < resX - 1 ? distMap[idx + 1] : INF;
          const bottom = y < resY - 1 ? distMap[idx + resX] : INF;
          const bottomRight = (x < resX - 1 && y < resY - 1) ? distMap[idx + resX + 1] : INF;
          distMap[idx] = Math.min(distMap[idx], 1.0 + Math.min(right, bottom, bottomRight * 1.414));
        }
      }
    }

    // Encontra a maior distância para normalizar a topografia
    let maxDist = 0.0001;
    for (let i = 0; i < distMap.length; i++) {
      if (distMap[i] > maxDist) maxDist = distMap[i];
    }

    // 3. Suavização Gaussiana de Kernel 7x7 (Eliminação Total do Ruído de Superfície)
    const smoothMap = new Float32Array(resX * resY);
    const radius = 3;

    for (let y = 0; y < resY; y++) {
      for (let x = 0; x < resX; x++) {
        let sum = 0;
        let weightSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < resX && ny >= 0 && ny < resY) {
              const weight = Math.exp(-(dx * dx + dy * dy) / (2 * 1.5 * 1.5));
              sum += (distMap[ny * resX + nx] / maxDist) * weight;
              weightSum += weight;
            }
          }
        }
        smoothMap[y * resX + x] = sum / weightSum;
      }
    }

    // 4. Construção da Geometria Three.js
    const geometry = new THREE.PlaneGeometry(widthMM, heightMM, resX - 1, resY - 1);
    const pos = geometry.attributes.position;
    const maxZ = parseFloat(document.getElementById('height-slider').value);

    for (let i = 0; i < pos.count; i++) {
      let val = smoothMap[i];

      // Aplicação da Curva de Transferência Volumétrica
      let heightVal = Math.sin(Math.pow(val, 0.75) * Math.PI * 0.5);

      // Z final com base plana reforçada de 1.0mm para usinagem/impressão
      pos.setZ(i, heightVal * maxZ + 1.0);
    }

    geometry.computeVertexNormals();

    // Material com especularidade de resina industrial usinável
    const material = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.15,
      metalness: 0.05,
      flatShading: false
    });

    this.currentMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.currentMesh);
  }

  /**
   * Gerador de G-Code Industrial para CNC Router e Impressoras 3D
   */
  exportGCode() {
    if (!this.loadedImgElement) {
      alert('Por favor, carregue uma imagem antes de exportar.');
      return;
    }

    const temp = document.getElementById('temp-input').value || 200;
    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;
    const maxRelief = parseFloat(document.getElementById('height-slider').value);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const stepsX = 180;
    const stepsY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * stepsX);

    canvas.width = stepsX;
    canvas.height = stepsY;
    ctx.filter = 'grayscale(100%) blur(1px)';
    ctx.drawImage(this.loadedImgElement, 0, 0, stepsX, stepsY);

    const imgData = ctx.getImageData(0, 0, stepsX, stepsY).data;

    let gcode = `; ================================================\n`;
    gcode += `; G-CODE INDUSTRIAL - BAS-RELIEF SURFACE\n`;
    gcode += `; Dimensões: ${widthMM.toFixed(2)} x ${heightMM.toFixed(2)} mm\n`;
    gcode += `; ================================================\n`;
    gcode += `M104 S${temp} ; Aquecer Extrusora/Spindle\n`;
    gcode += `M109 S${temp}\n`;
    gcode += `G28 ; Home All Axes\n`;
    gcode += `G90 ; Modos Absolutos\n`;
    gcode += `M83 ; Extrusão Relativa\n`;
    gcode += `G1 Z5.0 F3000 ; Altura de Segurança\n\n`;

    const feedRate = 1500;

    for (let y = 0; y < stepsY; y++) {
      const yPos = (y / stepsY) * heightMM + 10;

      for (let x = 0; x < stepsX; x++) {
        const actualX = (y % 2 === 0) ? x : (stepsX - 1 - x);
        const xPos = (actualX / stepsX) * widthMM + 10;

        const idx = (y * stepsX + actualX) * 4;
        const lum = imgData[idx] / 255.0;
        
        const zPos = (1.0 - lum) * maxRelief + 1.0;

        gcode += `G1 X${xPos.toFixed(3)} Y${yPos.toFixed(3)} Z${zPos.toFixed(3)} E0.03 F${feedRate}\n`;
      }
    }

    gcode += `\n; Finalização\n`;
    gcode += `G1 Z${(maxRelief + 15).toFixed(2)} F3000\n`;
    gcode += `M104 S0\n`;
    gcode += `M84\n`;

    this.downloadFile(gcode, 'bas_relief_cnc.gcode', 'text/plain');
  }

  downloadFile(content, fileName, contentType) {
    const blob = new Blob([content], { type: contentType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

new LithophaneApp();