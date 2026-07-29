import os
import subprocess
import sys


def main():
    app_path = os.path.join("gradio_app.py")
    
    if not os.path.exists(app_path):
        print("Erro: gradio_app.py não encontrado!")
        return

    print("🚀 Iniciando o conversor 3D...")
    print("🔗 Aguarde o download do modelo correto (1.7GB)...\n")

    # CORREÇÃO: Usamos o ID oficial do modelo no Hugging Face (isso garante que ele baixe a versão certa)
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