import os
import subprocess
import sys


def main():
    app_path = os.path.join("gradio_app.py")
    
    if not os.path.exists(app_path):
        print("Erro: gradio_app.py não encontrado!")
        return

    print("🚀 Iniciando o conversor 3D (Modo Forçado)...")
    print("🔗 Espere o download do modelo original de 1.7GB...\n")

    # Caminho oficial do modelo na nuvem
    comando = [
        sys.executable, 
        app_path, 
        "--device", "cpu", 
        "--pretrained-model-name-or-path", "stabilityai/TripoSR"
    ]
    
    try:
        subprocess.run(comando, check=True)
    except KeyboardInterrupt:
        print("\n🛑 Conversor encerrado pelo usuário.")
    except Exception as e:
        print(f"\n❌ Erro ao executar: {e}")

if __name__ == "__main__":
    main()