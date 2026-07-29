import os
import subprocess
import sys


def main():
    # Simplesmente chama o arquivo que está na mesma pasta agora
    app_path = os.path.join("gradio_app.py")
    
    if not os.path.exists(app_path):
        print("Erro: gradio_app.py não encontrado! Verifique se você colou a pasta TripoSR corretamente.")
        return

    print("🚀 Iniciando o conversor 3D...")
    print("🔗 Aguarde o download do modelo...\n")

    comando = [
        sys.executable, 
        app_path, 
        "--device", "cpu", 
        "--pretrained-model-name-or-path", "stabilityai/TripoSR",
        "--trust-remote-code"
    ]
    
    try:
        subprocess.run(comando, check=True)
    except KeyboardInterrupt:
        print("\n🛑 Conversor encerrado pelo usuário.")
    except Exception as e:
        print(f"\n❌ Erro ao executar: {e}")

if __name__ == "__main__":
    main()