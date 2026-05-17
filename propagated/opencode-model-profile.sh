#!/usr/bin/env bash
set -euo pipefail

CONFIG="${OPENCODE_CONFIG:-$HOME/.config/opencode/opencode.jsonc}"

usage() {
  cat <<USAGE
Usage:
  bash $(basename "$0") status
  bash $(basename "$0") sustainable-go
  bash $(basename "$0") quality-go
  bash $(basename "$0") hard-go
  bash $(basename "$0") free

Profiles:
  sustainable-go  opencode-go/deepseek-v4-flash
  quality-go      opencode-go/deepseek-v4-pro
  hard-go         opencode-go/deepseek-v4-pro
  free            opencode/minimax-m2.5-free

Set OPENCODE_CONFIG to target a different config file.
USAGE
}

profile="${1:-status}"

case "$profile" in
  status) target="" ;;
  sustainable-go) target="opencode-go/deepseek-v4-flash" ;;
  quality-go|hard-go) target="opencode-go/deepseek-v4-pro" ;;
  free) target="opencode/minimax-m2.5-free" ;;
  -h|--help|help) usage; exit 0 ;;
  *) echo "Unknown profile: $profile" >&2; usage >&2; exit 2 ;;
esac

if [[ ! -f "$CONFIG" ]]; then
  echo "OpenCode config not found: $CONFIG" >&2
  exit 1
fi

if [[ "$profile" == "status" ]]; then
  python3 - "$CONFIG" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
print(f"Config: {path}")
print(f"Default: {data.get('model', '<unset>')}")
for name, agent in sorted(data.get("agent", {}).items()):
    if isinstance(agent, dict) and agent.get("model"):
        print(f"Agent {name}: {agent['model']}")
PY
  exit 0
fi

backup="$CONFIG.bak-$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG" "$backup"

python3 - "$CONFIG" "$target" <<'PY'
import json, sys
path, target = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    data = json.load(f)

provider, model = target.split("/", 1)
providers = data.setdefault("provider", {})
models = providers.setdefault(provider, {}).setdefault("models", {})
models.setdefault(model, {})

data["model"] = target
for agent in data.get("agent", {}).values():
    if isinstance(agent, dict) and "model" in agent:
        agent["model"] = target

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

python3 -m json.tool "$CONFIG" >/dev/null
echo "Profile: $profile"
echo "Model: $target"
echo "Config: $CONFIG"
echo "Backup: $backup"
