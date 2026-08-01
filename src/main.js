import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

/**
 * @class LithophaneApp
 * @description Classe principal responsável pela renderização WebGL em Three.js,
 * cálculo matricial da imagem e exportação algorítmica para código G-Code (ISO 6983).
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

  /**
   * Configura o ambiente 3D: Câmera, Iluminação, Renderizador e Grid
   */
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, -80, 80);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Iluminação Direcionada e Ambiente
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 50, 100);

    this.scene.add(ambientLight, dirLight);

    // Simulação Visual da Mesa de Impressão (Mesa 200x200 mm)
    const gridHelper = new THREE.GridHelper(200, 40, 0x38bdf8, 0x334155);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  /**
   * Conecta os componentes da Interface DOM aos métodos da classe
   */
  initListeners() {
    document.getElementById('image-input').addEventListener('change', (e) => this.handleImageUpload(e));
    
    document.getElementById('height-slider').addEventListener('input', (e) => {
      document.getElementById('height-val').textContent = `${e.target.value} mm`;
      this.generate3DMesh();
    });

    document.getElementById('width-input').addEventListener('change', () => this.generate3DMesh());
    document.getElementById('export-gcode-btn').addEventListener('click', () => this.exportGCode());

    window.addEventListener('resize', () => this.onWindowResize());
  }

  /**
   * Lê o arquivo de imagem carregado pelo usuário
   * @param {Event} event Evento de alteração do input do tipo file
   */
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
   * Processa a matriz de pixels 2D e reconstrói os vértices da malha 3D
   */
  generate3DMesh() {
    if (!this.loadedImgElement) return;

    // Descarta a geometria anterior para evitar vazamento de memória (Memory Leak)
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      this.currentMesh.material.dispose();
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    const resX = 120; // Densidade de resolução da malha
    const resY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * 120);
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;

    canvas.width = resX;
    canvas.height = resY;
    ctx.drawImage(this.loadedImgElement, 0, 0, resX, resY);
    const imgData = ctx.getImageData(0, 0, resX, resY).data;

    const geometry = new THREE.PlaneGeometry(widthMM, heightMM, resX - 1, resY - 1);
    const pos = geometry.attributes.position;
    const maxZ = parseFloat(document.getElementById('height-slider').value);

    for (let i = 0; i < pos.count; i++) {
      const r = imgData[i * 4];
      const g = imgData[i * 4 + 1];
      const b = imgData[i * 4 + 2];

      // Mapeamento de Luminância (Normalização 0.0 - 1.0)
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      
      // Inversão para técnica de Lithophane + Espessura Base de 0.8mm
      pos.setZ(i, (1 - brightness) * maxZ + 0.8);
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.4,
      metalness: 0.1
    });

    this.currentMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.currentMesh);
  }

  /**
   * Fatiador Algorítmico: Gera as coordenadas de movimentação do extrusor
   */
  exportGCode() {
    if (!this.loadedImgElement) {
      alert('Atenção: Carregue uma imagem antes de gerar o G-Code.');
      return;
    }

    const temp = document.getElementById('temp-input').value || 200;
    const widthMM = parseFloat(document.getElementById('width-input').value) || 80;
    const heightMM = (this.loadedImgElement.height / this.loadedImgElement.width) * widthMM;
    const maxRelief = parseFloat(document.getElementById('height-slider').value);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const stepsX = 80;
    const stepsY = Math.round((this.loadedImgElement.height / this.loadedImgElement.width) * 80);

    canvas.width = stepsX;
    canvas.height = stepsY;
    ctx.drawImage(this.loadedImgElement, 0, 0, stepsX, stepsY);
    const imgData = ctx.getImageData(0, 0, stepsX, stepsY).data;

    // Cabeçalho de Inicialização G-Code
    let gcode = `; ================================================\n`;
    gcode += `; GENERATED BY WEBGL LITHOPHANE SLICER\n`;
    gcode += `; Dimensões: ${widthMM.toFixed(1)}x${heightMM.toFixed(1)} mm\n`;
    gcode += `; ================================================\n`;
    gcode += `M104 S${temp} ; Aquecer bico\n`;
    gcode += `M109 S${temp} ; Aguardar temperatura alvo\n`;
    gcode += `G28 ; Home todos os eixos\n`;
    gcode += `G90 ; Coordenadas absolutas\n`;
    gcode += `M83 ; Modo de extrusão relativa\n`;
    gcode += `G1 Z2.0 F3000 ; Eleva bico para segurança\n\n`;

    const feedRate = 1500;

    for (let y = 0; y < stepsY; y++) {
      const yPos = (y / stepsY) * heightMM + 20;

      for (let x = 0; x < stepsX; x++) {
        // Trajetória Contínua (Zig-Zag) para minimizar deslocamento sem extrusão
        const actualX = (y % 2 === 0) ? x : (stepsX - 1 - x);
        const xPos = (actualX / stepsX) * widthMM + 20;

        const idx = (y * stepsX + actualX) * 4;
        const brightness = (0.299 * imgData[idx] + 0.587 * imgData[idx+1] + 0.114 * imgData[idx+2]) / 255;
        const zPos = (1 - brightness) * maxRelief + 0.4;

        gcode += `G1 X${xPos.toFixed(2)} Y${yPos.toFixed(2)} Z${zPos.toFixed(2)} E0.04 F${feedRate}\n`;
      }
    }

    // Rodapé de Encerramento G-Code
    gcode += `\n; Finalização da Impressão\n`;
    gcode += `G1 E-2.0 F2400 ; Retrair filamento\n`;
    gcode += `G1 Z${(maxRelief + 15).toFixed(2)} F3000 ; Elevar Z\n`;
    gcode += `M104 S0 ; Desligar aquecimento\n`;
    gcode += `M84 ; Desabilitar motores\n`;

    this.downloadFile(gcode, 'lithophane_modelo.gcode', 'text/plain');
  }

  /**
   * Força o download do arquivo gerado no navegador
   */
  downloadFile(content, fileName, contentType) {
    const blob = new Blob([content], { type: contentType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Atualiza a proporção da câmera e viewport em redimensionamentos de tela
   */
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Loop principal de renderização WebGL
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Inicializa a aplicação
new LithophaneApp();