import os
import subprocess
import sys


def main():
    # Apontamos para o gradio_app.py
    app_path = os.path.join("gradio_app.py")
    
    if not os.path.exists(app_path):
        print("Erro: gradio_app.py não encontrado!")
        return

    print("🚀 Iniciando o conversor 3D no seu navegador...")
    print("🔗 Aguarde...\n")

    # CORREÇÃO: Forçamos o caminho para a pasta atual e usamos --trust-remote-code para garantir a segurança
    comando = [
        sys.executable, 
        app_path, 
        "--device", "cpu", 
        "--pretrained-model-name-or-path", ".", 
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