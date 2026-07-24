#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
OVERLAY="$SCRIPT_DIR/../overlays/local"

echo "=== AgentHub Local Deployment (minikube) ==="

# 1. Ensure minikube is running
if ! minikube status --format='{{.Host}}' 2>/dev/null | grep -q Running; then
    echo "Starting minikube..."
    minikube start --driver="${MINIKUBE_DRIVER:-docker}"
else
    echo "minikube is running."
fi

# 2. Create ephemeral, purpose-separated local secrets through stdin. Values
# never enter argv or a tracked/on-disk manifest.
DATA_ENCRYPTION_KEY="$(openssl rand -hex 32)"
TOKEN_KEY="$(openssl rand -hex 32)"
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: agenthub-secrets
type: Opaque
stringData:
  DATABASE_URL: postgresql://agenthub:agenthub@agenthub-postgres:5432/agenthub
  AGENTHUB_DATA_ENCRYPTION_KEY_VERSION: "1"
  AGENTHUB_DATA_ENCRYPTION_KEYS: '{"1":"$DATA_ENCRYPTION_KEY"}'
  AGENTHUB_TOKEN_KEY_VERSION: "1"
  AGENTHUB_TOKEN_KEYS: '{"1":"$TOKEN_KEY"}'
  S3_HOST: agenthub-minio
  S3_PORT: "9000"
  S3_USE_SSL: "false"
  S3_ACCESS_KEY: minioadmin
  S3_SECRET_KEY: minioadmin
  S3_BUCKET: agenthub
EOF
unset DATA_ENCRYPTION_KEY TOKEN_KEY

# 3. Build on the host, then load and verify the exact image inside minikube.
echo "Building agenthub-server:local image..."
docker build -t agenthub-server:local -f "$REPO_ROOT/Dockerfile.server" "$REPO_ROOT"
docker build --target migration -t agenthub-server-migration:local -f "$REPO_ROOT/Dockerfile.server" "$REPO_ROOT"
minikube image load agenthub-server:local
minikube image load agenthub-server-migration:local
minikube image ls | grep -q '^docker.io/library/agenthub-server:local$'
minikube image ls | grep -q '^docker.io/library/agenthub-server-migration:local$'

# 4. Run prisma migrations inside a temporary pod
echo "Running database migrations..."
kubectl kustomize "$OVERLAY" | kubectl apply -f -

echo "Waiting for postgres to be ready..."
kubectl wait --for=condition=available deployment/agenthub-postgres --timeout=120s

# Run migrations via a one-shot job
kubectl run agenthub-migrate --rm -i --restart=Never \
    --image=agenthub-server-migration:local \
    --image-pull-policy=Never \
    --env="DATABASE_URL=postgresql://agenthub:agenthub@agenthub-postgres:5432/agenthub" \
    -- sh -c "/repo/packages/agenthub-server/node_modules/.bin/prisma migrate deploy --schema=/repo/packages/agenthub-server/prisma/schema.prisma"

# 5. Restart server pods to pick up fresh image
echo "Restarting server pods..."
kubectl rollout restart deployment/agenthub-server
kubectl rollout status deployment/agenthub-server --timeout=120s

# 6. Print status
echo ""
echo "=== Deployed ==="
kubectl get pods
echo ""
echo "Server replicas: $(kubectl get deployment agenthub-server -o jsonpath='{.spec.replicas}')"
echo ""
echo "To access the server:"
echo "  kubectl port-forward svc/agenthub-server 13017:3000"
echo ""
echo "To view logs from both pods:"
echo "  kubectl logs -l app=agenthub-server --all-containers -f"
echo ""
echo "To test cross-process events, connect WebSocket clients"
echo "and verify events route between pods."
