// ... (Seu código anterior com o buildRasterPreview e a suavização avançada) ...

// NOVA FUNÇÃO: Transformar a malha 3D em Caminho de Fresa e G-Code
export function generateLithophaneGCode(previewGroup, widthMm, heightMm, maxDepthMm, toolDiameterMm, stepOverPercent) {
  // 1. Extrair a geometria do grupo Three.js
  const mesh = previewGroup.children[0];
  const positions = mesh.geometry.attributes.position;
  const cols = mesh.geometry.parameters.widthSegments + 1;
  const rows = mesh.geometry.parameters.heightSegments + 1;

  // 2. Definir parâmetros de usinagem
  const toolRadius = toolDiameterMm / 2;
  const stepOver = toolDiameterMm * (stepOverPercent / 100); // Ex: 10% de passo
  const clearanceZ = 5; // Altura segura para andar sem bater na peça
  const plungeFeed = 300; // Velocidade de descida (mm/min)
  const cutFeed = 1200;   // Velocidade de corte (mm/min)

  let gcode = [];
  gcode.push("G90 (Modo Absoluto)");
  gcode.push("G21 (Unidades em mm)");
  gcode.push(`G0 Z${clearanceZ}`);
  gcode.push(`G0 X0 Y0`);

  // 3. Algoritmo de Passe de Acabamento (Scallop pass - estilo "Tecido")
  // A CNC não pode entrar na profundidade máxima de uma vez, ou a fresa quebra.
  // Fazemos cortes em camadas (Z-Levels).

  // Vamos varrer a peça de cima para baixo (Y), linha por linha
  for (let yRow = 0; yRow < rows; yRow += stepOver / (heightMm / (rows - 1))) {
    const yIndex = Math.round(yRow);
    if (yIndex >= rows) break;

    // Descobre a altura máxima (Z) nessa linha Y para não colidir com a parede
    let maxZAtThisY = 0;
    for (let xCol = 0; xCol < cols; xCol++) {
      const idx = yIndex * cols + xCol;
      const z = positions.getZ(idx);
      if (z > maxZAtThisY) maxZAtThisY = z;
    }
    
    // Movimento de entrada na peça
    gcode.push(`G0 Z${clearanceZ}`);
    gcode.push(`G0 X0 Y${(yIndex / (rows - 1)) * heightMm}`);
    gcode.push(`G1 Z${maxZAtThisY - toolRadius} F${plungeFeed}`); // Desce lentamente até a altura daquela linha

    // Varrer o eixo X de acordo com a profundidade da linha atual
    let cuttingDirection = 1; // 1 para esquerda->direita, -1 para direita->esquerda
    let currentX = 0;
    let xStep = stepOver / (widthMm / (cols - 1));
    
    // A cada X, a fresa deve descer/subir suavemente (isso cria o barranco)
    while (currentX < cols) {
      const idx = yIndex * cols + Math.round(currentX);
      const targetZ = positions.getZ(idx) - toolRadius; // Ajuste do raio da fresa

      // A MÁGICA DO TECIDO: Movimento contínuo de descida/subida no eixo Z
      gcode.push(`G1 X${(Math.round(currentX) / (cols - 1)) * widthMm} Z${targetZ} F${cutFeed}`);
      
      currentX += xStep;
    }
    
    // Fim da linha, sobe a fresa e volta para o próximo passo Y
    gcode.push(`G0 Z${clearanceZ}`);
  }

  // Finalizar
  gcode.push("G0 Z50");
  gcode.push("M30 (Fim do programa)");

  return gcode.join("\n");
}

// EXEMPLO DE USO:
// Supondo que você já tenha o previewGroup do seu código:
// const gcodeStr = generateLithophaneGCode(
//    previewGroup, 
//    200,        // Largura da porta (mm)
//    150,        // Altura da porta (mm)
//    3,          // Profundidade máxima (mm) - NÃO FURE A PORTA
//    3.175,      // Diâmetro da sua fresa esférica (1/8")
//    10          // 10% de sobreposição da fresa
// );
// console.log(gcodeStr); // Copie isso e salve como arquivo .nc ou .tap