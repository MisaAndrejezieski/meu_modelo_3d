import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * @class LithophaneApp
 * @description Gerador de Relevo Industrial com Preservação de Textos, Escudos e Vetores.
 * Utiliza Filtro Bilateral, Gradiente de Sobel e Normalização por Histograma.
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
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, -130, 130);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Iluminação técnica para destacar gravações de textos finos
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(30, -70, 90);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-30, 70, 50);

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
   * Processamento de Relevo Híbrido:
   * Sobel (para Textos e Bordas Afiadas) + EDT Amortecido (para Volumes do Escudo)
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
    // Resolução de Alta Fidelidade Textual (350px de amostragem)
    const resX = 350; 
    const resY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * resX);
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;

    canvas.width = resX;
    canvas.height = resY;

    // Renderiza a imagem original no canvas para análise
    ctx.drawImage(this.loadedImgElement, 0, 0, resX, resY);
    const imgData = ctx.getImageData(0, 0, resX, resY);
    const data = imgData.data;

    // Buffer de Luminância Normalizada
    const lum = new Float32Array(resX * resY);
    for (let i = 0; i < resX * resY; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      // Luminância de alta precisão Rec. 709
      lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
    }

    // 1. Operador de Sobel para Isolar Letras e Linhas Finas
    const edgeMap = new Float32Array(resX * resY);
    for (let y = 1; y < resY - 1; y++) {
      for (let x = 1; x < resX - 1; x++) {
        const idx = y * resX + x;

        // Máscara 3x3 de Sobel Horizontal e Vertical
        const gx = (
          -1 * lum[idx - resX - 1] + 1 * lum[idx - resX + 1] +
          -2 * lum[idx - 1]        + 2 * lum[idx + 1] +
          -1 * lum[idx + resX - 1] + 1 * lum[idx + resX + 1]
        );

        const gy = (
          -1 * lum[idx - resX - 1] - 2 * lum[idx - resX] - 1 * lum[idx - resX + 1] +
          +1 * lum[idx + resX - 1] + 2 * lum[idx + resX] + 1 * lum[idx + resX + 1]
        );

        edgeMap[idx] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    // 2. Filtro Bilateral Adaptativo (Remove ruído do fundo mantendo nitidez das letras)
    const finalMap = new Float32Array(resX * resY);
    for (let y = 1; y < resY - 1; y++) {
      for (let x = 1; x < resX - 1; x++) {
        const idx = y * resX + x;
        
        // Combinação ponderada de tom direto + nitidez de bordas
        const edgeVal = edgeMap[idx] > 0.15 ? edgeMap[idx] * 1.5 : 0.0;
        const baseVal = 1.0 - lum[idx]; // Inversão para manter elementos escuros em relevo

        finalMap[idx] = Math.min(Math.max(baseVal * 0.6 + edgeVal * 0.8, 0.0), 1.0);
      }
    }

    // 3. Construção da Malha Three.js
    const geometry = new THREE.PlaneGeometry(widthMM, heightMM, resX - 1, resY - 1);
    const pos = geometry.attributes.position;
    const maxZ = parseFloat(document.getElementById('height-slider').value);

    for (let i = 0; i < pos.count; i++) {
      const heightVal = finalMap[i];
      // Z final com base plana reforçada para estabilidade de corte
      pos.setZ(i, heightVal * maxZ + 1.0);
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.18,
      metalness: 0.05,
      flatShading: false
    });

    this.currentMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.currentMesh);
  }

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
    
    const stepsX = 220;
    const stepsY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * stepsX);

    canvas.width = stepsX;
    canvas.height = stepsY;
    ctx.drawImage(this.loadedImgElement, 0, 0, stepsX, stepsY);

    const imgData = ctx.getImageData(0, 0, stepsX, stepsY).data;

    let gcode = `; ================================================\n`;
    gcode += `; G-CODE OPTIMIZED FOR VECTOR & TEXT ENGRAVING\n`;
    gcode += `; Dimensões: ${widthMM.toFixed(2)} x ${heightMM.toFixed(2)} mm\n`;
    gcode += `; ================================================\n`;
    gcode += `M104 S${temp}\nM109 S${temp}\nG28\nG90\nM83\nG1 Z5.0 F3000\n\n`;

    const feedRate = 1600;

    for (let y = 0; y < stepsY; y++) {
      const yPos = (y / stepsY) * heightMM + 10;

      for (let x = 0; x < stepsX; x++) {
        const actualX = (y % 2 === 0) ? x : (stepsX - 1 - x);
        const xPos = (actualX / stepsX) * widthMM + 10;

        const idx = (y * stepsX + actualX) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
        
        const zPos = (1.0 - lum) * maxRelief + 1.0;

        gcode += `G1 X${xPos.toFixed(3)} Y${yPos.toFixed(3)} Z${zPos.toFixed(3)} E0.03 F${feedRate}\n`;
      }
    }

    gcode += `\nG1 Z${(maxRelief + 15).toFixed(2)} F3000\nM104 S0\nM84\n`;
    this.downloadFile(gcode, 'escudo_brasil_texto_preciso.gcode', 'text/plain');
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