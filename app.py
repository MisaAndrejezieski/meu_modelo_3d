import gradio as gr
from transformers import pipeline
from PIL import Image

# Esta é a versão oficial e estável do TripoSR que a Stability AI mantém
# Ela já vem com o código e o modelo compatíveis, sem erros de carregamento.
pipe = pipeline("image-to-3d", model="stabilityai/TripoSR", trust_remote_code=True)

def generate_3d(image):
    # Processa a imagem e gera o modelo 3D
    result = pipe(image)
    # Retorna o caminho do arquivo .glb gerado (que é compatível com impressão 3D)
    return result["mesh_path"]

# Cria a interface no navegador
iface = gr.Interface(
    fn=generate_3d,
    inputs=gr.Image(type="pil", label="Coloque a imagem aqui"),
    outputs=gr.File(label="Baixar Modelo 3D (.glb)"),
    title="Conversor de Imagem para 3D (TripoSR)",
    description="Envie uma imagem e receba um modelo 3D pronto para impressão."
)

if __name__ == "__main__":
    iface.launch(server_name="0.0.0.0")