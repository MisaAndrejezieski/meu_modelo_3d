import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateGcodeForRaster, generateGcodeForSVG } from './gcode-generator.js';
import { buildRasterPreview, buildSVGPreview } from './preview-builder.js';
import './style.css';
import { clamp, formatValue, isSVGFile, readTextFile } from './utils.js';

class CNCPreviewApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.currentPreview = null;
    this.previewMetadata = null;
    this.currentFile = null;
    this.fileType = null;
    this.debounceTimer = null;

    this.initScene();
    this.initListeners();
    this.updateStatus('Aguardando arquivo de entrada...');
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08101d);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, -180, 170);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 10);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(60, -80, 120);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x98a8ff, 0.4);
    fillLight.position.set(-40, 60, 100);
    this.scene.add(fillLight);

    const gridHelper = new THREE.GridHelper(400, 40, 0x2c5282, 0x1f2937);
    gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(gridHelper);
  }

  initListeners() {
    document.getElementById('image-input').addEventListener('change', (event) => this.handleFileInput(event));
    document.getElementById('tool-type').addEventListener('change', () => this.updateStatus());
    
    // Inputs com Debounce para evitar travamentos
    const debouncedUpdate = () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.updatePreview(), 250);
    };

    document.getElementById('width-input').addEventListener('input', debouncedUpdate);
    document.getElementById('resolution-input').addEventListener('input', debouncedUpdate);
    document.getElementById('depth-input').addEventListener('input', debouncedUpdate);
    
    document.getElementById('height-slider').addEventListener('input', (event) => {
      this.updateHeightLabel(event);
      debouncedUpdate();
    });

    document.getElementById('spindle-input').addEventListener('input', () => this.updateStatus());
    document.getElementById('feedrate-input').addEventListener('input', () => this.updateStatus());
    document.getElementById('export-gcode-btn').addEventListener('click', () => this.handleExport());
    window.addEventListener('resize', () => this.onWindowResize());
  }

  async handleFileInput(event) {
    const file = event.target.files[0];
    if (!file) {
      this.updateStatus('Nenhum arquivo selecionado.');
      return;
    }

    this.currentFile = file;
    this.fileType = isSVGFile(file) ? 'svg' : 'raster';

    this.toggleModeControls();
    await this.updatePreview();
  }

  toggleModeControls() {
    const rasterControls = document.querySelectorAll('.raster-only');
    const vectorControls = document.querySelectorAll('.vector-only');
    const isSvg = this.fileType === 'svg';

    rasterControls.forEach((element) => element.classList.toggle('hidden', isSvg));
    vectorControls.forEach((element) => element.classList.toggle('hidden', !isSvg));
  }

  async updatePreview() {
    if (!this.currentFile) return;

    try {
      this.updateStatus('Processando geometria 3D...');
      this.removeCurrentPreview();

      const widthMm = clamp(parseFloat(document.getElementById('width-input').value) || 120, 20, 450);
      const maxDepthMm = clamp(parseFloat(document.getElementById('height-slider').value) || 1.5, 0.2, 10);
      const resolution = clamp(parseInt(document.getElementById('resolution-input').value, 10) || 128, 32, 256);
      const cutDepth = clamp(parseFloat(document.getElementById('depth-input').value) || 3, 0.2, 12);

      let result;
      if (this.fileType === 'svg') {
        result = await buildSVGPreview(this.currentFile, widthMm, cutDepth);
      } else {
        result = await buildRasterPreview(this.currentFile, widthMm, maxDepthMm, resolution);
      }

      this.previewMetadata = result.metadata;
      this.currentPreview = result.group;
      this.scene.add(this.currentPreview);
      this.updateStatus();
    } catch (error) {
      console.error('Erro ao atualizar preview:', error);
      this.updateStatus('Erro ao processar o arquivo. Verifique o formato.');
    }
  }

  updateHeightLabel(event) {
    const value = parseFloat(event.target.value);
    document.getElementById('height-val').textContent = `${formatValue(value, 1)} mm`;
  }

  updateStatus(message) {
    const details = document.getElementById('status-details');
    if (message) {
      details.textContent = message;
      return;
    }

    if (!this.currentFile) {
      details.textContent = 'Nenhum arquivo carregado.';
      return;
    }

    const fileName = this.currentFile.name;
    const toolType = document.getElementById('tool-type').value === 'laser' ? 'Laser' : 'Router CNC';
    const feedRate = `${parseInt(document.getElementById('feedrate-input').value, 10)} mm/min`;
    const widthMm = formatValue(parseFloat(document.getElementById('width-input').value) || 120, 1);

    if (this.fileType === 'svg' && this.previewMetadata) {
      const cutDepth = formatValue(this.previewMetadata.depthMm, 1);
      details.innerHTML = `Arquivo: <strong>${fileName}</strong><br/>Modo: <strong>Recorte Vetorial</strong><br/>Largura final: <strong>${widthMm} mm</strong><br/>Profundidade: <strong>${cutDepth} mm</strong><br/>Ferramenta: <strong>${toolType}</strong><br/>Avanço: <strong>${feedRate}</strong>`;
    } else if (this.previewMetadata) {
      const heightMm = formatValue(this.previewMetadata.maxHeightMm, 1);
      details.innerHTML = `Arquivo: <strong>${fileName}</strong><br/>Modo: <strong>Relevo 3D Suave</strong><br/>Largura final: <strong>${widthMm} mm</strong><br/>Altura do relevo: <strong>${heightMm} mm</strong><br/>Ferramenta: <strong>${toolType}</strong><br/>Avanço: <strong>${feedRate}</strong>`;
    } else {
      details.textContent = `Arquivo: ${fileName} carregado — processando preview...`;
    }
  }

  removeCurrentPreview() {
    if (!this.currentPreview) return;
    this.scene.remove(this.currentPreview);
    this.currentPreview.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
    this.currentPreview = null;
  }

  async handleExport() {
    if (!this.currentFile) {
      alert('Carregue uma imagem ou SVG antes de gerar o G-Code.');
      return;
    }

    try {
      this.updateStatus('Gerando G-Code profissional...');
      const widthMm = clamp(parseFloat(document.getElementById('width-input').value) || 120, 20, 450);
      const feedRate = clamp(parseFloat(document.getElementById('feedrate-input').value) || 1800, 600, 6000);
      const laserMode = document.getElementById('tool-type').value === 'laser';

      let gcode = '';
      if (this.fileType === 'svg') {
        const svgText = await readTextFile(this.currentFile);
        gcode = generateGcodeForSVG(svgText, {
          widthMm,
          feedRate,
          cutDepth: clamp(parseFloat(document.getElementById('depth-input').value) || 3, 0.2, 12),
          retractHeight: 5,
          spindleSpeed: clamp(parseFloat(document.getElementById('spindle-input').value) || 1200, 200, 5000)
        });
      } else {
        const maxDepthMm = clamp(parseFloat(document.getElementById('height-slider').value) || 1.5, 0.2, 10);
        const resolution = clamp(parseInt(document.getElementById('resolution-input').value, 10) || 128, 32, 256);
        const rasterPreview = await buildRasterPreview(this.currentFile, widthMm, maxDepthMm, resolution);
        
        gcode = generateGcodeForRaster({
          imageData: rasterPreview.metadata.imageData,
          cols: rasterPreview.metadata.cols,
          rows: rasterPreview.metadata.rows,
          widthMm,
          heightMm: rasterPreview.metadata.heightMm,
          maxDepthMm: rasterPreview.metadata.maxHeightMm,
          feedRate,
          laserMode,
          laserPower: clamp(parseFloat(document.getElementById('spindle-input').value) || 1200, 200, 5000)
        });
      }

      this.downloadFile(gcode, this.currentFile.name.replace(/\.(svg|png|jpe?g|bmp|webp)$/i, '_cnc.gcode'));
      this.updateStatus();
    } catch (error) {
      console.error('Erro na exportação do G-Code:', error);
      this.updateStatus('Erro ao gerar o G-Code.');
    }
  }

  downloadFile(content, fileName) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
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

new CNCPreviewApp();