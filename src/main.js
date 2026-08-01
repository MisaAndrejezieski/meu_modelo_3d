import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * @class LithophaneApp
 * @description Gerador de Relevo 3D para Ilustrações/Lineart utilizando
 * Transformada de Distância Euclidiana (EDT) e Suavização de Malha de Alta Densidade.
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
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, -90, 90);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Iluminação Suave com Sombreamento Studio
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(30, -50, 70);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    fillLight.position.set(-30, 50, 40);

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
   * Algoritmo de Euclidian Distance Field (EDF) + Smooth Heightmap
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
    // Resolução de amostragem aumentada para 250 pontos no eixo X
    const resX = 250; 
    const resY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * resX);
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;

    canvas.width = resX;
    canvas.height = resY;

    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(this.loadedImgElement, 0, 0, resX, resY);

    const imgData = ctx.getImageData(0, 0, resX, resY);
    const data = imgData.data;

    // Detecta se a imagem tem fundo predominantemente claro ou escuro
    let totalLum = 0;
    for (let i = 0; i < data.length; i += 16) {
      totalLum += data[i];
    }
    const isDarkBackground = (totalLum / (data.length / 16)) < 128;

    // Máscara binária para separação de forma vs fundo
    const binaryMap = new Uint8Array(resX * resY);
    for (let i = 0; i < resX * resY; i++) {
      const lum = data[i * 4] / 255.0;
      const isForeground = isDarkBackground ? (lum > 0.25) : (lum < 0.75);
      binaryMap[i] = isForeground ? 1 : 0;
    }

    // Passagem 1: Campo de Proximidade (Distance Map aproximado)
    const distMap = new Float32Array(resX * resY);
    for (let y = 1; y < resY - 1; y++) {
      for (let x = 1; x < resX - 1; x++) {
        const idx = y * resX + x;
        if (binaryMap[idx] === 1) {
          const minNeighbor = Math.min(
            distMap[idx - 1],
            distMap[idx - resX],
            distMap[idx - resX - 1],
            distMap[idx - resX + 1]
          );
          distMap[idx] = minNeighbor + 1.0;
        } else {
          distMap[idx] = 0;
        }
      }
    }

    // Encontra o valor máximo para normalizar de 0 a 1
    let maxDist = 1;
    for (let i = 0; i < distMap.length; i++) {
      if (distMap[i] > maxDist) maxDist = distMap[i];
    }

    // Passagem 2: Filtro Gaussiano de Suavização (Kernel 5x5)
    const smoothMap = new Float32Array(resX * resY);
    const radius = 2;

    for (let y = 0; y < resY; y++) {
      for (let x = 0; x < resX; x++) {
        let sum = 0;
        let weightSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < resX && ny >= 0 && ny < resY) {
              const weight = 1.0 / (1.0 + dx * dx + dy * dy);
              sum += (distMap[ny * resX + nx] / maxDist) * weight;
              weightSum += weight;
            }
          }
        }
        smoothMap[y * resX + x] = sum / weightSum;
      }
    }

    // Passagem 3: Geração de Geometria Tridimensional no Three.js
    const geometry = new THREE.PlaneGeometry(widthMM, heightMM, resX - 1, resY - 1);
    const pos = geometry.attributes.position;
    const maxZ = parseFloat(document.getElementById('height-slider').value);

    for (let i = 0; i < pos.count; i++) {
      let val = smoothMap[i];

      // Curva de Domo Orgânico (Dome Curve) para dar aspecto de escultura lisa
      let heightVal = Math.sin(val * Math.PI * 0.5);

      // Z final com base plana reforçada de 1.0mm
      pos.setZ(i, heightVal * maxZ + 1.0);
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.2,
      metalness: 0.0,
      flatShading: false
    });

    this.currentMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.currentMesh);
  }

  exportGCode() {
    if (!this.loadedImgElement) {
      alert('Por favor, carregue uma imagem antes de fatiar.');
      return;
    }

    const temp = document.getElementById('temp-input').value || 200;
    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;
    const maxRelief = parseFloat(document.getElementById('height-slider').value);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const stepsX = 140;
    const stepsY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * stepsX);

    canvas.width = stepsX;
    canvas.height = stepsY;
    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(this.loadedImgElement, 0, 0, stepsX, stepsY);

    const imgData = ctx.getImageData(0, 0, stepsX, stepsY).data;

    let gcode = `; ================================================\n`;
    gcode += `; G-CODE GENERATED BY SMOOTH RELIEF SLICER\n`;
    gcode += `; Dimensões: ${widthMM.toFixed(1)}x${heightMM.toFixed(1)} mm\n`;
    gcode += `; ================================================\n`;
    gcode += `M104 S${temp} ; Aquecer bico\n`;
    gcode += `M109 S${temp} ; Estabilizar temperatura\n`;
    gcode += `G28 ; Home eixos\n`;
    gcode += `G90 ; Coordenadas absolutas\n`;
    gcode += `M83 ; Extrusão relativa\n`;
    gcode += `G1 Z2.0 F3000\n\n`;

    const feedRate = 1200;

    for (let y = 0; y < stepsY; y++) {
      const yPos = (y / stepsY) * heightMM + 20;

      for (let x = 0; x < stepsX; x++) {
        const actualX = (y % 2 === 0) ? x : (stepsX - 1 - x);
        const xPos = (actualX / stepsX) * widthMM + 20;

        const idx = (y * stepsX + actualX) * 4;
        const lum = imgData[idx] / 255.0;
        
        const zPos = (1.0 - lum) * maxRelief + 0.6;

        gcode += `G1 X${xPos.toFixed(2)} Y${yPos.toFixed(2)} Z${zPos.toFixed(2)} E0.035 F${feedRate}\n`;
      }
    }

    gcode += `\n; Encerramento\n`;
    gcode += `G1 E-2.0 F2400\n`;
    gcode += `G1 Z${(maxRelief + 10).toFixed(2)} F3000\n`;
    gcode += `M104 S0\n`;
    gcode += `M84\n`;

    this.downloadFile(gcode, 'bas_relief_suave.gcode', 'text/plain');
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