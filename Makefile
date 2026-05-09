.PHONY: run build

PORT ?= 5173
OBSIDIAN_FOLDER ?= /Users/raysouz/Library/Mobile\ Documents/iCloud\~md\~obsidian/Documents/.obsidian/plugins/business-rules-emulator

run:
	@echo ""
	@echo "  Iniciando Studio em http://localhost:5173/studio/"
	@echo ""
	@python3 -m http.server ${PORT} --directory .;

build:
	@set -e; \
	 mkdir -p dist ${OBSIDIAN_FOLDER}; \
	 npm --prefix obsidian install; \
	 npm --prefix obsidian run build; \
	 cp obsidian/main.js dist/main.js; \
	 cp obsidian/manifest.json dist/manifest.json; \
	 cp obsidian/styles.css dist/styles.css; \
	 cp dist/main.js dist/manifest.json dist/styles.css ${OBSIDIAN_FOLDER}; \
	 echo "  Plugin copiado para ${OBSIDIAN_FOLDER}"; \
	 echo "  Recarregue o plugin Business Rules Emulator no Obsidian para aplicar a nova build."
