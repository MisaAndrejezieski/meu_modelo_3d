import os
import subprocess
import sys


def main():
    # Aponta para o novo arquivo app.py que acabamos de criar
    app_path = os.path.join("app.py")
    
    if not os.path.exists(app_path):
        print("Erro: app.py não encontrado!")
        return

    print("🚀 Iniciando a versão oficial e corrigida do TripoSR...")
    print("🔗 Espere o download do modelo...\n")

    comando = [sys.executable, app_path]
    
    try:
        subprocess.run(comando, check=True)
    except KeyboardInterrupt:
        print("\n🛑 Conversor encerrado pelo usuário.")
    except Exception as e:
        print(f"\n❌ Erro ao executar: {e}")

if __name__ == "__main__":
    main()