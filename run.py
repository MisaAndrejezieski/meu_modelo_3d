import os
import subprocess
import sys

def main():
    # Apontamos para o arquivo gradio_app.py, que abre a interface no navegador
    app_path = os.path.join("gradio_app.py")
    
    if not os.path.exists(app_path):
        print("Erro: gradio_app.py não encontrado! Verifique se você extraiu o TripoSR na pasta correta.")
        return

    print("🚀 Iniciando o conversor 3D no seu navegador...")
    print("🔗 Aguarde... Quando aparecer o link (ex: http://127.0.0.1:7860), segure CTRL e clique nele.\n")
    
    # Força a rodar no CPU para garantir que funcione no seu PC
    comando = [sys.executable, app_path, "--device", "cpu"]
    
    try:
        subprocess.run(comando, check=True)
    except KeyboardInterrupt:
        print("\n🛑 Conversor encerrado pelo usuário.")
    except Exception as e:
        print(f"\n❌ Erro ao executar: {e}")

if __name__ == "__main__":
    main()
    